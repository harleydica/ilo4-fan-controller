import type { NextApiRequest, NextApiResponse } from "next";

import { applyCpuFanCurve } from "../../../lib/iloClient";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    try {
        const result = await applyCpuFanCurve();
        return res.status(200).json({ message: "ok", ...result });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to apply fan curve";
        return res.status(400).json({ message });
    }
};

export default handler;
