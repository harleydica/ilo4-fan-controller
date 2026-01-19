export interface TemperatureObject {
    Name?: string;
    ReadingCelsius?: number;
    Status?: {
        Health?: string;
        State?: string;
    };
    UpperThresholdNonCritical?: number;
    UpperThresholdCritical?: number;
    UpperThresholdFatal?: number;
}
