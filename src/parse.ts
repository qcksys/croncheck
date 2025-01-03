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
const VAL_WEEKDAY = "w";
const VAL_NTH = "#";
const VAL_OMIT = "?";

const PREDEFINED_EXPRESSIONS: Record<string, string> = {
	"@yearly": "0 0 1 1 *",
	"@monthly": "0 0 1 * *",
	"@weekly": "0 0 ? * 0",
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
	// Handle predefined expressions
	if (expression.startsWith("@")) {
		const predefined = PREDEFINED_EXPRESSIONS[expression.toLowerCase()];
		if (predefined) {
			return splitExpression(predefined);
		}
	}

	return expression
		.split(/\s+/)
		.map((part) => part.trim())
		.filter((part) => part);
}

function validateRange(value: number, field: FieldType): void {
	const info = FIELD_INFO[field];
	if (value < info.min || value > info.max) {
		throw new Error(
			`Value [${value}] out of range for field [${field}]. It must be less than or equals to [${info.max}].`,
		);
	}
}

function parseValue(value: string, field: FieldType): number {
	const info = FIELD_INFO[field];
	const cleanValue = value.toLowerCase();

	// Handle aliases
	if (info.alias && cleanValue in info.alias) {
		return info.alias[cleanValue];
	}

	// Handle numeric values
	const numValue = Number.parseInt(value, 10);
	if (Number.isNaN(numValue)) {
		throw new Error(`Invalid numeric value [${value}] for field [${field}]`);
	}

	// Special handling for day_of_week where 7 is treated as 0 (Sunday)
	if (field === "day_of_week" && numValue === 7) {
		return 0;
	}

	validateRange(numValue, field);
	return numValue;
}

function parseStep(part: string, field: FieldType): CronStep {
	const [range, stepStr] = part.split(VAL_STEP);
	const step = Number.parseInt(stepStr, 10);

	if (range === VAL_ANY) {
		return {
			from: FIELD_INFO[field].min,
			to: FIELD_INFO[field].max,
			step,
		};
	}

	const [fromStr, toStr] = range.split(VAL_RANGE);
	const from = parseValue(fromStr, field);
	const to = parseValue(toStr || FIELD_INFO[field].max.toString(), field);

	return { from, to, step };
}

function parseRange(part: string, field: FieldType): CronRange {
	const [fromStr, toStr] = part.split(VAL_RANGE);
	const from = parseValue(fromStr, field);
	const to = parseValue(toStr, field);
	return { from, to };
}

function addUniqueValues(values: number[], newValues: number[]) {
	for (const value of newValues) {
		if (!values.includes(value)) {
			values.push(value);
		}
	}
	return values.sort((a, b) => a - b);
}

function addUniqueRanges(ranges: CronRange[], newRanges: CronRange[]) {
	const existingRanges = new Set(ranges.map((r) => `${r.from}-${r.to}`));
	for (const range of newRanges) {
		const key = `${range.from}-${range.to}`;
		if (!existingRanges.has(key)) {
			ranges.push(range);
			existingRanges.add(key);
		}
	}
	return ranges;
}

function parseField(part: string, field: FieldType): CronMatch {
	const result: CronMatch = {};

	// Handle special values first
	if (part === VAL_ANY) {
		result.all = true;
		return result;
	}

	if (part === VAL_OMIT) {
		result.omit = true;
		return result;
	}

	const parts = part.toLowerCase().split(VAL_SEPARATOR);

	for (const subPart of parts) {
		// Handle last day of month
		if (subPart === VAL_LAST && field === "day_of_month") {
			result.lastDay = true;
			continue;
		}

		// Handle last weekday of month
		if (subPart === `${VAL_LAST}${VAL_WEEKDAY}` && field === "day_of_month") {
			result.lastWeekday = true;
			continue;
		}

		// Handle nearest weekday
		if (subPart.endsWith(VAL_WEEKDAY) && field === "day_of_month") {
			const day = Number.parseInt(subPart.slice(0, -1), 10);
			result.nearestWeekdays = result.nearestWeekdays || [];
			result.nearestWeekdays.push(day);
			continue;
		}

		// Handle last day of week in month
		if (subPart.endsWith(VAL_LAST) && field === "day_of_week") {
			const day = parseValue(subPart.slice(0, -1), field);
			result.lastDays = result.lastDays || [];
			result.lastDays.push(day);
			continue;
		}

		// Handle nth day of week
		if (subPart.includes(VAL_NTH) && field === "day_of_week") {
			const [dayStr, instanceStr] = subPart.split(VAL_NTH);
			const day = parseValue(dayStr, field);
			const instance = Number.parseInt(instanceStr, 10);
			result.nthDays = result.nthDays || [];
			result.nthDays.push({ day_of_week: day, instance });
			continue;
		}

		// Handle steps
		if (subPart.includes(VAL_STEP)) {
			result.steps = result.steps || [];
			result.steps.push(parseStep(subPart, field));
			continue;
		}

		// Handle ranges
		if (subPart.includes(VAL_RANGE)) {
			result.ranges = result.ranges || [];
			addUniqueRanges(result.ranges, [parseRange(subPart, field)]);
			continue;
		}

		// Handle single values
		result.values = result.values || [];
		addUniqueValues(result.values, [parseValue(subPart, field)]);
	}

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

	if (parts.length < 4 || parts.length > 5) {
		return {
			success: false,
			pattern: expression,
			error: `Invalid cron expression [${expression}]. Expected [4 to 5] fields but found [${parts.length}] fields.`,
		};
	}

	try {
		const result: CronExpression = {
			minute: parseField(parts[0], "minute"),
			hour: parseField(parts[1], "hour"),
			day_of_month: parseField(parts[2], "day_of_month"),
			month: parseField(parts[3], "month"),
			day_of_week: parseField(parts[4], "day_of_week"),
		};

		return {
			success: true,
			pattern: expression,
			expression: result,
		};
	} catch (e: unknown) {
		if (e instanceof Error) {
			return {
				success: false,
				pattern: expression,
				error: `Invalid cron expression [${expression}]. ${e.message}`,
			};
		}
		return {
			success: false,
			pattern: expression,
			error: "Parse error (unknown error)",
		};
	}
}
