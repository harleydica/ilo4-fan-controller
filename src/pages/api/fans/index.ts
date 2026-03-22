import type { NextApiRequest, NextApiResponse } from "next";

import { getFanControlMode, setFanControlMode } from "../../../lib/fanMode";
import { fetchFans, setFanSpeeds } from "../../../lib/iloClient";
import {
    changeFanSpeedSchema,
    type ChangeFanSpeedInput,
} from "../../../schemas/changeFanSpeed";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === "GET") {
        try {
            const fans = await fetchFans();
            const mode = await getFanControlMode();
            return res.status(200).json({ fans, mode });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return res.status(500).json({ message });
        }
    }

    if (req.method === "POST") {
        try {
            const body: ChangeFanSpeedInput = await changeFanSpeedSchema.validate(req.body, {
                abortEarly: false,
                stripUnknown: true,
            });
            await setFanSpeeds(body);
            await setFanControlMode("manual");
            return res.status(200).json({ message: "ok", mode: "manual" });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid request";
            return res.status(400).json({ message });
        }
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
};

export default handler;
