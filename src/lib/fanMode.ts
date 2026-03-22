import fs from "fs/promises";
import os from "os";
import path from "path";

export type FanControlMode = "auto" | "manual";

const DEFAULT_MODE: FanControlMode = "auto";
let memoryMode: FanControlMode = DEFAULT_MODE;

const resolveModeFile = (): string => {
    const fromEnv = process.env.FAN_MODE_FILE?.trim();

    if (!fromEnv || fromEnv === '""' || fromEnv === "''") {
        return path.join(os.tmpdir(), "fan-control-mode.json");
    }

    return fromEnv;
};

const isFanControlMode = (value: unknown): value is FanControlMode =>
    value === "auto" || value === "manual";

export const getFanControlMode = async (): Promise<FanControlMode> => {
    const modeFile = resolveModeFile();

    try {
        const fileContent = await fs.readFile(modeFile, "utf-8");
        const parsed = JSON.parse(fileContent) as { mode?: unknown };

        if (isFanControlMode(parsed.mode)) {
            memoryMode = parsed.mode;
            return parsed.mode;
        }

        return memoryMode;
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        if (code === "ENOENT" || code === "EACCES") {
            return memoryMode;
        }

        return memoryMode;
    }
};

export const setFanControlMode = async (
    mode: FanControlMode
): Promise<void> => {
    memoryMode = mode;
    const modeFile = resolveModeFile();
    const modeDir = path.dirname(modeFile);

    try {
        if (modeDir && modeDir !== ".") {
            await fs.mkdir(modeDir, { recursive: true });
        }

        await fs.writeFile(
            modeFile,
            JSON.stringify(
                {
                    mode,
                    updatedAt: new Date().toISOString(),
                },
                null,
                2
            ),
            "utf-8"
        );
    } catch {
        // Keep serving mode from memory when filesystem is read-only.
    }
};
