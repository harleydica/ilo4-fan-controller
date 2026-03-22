import type { NextApiRequest, NextApiResponse } from "next";

import {
    getFanControlMode,
    setFanControlMode,
    type FanControlMode,
} from "../../../lib/fanMode";

const isFanControlMode = (value: unknown): value is FanControlMode =>
    value === "auto" || value === "manual";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === "GET") {
        try {
            const mode = await getFanControlMode();
            return res.status(200).json({ mode });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unable to read fan mode";
            return res.status(500).json({ message });
        }
    }

    if (req.method === "POST") {
        try {
            const mode = req.body?.mode;

            if (!isFanControlMode(mode)) {
                return res.status(400).json({ message: "mode must be auto or manual" });
            }

            await setFanControlMode(mode);
            return res.status(200).json({ message: "ok", mode });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unable to update fan mode";
            return res.status(400).json({ message });
        }
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
};

export default handler;
