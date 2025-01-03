import { TZDate } from "@date-fns/tz";
import {
	addDays,
	addMinutes,
	endOfMonth,
	format,
	getDate,
	getDay,
	getHours,
	getMinutes,
	getMonth,
	isWeekend,
	startOfMonth,
} from "date-fns";
import { enUS } from "date-fns/locale";
import type {
	CronExpression,
	CronMatch,
	FieldType,
	MatchOptions,
} from "./types";

export function getFutureMatches(
	expression: CronExpression,
	options: MatchOptions = {},
): string[] {
	const {
		startAt = "2020-01-01T00:00:00Z",
		matchCount = 2,
		timezone,
		formatInTimezone = false,
		maxLoopCount = 1000,
		matchValidator,
	} = options;

	const matches: string[] = [];
	let currentDate = timezone
		? new TZDate(new Date(startAt), timezone)
		: new Date(startAt);
	let loopCount = 0;

	while (matches.length < matchCount && loopCount < maxLoopCount) {
		loopCount++;

		if (isTimeMatch(expression, currentDate)) {
			const formattedDate = formatDate(currentDate, timezone, formatInTimezone);
			if (!matchValidator || matchValidator(formattedDate)) {
				matches.push(formattedDate);
			}
		}
		currentDate = addMinutes(currentDate, 1);
	}

	return matches;
}

export function isTimeMatch(
	expression: CronExpression,
	date: Date,
): boolean {
	const fields: [FieldType, number][] = [
		["minute", getMinutes(date)],
		["hour", getHours(date)],
		["day_of_month", getDate(date)],
		["month", getMonth(date) + 1],
		["day_of_week", getDay(date) || 7], // Convert Sunday from 0 to 7
	];

	return fields.every(([field, value]) =>
		isFieldMatch(value, expression[field], field, date),
	);
}

function isFieldMatch(
	value: number,
	match: CronMatch,
	field: FieldType,
	date: Date | TZDate,
): boolean {
	if (match.omit) return true;
	if (match.all) return true;

	if (match.values?.includes(value)) return true;

	if (match.ranges?.some((range) => value >= range.from && value <= range.to))
		return true;

	if (
		match.steps?.some((step) => {
			const normalizedValue = (value - step.from) % (step.to - step.from + 1);
			return normalizedValue % step.step === 0;
		})
	)
		return true;

	if (field === "day_of_month") {
		if (match.lastDay && value === getDate(endOfMonth(date))) return true;
		if (match.lastWeekday && value === getLastWeekdayOfMonth(date)) return true;
		if (match.nearestWeekdays?.includes(value)) {
			const nearest = getNearestWeekday(date);
			return value === nearest;
		}
	}

	if (field === "day_of_week" && match.nthDays?.length) {
		return match.nthDays.some((nth) => {
			const nthDate = getNthDayOfMonth(date, nth.day_of_week, nth.instance);
			return getDate(date) === nthDate;
		});
	}

	return false;
}

function formatDate(
	date: Date | TZDate,
	timezone?: string,
	formatInTimezone = false,
): string {
	if (formatInTimezone && timezone) {
		// If date is already a TZDate with the correct timezone, format it directly
		if (date instanceof TZDate && date.timeZone === timezone) {
			return format(date, "yyyy-MM-dd'T'HH:mm:ssxxx", { locale: enUS });
		}
		// Otherwise, create a new TZDate with the desired timezone
		const tzDate = new TZDate(date, timezone);
		return format(tzDate, "yyyy-MM-dd'T'HH:mm:ssxxx", { locale: enUS });
	}
	return format(date, "yyyy-MM-dd'T'HH:mm:ss'Z'", { locale: enUS });
}

function getLastWeekdayOfMonth(date: Date | TZDate): number {
	let lastDay = endOfMonth(date);
	while (isWeekend(lastDay)) {
		lastDay = addDays(lastDay, -1);
	}
	return getDate(lastDay);
}

function getNearestWeekday(date: Date | TZDate): number {
	const day = getDate(date);
	const dayOfWeek = getDay(date);

	if (dayOfWeek === 0) return day + 1; // If Sunday, move to Monday
	if (dayOfWeek === 6) return day - 1; // If Saturday, move to Friday
	return day;
}

function getNthDayOfMonth(
	date: Date | TZDate,
	dayOfWeek: number,
	instance: number,
): number {
	const firstOfMonth = startOfMonth(date);
	const firstDayOfWeek = getDay(firstOfMonth);
	return 1 + ((dayOfWeek - firstDayOfWeek + 7) % 7) + (instance - 1) * 7;
}
