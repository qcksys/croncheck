export type CronExpression = Record<FieldType, CronMatch>;

export type CronRange = {
    from: number;
    to: number;
};

export type CronStep = {
    from: number;
    to: number;
    step: number;
};

export type CronNth = {
    day_of_week: number;
    instance: number;
};

export type CronMatch = {
    all?: boolean;
    omit?: boolean;
    ranges?: CronRange[];
    steps?: CronStep[];
    nthDays?: CronNth[];
    values?: number[];
    lastDay?: boolean;
    lastDays?: number[];
    lastWeekday?: boolean;
    nearestWeekdays?: number[];
};

export type FieldType =
    | "minute"
    | "hour"
    | "day_of_month"
    | "month"
    | "day_of_week";

export type MatchOptions = {
    timezone?: string;
    startAt?: Date;
    endAt?: Date;
    matchCount?: number;
    maxLoopCount?: number;
    matchValidator?: (input: Date) => boolean;
};

export type ParsedCronExpression = {
    success: boolean;
    pattern: string;
    expression?: CronExpression;
    error?: string;
};
