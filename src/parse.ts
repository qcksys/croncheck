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

export type CronExpression = Record<FieldType, CronMatch>;

export type ParsedCronExpression =
	| {
			success: true;
			pattern: string;
			expression: CronExpression;
	  }
	| {
			success: false;
			pattern: string;
			error: string;
	  };

const VAL_LAST = "l";
const VAL_ANY = "*";
const VAL_RANGE = "-";
const VAL_STEP = "/";
const VAL_SEPARATOR = ",";

const PREDEFINED_EXPRESSIONS: Record<string, string> = {
	"@yearly": "0 0 1 1 *",
	"@monthly": "0 0 1 * *",
	"@weekly": "0 0 * * 0",
	"@daily": "0 0 * * *",
	"@hourly": "0 * * * *",
	"@minutely": "* * * * *",
};

export interface FieldInfo {
	min: number;
	max: number;
	alias?: Record<string, number>;
}

export type FieldType =
	| "minute"
	| "hour"
	| "day_of_month"
	| "month"
	| "day_of_week";

export const FIELD_INFO: Record<FieldType, FieldInfo> = {
	minute: { min: 0, max: 59 },
	hour: { min: 0, max: 23 },
	day_of_month: { min: 1, max: 31 },
	month: {
		min: 1,
		max: 12,
		alias: {
			jan: 1,
			feb: 2,
			mar: 3,
			apr: 4,
			may: 5,
			jun: 6,
			jul: 7,
			aug: 8,
			sep: 9,
			oct: 10,
			nov: 11,
			dec: 12,
		},
	},
	day_of_week: {
		min: 0,
		max: 7,
		alias: {
			sun: 0,
			mon: 1,
			tue: 2,
			wed: 3,
			thu: 4,
			fri: 5,
			sat: 6,
		},
	},
};

export const CronFields: FieldType[] = [
	"minute",
	"hour",
	"day_of_month",
	"month",
	"day_of_week",
];

export function splitExpression(expression: string): string[] {
	return expression
		.split(/\s+/)
		.map((part) => part.trim())
		.filter((part) => part);
}

function parseMinute(minute: string) {
	const parts = minute.split(VAL_SEPARATOR);
	const result: CronMatch = {};
	for (const part of parts) {
		if (result.all) {
			break;
		}
		switch (true) {
			case part === VAL_ANY:
				result.all = true;
				break;
		}
	}
	return result;
}

function parseHour(hour: string) {
	const result: CronMatch = {};
	return result;
}

function parseDayOfMonth(dayOfMonth: string) {
	const result: CronMatch = {};
	return result;
}

function parseMonth(month: string) {
	const result: CronMatch = {};
	return result;
}

function parseDayOfWeek(dayOfWeek: string) {
	const result: CronMatch = {};
	return result;
}

export function parse(expression: string): ParsedCronExpression {
	if (!expression) {
		return {
			success: false,
			pattern: expression,
			error: "Empty expression",
		};
	}

	const parts = splitExpression(expression);

	if (parts.length !== 5) {
		return {
			success: false,
			pattern: expression,
			error: "Invalid expression (must have 5 parts separated by whitespace)",
		};
	}

	try {
		return {
			success: true,
			pattern: expression,
			expression: {
				minute: parseMinute(parts[0]),
				hour: parseHour(parts[1]),
				day_of_month: parseDayOfMonth(parts[2]),
				month: parseMonth(parts[3]),
				day_of_week: parseDayOfWeek(parts[4]),
			},
		};
	} catch (e: unknown) {
		if (e instanceof Error) {
			return {
				success: false,
				pattern: expression,
				error: `Parse error ${e.message}`,
			};
		}
		return {
			success: false,
			pattern: expression,
			error: "Parse error (unknown error)",
		};
	}
}
