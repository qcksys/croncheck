import { TZDate } from "@date-fns/tz";
import {
	addDays,
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
	const tz = timezone || "UTC";
	let currentDate = new TZDate(new Date(startAt), tz);
	let loopCount = 0;

	while (matches.length < matchCount && loopCount < maxLoopCount) {
		loopCount++;

		if (isTimeMatch(expression, currentDate)) {
			if (!matchValidator || matchValidator(currentDate)) {
				// Create a new Date with the exact same UTC time
				const matchDate = new Date(currentDate.toISOString());
				matches.push(matchDate);
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
	// Clone the date to avoid mutating the original
	let nextDate = new TZDate(currentDate);

	// Add one minute to start with
	nextDate.setMinutes(nextDate.getMinutes() + 1);
	nextDate.setSeconds(0);
	nextDate.setMilliseconds(0);

	// Fast path for "* * * *" (every minute)
	const isEveryMinute =
		expression.minute.all &&
		expression.hour.all &&
		(expression.day_of_month.all || expression.day_of_month.omit) &&
		expression.month.all &&
		(expression.day_of_week.all || expression.day_of_week.omit);

	if (isEveryMinute) {
		return nextDate;
	}

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
	if (nextMinute < currentMinute) {
		// We've wrapped around to the next hour
		nextDate.setHours(nextDate.getHours() + 1);
		nextDate.setMinutes(nextMinute);
		return nextDate;
	}

	// If minute didn't change or we need to move to the next hour
	const currentHour = getHours(currentDate);
	const nextHour = getNextValidField(currentHour, expression.hour, 0, 23, true);

	if (nextHour > currentHour) {
		nextDate.setHours(nextHour);
		nextDate.setMinutes(0);
		return nextDate;
	}
	if (nextHour < currentHour) {
		// We've wrapped around to the next day
		nextDate = addDays(nextDate, 1);
		nextDate.setHours(nextHour);
		nextDate.setMinutes(0);
		return nextDate;
	}

	// If we got here, we need to advance at least one day
	// Advance day by day until we find a match for both day of month and day of week
	let daysToTry = 366; // Limit to avoid infinite loops (more than a year)
	while (daysToTry-- > 0) {
		nextDate = addDays(nextDate, 1);
		nextDate.setHours(0);
		nextDate.setMinutes(0);

		// Check if this day matches the day of month and day of week constraints
		const currentDayOfMonth = getDate(nextDate);
		const currentDayOfWeek = getDay(nextDate);
		const currentMonth = getMonth(nextDate) + 1; // Convert to 1-based

		// Check month first
		if (!isFieldMatch(currentMonth, expression.month, "month", nextDate)) {
			// Skip to the first day of the next month
			nextDate.setDate(1);
			nextDate.setMonth(nextDate.getMonth() + 1);
			continue;
		}

		// Handle day of month and day of week logic
		const isDayOfMonthAsterisk =
			expression.day_of_month.all && !expression.day_of_month.omit;
		const isDayOfWeekAsterisk =
			expression.day_of_week.all && !expression.day_of_week.omit;

		// If both are asterisks, any day matches
		if (isDayOfMonthAsterisk && isDayOfWeekAsterisk) {
			break;
		}

		// If day of month is specified but day of week is asterisk, use day of month only
		if (!isDayOfMonthAsterisk && isDayOfWeekAsterisk) {
			if (
				isFieldMatch(
					currentDayOfMonth,
					expression.day_of_month,
					"day_of_month",
					nextDate,
				)
			) {
				break;
			}
			continue;
		}

		// If day of week is specified but day of month is asterisk, use day of week only
		if (isDayOfMonthAsterisk && !isDayOfWeekAsterisk) {
			if (
				isFieldMatch(
					currentDayOfWeek,
					expression.day_of_week,
					"day_of_week",
					nextDate,
				)
			) {
				break;
			}
			continue;
		}

		// If both are specified, either condition can match
		if (
			isFieldMatch(
				currentDayOfMonth,
				expression.day_of_month,
				"day_of_month",
				nextDate,
			) ||
			isFieldMatch(
				currentDayOfWeek,
				expression.day_of_week,
				"day_of_week",
				nextDate,
			)
		) {
			break;
		}
	}

	// Find the first valid hour and minute for this day
	nextDate.setHours(0);
	nextDate.setMinutes(0);

	// Find the first valid hour
	for (let h = 0; h <= 23; h++) {
		if (isFieldMatch(h, expression.hour, "hour", nextDate)) {
			nextDate.setHours(h);
			break;
		}
	}

	// Find the first valid minute
	for (let m = 0; m <= 59; m++) {
		if (isFieldMatch(m, expression.minute, "minute", nextDate)) {
			nextDate.setMinutes(m);
			break;
		}
	}

	return nextDate;
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

	if (match.values && match.values.length > 0) {
		const nextValue = match.values.find((v) => v > currentValue);
		return nextValue !== undefined
			? nextValue
			: wrapAround
				? match.values[0]
				: max + 1;
	}

	if (match.ranges && match.ranges.length > 0) {
		// First check if we can find a value in one of the ranges
		for (const range of match.ranges) {
			if (currentValue < range.from) {
				return range.from;
			}
			if (currentValue >= range.from && currentValue <= range.to) {
				if (currentValue < range.to) {
					return currentValue + 1;
				}
			}
		}

		// If we get here, the current value is beyond all ranges
		// If wrapping is allowed, return the start of the first range
		return wrapAround ? match.ranges[0].from : max + 1;
	}

	if (match.steps && match.steps.length > 0) {
		// Try each step pattern
		for (const step of match.steps) {
			if (step.step === 0) continue; // Avoid division by zero

			if (currentValue < step.from) {
				return step.from;
			}

			if (currentValue >= step.from && currentValue <= step.to) {
				const steps = Math.floor((currentValue - step.from) / step.step);
				const nextVal = step.from + (steps + 1) * step.step;
				if (nextVal <= step.to) {
					return nextVal;
				}
			}
		}

		// If we get here and wrapping is allowed, return the start of the first step
		if (wrapAround && match.steps[0].step !== 0) {
			return match.steps[0].from;
		}
	}

	// If we have special day of month or day of week patterns, we need more complex logic
	// For now, just increment and let isTimeMatch handle the validation
	return currentValue + 1;
}

export function isTimeMatch(expression: CronExpression, date: TZDate): boolean {
	const fields: [FieldType, number][] = [
		["minute", getMinutes(date)],
		["hour", getHours(date)],
		["day_of_month", getDate(date)],
		["month", getMonth(date) + 1],
		["day_of_week", getDay(date)], // Sunday is 0
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
		getDate(date),
		dayOfMonthMatch,
		"day_of_month",
		date,
	);

	// Handle the day of week value: getDay() returns 0-6 where 0 is Sunday
	const dayOfWeekValue = getDay(date);
	// Some cron systems treat 7 as Sunday, so we need to normalize
	const dayOfWeekMatches = isFieldMatch(
		dayOfWeekValue,
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

	// Special handling for day_of_week where 7 is treated as 0 (Sunday)
	if (field === "day_of_week") {
		// Ensure Sunday is consistently handled (can be 0 or 7)
		if (value === 7) value = 0;
	}

	if (match.values?.includes(value)) return true;

	if (match.ranges?.some((range) => value >= range.from && value <= range.to))
		return true;

	if (
		match.steps?.some((step) => {
			if (step.step === 0) return false; // Step of 0 would cause division by zero
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

	if (field === "day_of_week") {
		// Handle nth days of the week
		if (match.nthDays?.length) {
			return match.nthDays.some((nth) => {
				const nthDate = getNthDayOfMonth(date, nth.day_of_week, nth.instance);
				return getDate(date) === nthDate;
			});
		}

		// Handle last day of week in month
		if (match.lastDays?.length) {
			const lastDate = getLastDayOfWeekInMonth(date, value);
			return getDate(date) === lastDate;
		}
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

function getLastDayOfWeekInMonth(date: Date, dayOfWeek: number): number {
	const lastDayOfMonth = endOfMonth(date);
	const lastDayOfWeekDay = getDay(lastDayOfMonth);
	const daysToSubtract = (lastDayOfWeekDay - dayOfWeek + 7) % 7;

	// If we're already on the right day, don't subtract
	if (daysToSubtract === 0) {
		return getDate(lastDayOfMonth);
	}

	const lastOccurrence = addDays(lastDayOfMonth, -daysToSubtract);
	return getDate(lastOccurrence);
}
