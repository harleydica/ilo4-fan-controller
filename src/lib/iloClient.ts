import base64 from "base-64";
import { Agent as UndiciAgent } from "undici";
import { NodeSSH } from "node-ssh";
import { changeFanSpeedSchema, ChangeFanSpeedInput } from "../schemas/changeFanSpeed";
import type { FanObject } from "../types/Fan";

const httpsDispatcher = new UndiciAgent({
    connect: {
        rejectUnauthorized: false,
    },
});

const getIloHost = (): string =>
    (process.env.ILO_HOST ?? "").replace(/^https?:\/\//, "");

const ensureEnv = () => {
    const missing = [
        { key: "ILO_HOST", value: process.env.ILO_HOST },
        { key: "ILO_USERNAME", value: process.env.ILO_USERNAME },
        { key: "ILO_PASSWORD", value: process.env.ILO_PASSWORD },
    ]
        .filter((entry) => !entry.value)
        .map((entry) => entry.key);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
};

export type IloTemperature = {
    Name?: string;
    ReadingCelsius?: number;
    Status?: { Health?: string; State?: string };
    UpperThresholdNonCritical?: number;
    UpperThresholdCritical?: number;
    UpperThresholdFatal?: number;
};

type IloThermalPayload = {
    Fans?: FanObject[];
    Temperatures?: IloTemperature[];
};

const fetchThermalPayload = async (): Promise<IloThermalPayload> => {
    ensureEnv();

    const requestInit: RequestInit & { dispatcher: UndiciAgent } = {
        headers: {
            Authorization: `Basic ${base64.encode(
                `${process.env.ILO_USERNAME}:${process.env.ILO_PASSWORD}`
            )}`,
        },
        dispatcher: httpsDispatcher,
    };

    const response = await fetch(
        `https://${process.env.ILO_HOST}/redfish/v1/chassis/1/Thermal`,
        requestInit
    );

    if (!response.ok) {
        throw new Error(`Unable to fetch fan data (${response.status})`);
    }

    return (await response.json()) as IloThermalPayload;
};

export const fetchFans = async (): Promise<FanObject[]> => {
    const payload = await fetchThermalPayload();
    return payload.Fans ?? [];
};

export const fetchTemperatures = async (): Promise<IloTemperature[]> => {
    const payload = await fetchThermalPayload();
    return payload.Temperatures ?? [];
};

const findCpuTemp = (temps: IloTemperature[], cpuLabel: string): number | null => {
    const cpu = temps.find((t) =>
        (t.Name ?? "").toLowerCase().includes(cpuLabel.toLowerCase())
    );
    return typeof cpu?.ReadingCelsius === "number" ? cpu.ReadingCelsius : null;
};

const cpuTargetPercent = (temp: number | null): number => {
    if (temp === null) return 20; // fallback idle speed
    if (temp >= 55) return 40;
    if (temp >= 45) return 36;
    if (temp >= 41) return 32;
    if (temp >= 40) return 30;
    return 20;
};

export const createIloSsh = async (): Promise<NodeSSH> => {
    ensureEnv();
    const iloHost = getIloHost();
    const ssh = new NodeSSH();

    await ssh.connect({
        host: iloHost,
        username: process.env.ILO_USERNAME,
        password: process.env.ILO_PASSWORD,
        algorithms: {
            kex: ["diffie-hellman-group14-sha1"],
        },
    });

    return ssh;
};

export const disposeIloSsh = (ssh?: NodeSSH | null) => {
    try {
        ssh?.dispose();
    } catch {
        /* ignore */
    }
};

const withSshConnection = async (callback: (ssh: NodeSSH) => Promise<void>) => {
    const ssh = await createIloSsh();

    try {
        await callback(ssh);
    } finally {
        disposeIloSsh(ssh);
    }
};

export const unlockFans = async (): Promise<void> =>
    withSshConnection(async (ssh) => {
        await ssh.execCommand("fan p global unlock");
    });

export const setFanSpeeds = async (payload: ChangeFanSpeedInput): Promise<void> => {
    const validated = await changeFanSpeedSchema.validate(payload, {
        abortEarly: false,
        stripUnknown: true,
    });

    await withSshConnection(async (ssh) => {
        for (let i = 0; i < validated.fans.length; i++) {
            const speed = Math.round((validated.fans[i] / 100) * 255);
            await ssh.execCommand(`fan p ${i} lock ${speed}`);
        }
    });
};

const determineTargetPercent = (maxTemp: number): number => {
    // Simple curve: raise speed as temps climb
    const curve = [
        { upTo: 60, percent: 20 },
        { upTo: 70, percent: 25 },
        { upTo: 80, percent: 35 },
        { upTo: 90, percent: 50 },
        { upTo: Infinity, percent: 75 },
    ];

    const match = curve.find((rule) => maxTemp <= rule.upTo);
    const target = match ? match.percent : 35;
    return Math.max(10, Math.min(100, target));
};

type CpuFanCurveResult = {
    fanPercents: number[];
    cpu1Temp: number | null;
    cpu2Temp: number | null;
};

export const applyCpuFanCurve = async (session?: NodeSSH): Promise<CpuFanCurveResult> => {
    const payload = await fetchThermalPayload();
    const temps = payload.Temperatures ?? [];
    const fans = payload.Fans ?? [];
    const fanCount = fans.length;

    const cpu1Temp = findCpuTemp(temps, "cpu 1");
    const cpu2Temp = findCpuTemp(temps, "cpu 2");

    const cpu1Target = cpuTargetPercent(cpu1Temp);
    const cpu2Target = cpuTargetPercent(cpu2Temp);

    console.log(`[Fan Curve] CPU 1: ${cpu1Temp !== null ? cpu1Temp + "°C" : "N/A"} → ${cpu1Target}%`);
    console.log(`[Fan Curve] CPU 2: ${cpu2Temp !== null ? cpu2Temp + "°C" : "N/A"} → ${cpu2Target}%`);

    const cpu2Fans = [0, 1, 2, 3]; // CPU 2 → fan 1-4
    const cpu1Fans = [3, 4, 5, 6]; // CPU 1 → fan 4-7 (fan 4 overlaps)

    const fanPercents = Array.from({ length: fanCount }, () => 25);

    const applyCurve = (fanIndexes: number[], percent: number) => {
        for (const idx of fanIndexes) {
            if (idx >= fanCount) continue;
            fanPercents[idx] = Math.max(fanPercents[idx], percent);
        }
    };

    applyCurve(cpu1Fans, cpu1Target);
    applyCurve(cpu2Fans, cpu2Target);

    // Get current speeds and only update changed fans
    const currentSpeeds = fans.map(f => f.CurrentReading);
    const fansToUpdate: Array<{ index: number; percent: number; current: number }> = [];

    for (let i = 0; i < fanCount; i++) {
        if (currentSpeeds[i] !== fanPercents[i]) {
            fansToUpdate.push({ index: i, percent: fanPercents[i], current: currentSpeeds[i] });
        }
    }

    if (fansToUpdate.length === 0) {
        console.log(`[Fan Curve] ✓ All fans already at target speeds - no changes needed`);
    } else {
        console.log(`[Fan Curve] Updating ${fansToUpdate.length} fan(s):`);
        fansToUpdate.forEach(({ index, percent, current }) => {
            console.log(`   Fan ${index + 1}: ${current}% → ${percent}%`);
        });

        const runWith = async (ssh: NodeSSH) => {
            for (const { index, percent } of fansToUpdate) {
                const speed = Math.round((percent / 100) * 255);
                await ssh.execCommand(`fan p ${index} lock ${speed}`);
                console.log(`   ✓ Fan ${index + 1} set to ${percent}%`);
            }
        };

        if (session) {
            await runWith(session);
        } else {
            await withSshConnection(runWith);
        }
    }

    return { fanPercents, cpu1Temp, cpu2Temp };
};