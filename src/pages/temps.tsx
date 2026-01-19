import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useMemo } from "react";
import { Fade } from "react-awesome-reveal";

import { fetchTemperatures } from "../lib/iloClient";
import type { TemperatureObject } from "../types/Temperature";

interface Props {
    temps: TemperatureObject[];
    fail?: boolean;
}

const TempsPage = ({ temps, fail }: Props): JSX.Element => {
    if (fail)
        return (
            <div className="h-screen px-2 pt-4 text-white bg-gray-800 sm:flex sm:justify-center sm:items-center sm:pt-0">
                <div className="text-center">
                    <Fade direction="up" triggerOnce cascade duration={400}>
                        <h1 className="mb-4 text-5xl font-semibold text-red-500">
                            Oops! Couldn&apos;t talk to iLO
                        </h1>
                        <p className="mb-2 text-xl">
                            Check your <span className="font-mono text-yellow-500">environment variables</span> and network access.
                        </p>
                    </Fade>
                </div>
            </div>
        );

    const sortedTemps = useMemo(
        () =>
            [...temps].sort(
                (a, b) => (b.ReadingCelsius ?? -Infinity) - (a.ReadingCelsius ?? -Infinity)
            ),
        [temps]
    );

    return (
        <div className="min-h-screen px-2 pt-4 text-white bg-gray-800 sm:flex sm:justify-center sm:pt-0">
            <Fade direction="left" triggerOnce>
                <div className="container w-full pt-6 pb-4 duration-150 bg-gray-900 border-2 border-gray-700 rounded shadow-xl sm:px-12 sm:max-w-3xl">
                    <div className="flex flex-col items-center justify-center gap-3 mb-6 sm:flex-row sm:gap-4">
                        <div className="flex items-center gap-3">
                            <img src="/ilo-logo.png" alt="iLO" />
                            <h1 className="text-xl font-semibold">iLO Temperature Dashboard</h1>
                        </div>
                        <Link
                            href="/"
                            className="px-4 py-2 text-sm font-semibold duration-150 rounded bg-gray-700 hover:bg-gray-800 text-gray-50"
                        >
                            Back to Fans
                        </Link>
                    </div>
                    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                        {sortedTemps.map((sensor, idx) => (
                            <div
                                key={`${sensor.Name ?? "sensor"}-${idx}`}
                                className="p-4 bg-gray-800 border border-gray-700 rounded shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm text-gray-300">{sensor.Name ?? "Unnamed sensor"}</p>
                                        <p className="mt-1 text-3xl font-semibold">
                                            {typeof sensor.ReadingCelsius === "number"
                                                ? `${sensor.ReadingCelsius}°C`
                                                : "N/A"}
                                        </p>
                                    </div>
                                    <div className="text-right text-sm text-gray-400">
                                        <p>{sensor.Status?.Health ?? "Unknown"}</p>
                                        <p>{sensor.Status?.State ?? ""}</p>
                                    </div>
                                </div>
                                <div className="mt-3 text-xs text-gray-400">
                                    <p>
                                        NonCritical: {sensor.UpperThresholdNonCritical ?? "-"}°C · Critical: {sensor.UpperThresholdCritical ?? "-"}°C · Fatal: {sensor.UpperThresholdFatal ?? "-"}°C
                                    </p>
                                </div>
                            </div>
                        ))}
                        {sortedTemps.length === 0 && (
                            <div className="col-span-full p-4 text-center text-gray-300 bg-gray-800 border border-gray-700 rounded">
                                No temperature sensors reported.
                            </div>
                        )}
                    </div>
                </div>
            </Fade>
        </div>
    );
};

export const getServerSideProps: GetServerSideProps = async () => {
    try {
        const temps = await fetchTemperatures();
        return { props: { temps } };
    } catch (error) {
        return { props: { temps: [], fail: true } };
    }
};

export default TempsPage;
