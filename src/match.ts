import { TZDate } from "@date-fns/tz";
import {
    addDays,
    endOfMonth,
    getDate,
    getDay,
    getDaysInMonth,
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
    // Create a clean start date without milliseconds
    const startTime = new Date(startAt);
    startTime.setMilliseconds(0);
    let currentDate = new TZDate(startTime, tz);
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

/**
 * Get the next matching month value from the current month.
 * Returns the month (1-12) and whether we wrapped to next year.
 */
function getNextMatchingMonth(
    currentMonth: number,
    match: CronMatch,
): { month: number; wrapped: boolean } {
    if (match.all || match.omit) {
        return { month: currentMonth, wrapped: false };
    }

    // Collect all valid months
    const validMonths: number[] = [];

    if (match.values) {
        validMonths.push(...match.values);
    }

    if (match.ranges) {
        for (const range of match.ranges) {
            for (let m = range.from; m <= range.to; m++) {
                if (!validMonths.includes(m)) validMonths.push(m);
            }
        }
    }

    if (match.steps) {
        for (const step of match.steps) {
            if (step.step === 0) continue;
            for (let m = step.from; m <= step.to; m += step.step) {
                if (!validMonths.includes(m)) validMonths.push(m);
            }
        }
    }

    validMonths.sort((a, b) => a - b);

    if (validMonths.length === 0) {
        return { month: currentMonth, wrapped: false };
    }

    // Find next valid month >= currentMonth
    const nextMonth = validMonths.find((m) => m >= currentMonth);
    if (nextMonth !== undefined) {
        return { month: nextMonth, wrapped: false };
    }

    // Wrap to first valid month of next year
    // validMonths is guaranteed to have at least one element here since we checked length === 0 above
    return { month: validMonths[0] as number, wrapped: true };
}

/**
 * Get the first valid day of month from a CronMatch.
 * Returns undefined if the match uses special patterns (L, W, etc.)
 */
function getFirstValidDayOfMonth(match: CronMatch): number | undefined {
    // Can't optimize special patterns
    if (match.lastDay || match.lastWeekday || match.nearestWeekdays?.length) {
        return undefined;
    }

    let minDay = 32;

    if (match.values && match.values.length > 0) {
        minDay = Math.min(minDay, Math.min(...match.values));
    }

    if (match.ranges && match.ranges.length > 0) {
        for (const range of match.ranges) {
            minDay = Math.min(minDay, range.from);
        }
    }

    if (match.steps && match.steps.length > 0) {
        for (const step of match.steps) {
            minDay = Math.min(minDay, step.from);
        }
    }

    return minDay < 32 ? minDay : undefined;
}

/**
 * Get the first valid value for a field (used for hour/minute on new days).
 */
function getFirstValidFieldValue(
    match: CronMatch,
    min: number,
    max: number,
): number {
    if (match.all || match.omit) {
        return min;
    }

    if (match.values && match.values.length > 0) {
        return Math.min(...match.values);
    }

    if (match.ranges && match.ranges.length > 0) {
        let minVal = max + 1;
        for (const range of match.ranges) {
            minVal = Math.min(minVal, range.from);
        }
        return minVal;
    }

    if (match.steps && match.steps.length > 0) {
        let minVal = max + 1;
        for (const step of match.steps) {
            minVal = Math.min(minVal, step.from);
        }
        return minVal;
    }

    return min;
}

function getNextValidDate(
    currentDate: TZDate,
    expression: CronExpression,
): TZDate {
    // Clone the date to avoid mutating the original (preserve timezone)
    let nextDate = new TZDate(currentDate, currentDate.timeZone);

    // Add one minute to start with
    nextDate.setMinutes(nextDate.getMinutes() + 1);
    nextDate.setSeconds(0);
    nextDate.setMilliseconds(0);

    // Pre-compute constant flags (hoisted from loops)
    const isDayOfMonthAny =
        expression.day_of_month.all || expression.day_of_month.omit;
    const isDayOfWeekAny =
        expression.day_of_week.all || expression.day_of_week.omit;

    // Fast path for "* * * *" (every minute)
    const isEveryMinute =
        expression.minute.all &&
        expression.hour.all &&
        isDayOfMonthAny &&
        expression.month.all &&
        isDayOfWeekAny;

    if (isEveryMinute) {
        return nextDate;
    }

    // Check if current day matches day constraints before trying to advance time
    const currentDayOfMonth = getDate(nextDate);
    const currentDayOfWeek = getDay(nextDate);
    const currentMonthVal = getMonth(nextDate) + 1;

    // Check if the current day matches the day constraints
    let dayMatches = false;
    if (isDayOfMonthAny && isDayOfWeekAny) {
        dayMatches = isFieldMatch(
            currentMonthVal,
            expression.month,
            "month",
            nextDate,
        );
    } else if (isDayOfWeekAny) {
        dayMatches =
            isFieldMatch(
                currentMonthVal,
                expression.month,
                "month",
                nextDate,
            ) &&
            isFieldMatch(
                currentDayOfMonth,
                expression.day_of_month,
                "day_of_month",
                nextDate,
            );
    } else if (isDayOfMonthAny) {
        dayMatches =
            isFieldMatch(
                currentMonthVal,
                expression.month,
                "month",
                nextDate,
            ) &&
            isFieldMatch(
                currentDayOfWeek,
                expression.day_of_week,
                "day_of_week",
                nextDate,
            );
    } else {
        // Both specified - OR logic
        dayMatches =
            isFieldMatch(
                currentMonthVal,
                expression.month,
                "month",
                nextDate,
            ) &&
            (isFieldMatch(
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
                ));
    }

    // If day matches, try to advance time within the same day
    if (dayMatches) {
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
            // Need to check if we're still on a valid day after hour change
            if (getDate(nextDate) === currentDayOfMonth) {
                return nextDate;
            }
            // Day changed, need to re-evaluate
        }

        // If minute didn't change or we need to move to the next hour
        const currentHour = getHours(currentDate);
        const nextHour = getNextValidField(
            currentHour,
            expression.hour,
            0,
            23,
            true,
        );

        if (nextHour > currentHour) {
            nextDate.setHours(nextHour);
            // Use optimized first valid minute lookup
            nextDate.setMinutes(
                getFirstValidFieldValue(expression.minute, 0, 59),
            );
            return nextDate;
        }
        if (nextHour < currentHour) {
            // We've wrapped around to the next day - fall through to day iteration
        }
    }

    // If we got here, we need to advance at least one day
    // Pre-compute the first valid day of month for direct jumping
    const firstValidDayOfMonth = isDayOfWeekAny
        ? getFirstValidDayOfMonth(expression.day_of_month)
        : undefined;

    // Advance day by day until we find a match for both day of month and day of week
    let daysToTry = 366 * 4; // Allow up to 4 years for very sparse patterns
    let skipAddDay = false;
    while (daysToTry-- > 0) {
        if (!skipAddDay) {
            nextDate = addDays(nextDate, 1);
        }
        skipAddDay = false;
        nextDate.setHours(0);
        nextDate.setMinutes(0);

        // Check if this day matches the day of month and day of week constraints
        const dayOfMonth = getDate(nextDate);
        const dayOfWeek = getDay(nextDate);
        const month = getMonth(nextDate) + 1; // Convert to 1-based

        // Check month first - use optimized month jumping
        if (!isFieldMatch(month, expression.month, "month", nextDate)) {
            // Jump directly to the next valid month
            const { month: nextMonth, wrapped } = getNextMatchingMonth(
                month + 1 > 12 ? 1 : month + 1,
                expression.month,
            );

            if (wrapped || nextMonth < month) {
                // Need to go to next year
                nextDate.setFullYear(nextDate.getFullYear() + 1);
            }
            nextDate.setMonth(nextMonth - 1); // Convert to 0-based
            nextDate.setDate(1);
            skipAddDay = true;
            continue;
        }

        // If both are any, any day matches
        if (isDayOfMonthAny && isDayOfWeekAny) {
            break;
        }

        // If day of week is any, use day of month only
        if (isDayOfWeekAny) {
            if (
                isFieldMatch(
                    dayOfMonth,
                    expression.day_of_month,
                    "day_of_month",
                    nextDate,
                )
            ) {
                break;
            }

            // Optimization: if we have a simple day value and current day is less,
            // jump directly to that day (if it exists in this month)
            if (
                firstValidDayOfMonth !== undefined &&
                dayOfMonth < firstValidDayOfMonth
            ) {
                const daysInMonth = getDaysInMonth(nextDate);
                if (firstValidDayOfMonth <= daysInMonth) {
                    nextDate.setDate(firstValidDayOfMonth);
                    skipAddDay = true;
                    continue;
                }
            }
            continue;
        }

        // If day of month is any, use day of week only
        if (isDayOfMonthAny) {
            if (
                isFieldMatch(
                    dayOfWeek,
                    expression.day_of_week,
                    "day_of_week",
                    nextDate,
                )
            ) {
                break;
            }
            continue;
        }

        // If both are specified, either condition can match (OR logic)
        const dayOfMonthMatches = isFieldMatch(
            dayOfMonth,
            expression.day_of_month,
            "day_of_month",
            nextDate,
        );

        const dayOfWeekMatches = isFieldMatch(
            dayOfWeek,
            expression.day_of_week,
            "day_of_week",
            nextDate,
        );

        if (dayOfMonthMatches || dayOfWeekMatches) {
            break;
        }
    }

    // Find the first valid hour and minute for this day using optimized lookups
    nextDate.setHours(getFirstValidFieldValue(expression.hour, 0, 23));
    nextDate.setMinutes(getFirstValidFieldValue(expression.minute, 0, 59));

    return nextDate;
}

/**
 * Get the next valid value for a cron field based on the current value and match criteria.
 */
function getNextValidField(
    currentValue: number,
    match: CronMatch,
    _min: number,
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
              ? (match.values[0] as number)
              : max + 1;
    }

    if (match.ranges && match.ranges.length > 0) {
        // First check if we can find a value in one of the ranges
        for (const range of match.ranges) {
            if (currentValue < range.from) {
                return range.from;
            }
            if (currentValue >= range.from && currentValue < range.to) {
                return currentValue + 1;
            }
        }

        // If we get here, the current value is beyond all ranges
        // If wrapping is allowed, return the start of the first range
        // match.ranges[0] is guaranteed to exist since we checked length > 0 above
        return wrapAround
            ? (match.ranges[0] as { from: number; to: number }).from
            : max + 1;
    }

    if (match.steps && match.steps.length > 0) {
        // Try each step pattern
        for (const step of match.steps) {
            if (step.step === 0) continue; // Avoid division by zero

            if (currentValue < step.from) {
                return step.from;
            }

            if (currentValue >= step.from && currentValue <= step.to) {
                const steps = Math.floor(
                    (currentValue - step.from) / step.step,
                );
                const nextVal = step.from + (steps + 1) * step.step;
                if (nextVal <= step.to) {
                    return nextVal;
                }
            }
        }

        // If we get here and wrapping is allowed, return the start of the first step
        if (
            wrapAround &&
            match.steps[0] !== undefined &&
            match.steps[0].step !== 0
        ) {
            return match.steps[0].from;
        }
    }

    // If we have special day of month or day of week patterns, we need more complex logic
    // For now, just increment and let isTimeMatch handle the validation
    return currentValue + 1;
}

export function isTimeMatch(expression: CronExpression, date: TZDate): boolean {
    const minuteValue = getMinutes(date);
    const hourValue = getHours(date);
    const dayOfMonthValue = getDate(date);
    const monthValue = getMonth(date) + 1;
    const dayOfWeekValue = getDay(date);

    // Ensure base fields match
    if (!isFieldMatch(minuteValue, expression.minute, "minute", date))
        return false;
    if (!isFieldMatch(hourValue, expression.hour, "hour", date)) return false;
    if (!isFieldMatch(monthValue, expression.month, "month", date))
        return false;

    // Handle day of month and day of week logic per #48
    const dayOfMonthMatch = expression.day_of_month;
    const dayOfWeekMatch = expression.day_of_week;

    // Check if fields are "any" (asterisk or omit)
    const isDayOfMonthAny = dayOfMonthMatch.all || dayOfMonthMatch.omit;
    const isDayOfWeekAny = dayOfWeekMatch.all || dayOfWeekMatch.omit;

    if (isDayOfMonthAny && isDayOfWeekAny) {
        // If both are any (asterisk or omit), we've already checked minute, hour, month
        return true;
    }

    // If day of week is any, use day of month only
    if (isDayOfWeekAny) {
        return isFieldMatch(
            dayOfMonthValue,
            dayOfMonthMatch,
            "day_of_month",
            date,
        );
    }

    // If day of month is any, use day of week only
    if (isDayOfMonthAny) {
        return isFieldMatch(
            dayOfWeekValue,
            dayOfWeekMatch,
            "day_of_week",
            date,
        );
    }

    // If neither is any (both have specific values), match either condition (OR logic)
    const dayOfMonthMatches = isFieldMatch(
        getDate(date),
        dayOfMonthMatch,
        "day_of_month",
        date,
    );

    const dayOfWeekMatches = isFieldMatch(
        dayOfWeekValue,
        dayOfWeekMatch,
        "day_of_week",
        date,
    );

    return dayOfMonthMatches || dayOfWeekMatches;
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
            if (step.step === 0) return false; // Step of 0 would cause division by zero
            if (value < step.from || value > step.to) return false;
            if (step.from === 0 && value === 0) return true;
            const normalizedValue = value - step.from;
            return normalizedValue >= 0 && normalizedValue % step.step === 0;
        })
    )
        return true;

    if (field === "day_of_month") {
        if (match.lastDay && value === getDate(endOfMonth(date))) return true;
        if (match.lastWeekday && value === getLastWeekdayOfMonth(date))
            return true;
        if (match.nearestWeekdays?.length) {
            return match.nearestWeekdays.some((targetDay) => {
                const nearest = resolveNearestWeekday(targetDay, date);
                return value === nearest;
            });
        }
    }

    if (field === "day_of_week") {
        // Handle nth days of the week
        if (match.nthDays?.length) {
            return match.nthDays.some((nth) => {
                // Check if this day of week is the nth instance
                const dow = getDay(date);
                if (dow !== nth.day_of_week) return false;

                // Calculate which instance of this day of week it is
                const dayOfMonth = getDate(date);
                const firstDayOfMonth = startOfMonth(date);
                const firstDowOfMonth = getDay(firstDayOfMonth);

                // Days from start of month to first occurrence of target DOW
                const daysToFirstOccurrence = (dow - firstDowOfMonth + 7) % 7;
                // First occurrence of this DOW is on day: daysToFirstOccurrence + 1
                const firstOccurrenceDay = daysToFirstOccurrence + 1;
                // Instance = (dayOfMonth - firstOccurrenceDay) / 7 + 1
                const instance =
                    Math.floor((dayOfMonth - firstOccurrenceDay) / 7) + 1;
                return instance === nth.instance;
            });
        }

        // Handle last day of week in month
        if (match.lastDays?.length) {
            if (!match.lastDays.includes(value)) return false;

            let current = endOfMonth(date);
            while (getDay(current) !== value) {
                current = addDays(current, -1);
            }
            return getDate(date) === getDate(current);
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

function resolveNearestWeekday(targetDay: number, date: Date): number {
    const daysInMonth = getDaysInMonth(date);
    const clampedDay = Math.min(Math.max(targetDay, 1), daysInMonth);
    const monthStart = startOfMonth(date);
    const candidate = addDays(monthStart, clampedDay - 1);
    const dayOfWeek = getDay(candidate);

    if (dayOfWeek === 0) {
        if (clampedDay === daysInMonth) {
            return getDate(addDays(candidate, -2));
        }
        return getDate(addDays(candidate, 1));
    }

    if (dayOfWeek === 6) {
        if (clampedDay === 1) {
            return getDate(addDays(candidate, 2));
        }
        return getDate(addDays(candidate, -1));
    }

    return getDate(candidate);
}
