import fs from "fs/promises";
import os from "os";
import path from "path";

export type FanControlMode = "auto" | "manual";

const MODE_FILE =
    process.env.FAN_MODE_FILE?.trim() ||
    path.join(os.tmpdir(), "fan-control-mode.json");
const DEFAULT_MODE: FanControlMode = "auto";

const isFanControlMode = (value: unknown): value is FanControlMode =>
    value === "auto" || value === "manual";

export const getFanControlMode = async (): Promise<FanControlMode> => {
    try {
        const fileContent = await fs.readFile(MODE_FILE, "utf-8");
        const parsed = JSON.parse(fileContent) as { mode?: unknown };

        return isFanControlMode(parsed.mode) ? parsed.mode : DEFAULT_MODE;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return DEFAULT_MODE;
        }

        throw new Error("Unable to read fan control mode");
    }
};

export const setFanControlMode = async (
    mode: FanControlMode
): Promise<void> => {
    await fs.mkdir(path.dirname(MODE_FILE), { recursive: true });

    await fs.writeFile(
        MODE_FILE,
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
};
