import { TZDate } from "@date-fns/tz";
import {
	addDays,
	addYears,
	endOfMonth,
	getDate,
	getDay,
	getHours,
	getMinutes,
	getMonth,
	isWeekend,
	startOfMonth,
} from "date-fns";
import type {
	CronExpression,
	CronMatch,
	FieldType,
	MatchOptions,
} from "./types";

export function getFutureMatches(
	expression: CronExpression,
	options: MatchOptions = {},
): Date[] {
	const {
		startAt = new Date(),
		matchCount = 2,
		timezone,
		maxLoopCount = 1000,
		matchValidator,
	} = options;

	const matches: Date[] = [];
	let currentDate = new TZDate(new Date(startAt), timezone ? timezone : "UTC");
	let loopCount = 0;

	while (matches.length < matchCount && loopCount < maxLoopCount) {
		loopCount++;

		if (isTimeMatch(expression, currentDate)) {
			if (!matchValidator || matchValidator(currentDate)) {
				matches.push(currentDate);
			}
		}

		// Calculate the next valid date based on cron expression
		currentDate = getNextValidDate(currentDate, expression);
	}

	return matches;
}

function getNextValidDate(
	currentDate: TZDate,
	expression: CronExpression,
): TZDate {
	let nextDate = new TZDate(currentDate);

	// Start by finding the next valid minute
	const currentMinute = getMinutes(currentDate);
	const nextMinute = getNextValidField(
		currentMinute,
		expression.minute,
		0,
		59,
		true,
	);
	if (nextMinute > currentMinute) {
		nextDate.setMinutes(nextMinute);
		return nextDate;
	}

	// If minute wraps around, find the next valid hour
	const currentHour = getHours(currentDate);
	const nextHour = getNextValidField(
		currentHour,
		expression.hour,
		0,
		23,
		false,
	);
	if (nextHour > currentHour) {
		nextDate.setHours(nextHour);
		nextDate.setMinutes(0);
		return nextDate;
	}

	// If hour wraps around, find the next valid day of month
	const currentDay = getDate(currentDate);
	const lastDayOfMonth = getDate(endOfMonth(currentDate));
	const nextDay = getNextValidField(
		currentDay,
		expression.day_of_month,
		1,
		lastDayOfMonth,
		false,
	);
	if (nextDay > currentDay) {
		nextDate = addDays(nextDate, nextDay - currentDay);
		nextDate.setHours(0);
		nextDate.setMinutes(0);
		return nextDate;
	}

	// If day of month wraps around, find the next valid month
	const currentMonth = getMonth(currentDate) + 1; // Months are 0-based in Date
	const nextMonth = getNextValidField(
		currentMonth,
		expression.month,
		1,
		12,
		false,
	);
	if (nextMonth > currentMonth) {
		nextDate.setMonth(nextMonth - 1); // Set month correctly (0-based)
		nextDate.setDate(1);
		nextDate.setHours(0);
		nextDate.setMinutes(0);
		return nextDate;
	}

	return addYears(nextDate, 1);
}

function getNextValidField(
	currentValue: number,
	match: CronMatch,
	min: number,
	max: number,
	wrapAround: boolean,
): number {
	if (match.all) {
		return currentValue + 1;
	}

	if (match.values && match.values[0] !== undefined) {
		const nextValue = match.values.find((v) => v > currentValue);
		return nextValue !== undefined ? nextValue : match.values[0];
	}

	if (match.ranges && match.ranges[0] !== undefined) {
		for (const range of match.ranges) {
			if (currentValue < range.from) {
				return range.from;
			}
			if (currentValue <= range.to) {
				return range.from;
			}
		}
		return match.ranges[0].from;
	}

	if (match.steps && match.steps[0] !== undefined) {
		const step = match.steps[0];
		if (currentValue < step.from) {
			return step.from;
		}
		const steps = Math.floor((currentValue - step.from) / step.step);
		return step.from + (steps + 1) * step.step;
	}

	return currentValue + 1;
}

export function isTimeMatch(expression: CronExpression, date: TZDate): boolean {
	const fields: [FieldType, number][] = [
		["minute", getMinutes(date)],
		["hour", getHours(date)],
		["day_of_month", getDate(date)],
		["month", getMonth(date) + 1],
		["day_of_week", getDay(date) || 7], // Convert Sunday from 0 to 7
	];

	// Handle day of month and day of week logic per #48
	const monthMatch = expression.month;
	const dayOfMonthMatch = expression.day_of_month;
	const dayOfWeekMatch = expression.day_of_week;

	// If both day fields are asterisks, match any day
	const isDayOfMonthAsterisk = dayOfMonthMatch.all && !dayOfMonthMatch.omit;
	const isDayOfWeekAsterisk = dayOfWeekMatch.all && !dayOfWeekMatch.omit;

	if (isDayOfMonthAsterisk && isDayOfWeekAsterisk) {
		// If both are asterisks, check other fields
		return fields
			.filter(([field]) => field !== "day_of_week" && field !== "day_of_month")
			.every(([field, value]) =>
				isFieldMatch(value, expression[field], field, date),
			);
	}

	// If day of week is asterisk, use day of month
	if (isDayOfWeekAsterisk) {
		return fields
			.filter(([field]) => field !== "day_of_week")
			.every(([field, value]) =>
				isFieldMatch(value, expression[field], field, date),
			);
	}

	// If day of month is asterisk, use day of week
	if (isDayOfMonthAsterisk) {
		return fields
			.filter(([field]) => field !== "day_of_month")
			.every(([field, value]) =>
				isFieldMatch(value, expression[field], field, date),
			);
	}

	// If neither is asterisk, match either condition
	const dayOfMonthMatches = isFieldMatch(
		getMinutes(date),
		dayOfMonthMatch,
		"day_of_month",
		date,
	);
	const dayOfWeekMatches = isFieldMatch(
		getDay(date) || 7,
		dayOfWeekMatch,
		"day_of_week",
		date,
	);

	return (
		fields
			.filter(([field]) => field !== "day_of_week" && field !== "day_of_month")
			.every(([field, value]) =>
				isFieldMatch(value, expression[field], field, date),
			) &&
		(dayOfMonthMatches || dayOfWeekMatches)
	);
}

function isFieldMatch(
	value: number,
	match: CronMatch,
	field: FieldType,
	date: Date,
): boolean {
	if (match.omit) return true;
	if (match.all) return true;

	if (match.values?.includes(value)) return true;

	if (match.ranges?.some((range) => value >= range.from && value <= range.to))
		return true;

	if (
		match.steps?.some((step) => {
			if (step.from === 0 && value === 0) return true;
			const normalizedValue = value - step.from;
			return normalizedValue >= 0 && normalizedValue % step.step === 0;
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

function getLastWeekdayOfMonth(date: Date): number {
	let lastDay = endOfMonth(date);
	while (isWeekend(lastDay)) {
		lastDay = addDays(lastDay, -1);
	}
	return getDate(lastDay);
}

function getNearestWeekday(date: Date): number {
	const day = getDate(date);
	const dayOfWeek = getDay(date);

	if (dayOfWeek === 0) return day + 1; // If Sunday, move to Monday
	if (dayOfWeek === 6) return day - 1; // If Saturday, move to Friday
	return day;
}

function getNthDayOfMonth(
	date: Date,
	dayOfWeek: number,
	instance: number,
): number {
	const firstOfMonth = startOfMonth(date);
	const firstDayOfWeek = getDay(firstOfMonth);
	return 1 + ((dayOfWeek - firstDayOfWeek + 7) % 7) + (instance - 1) * 7;
}
