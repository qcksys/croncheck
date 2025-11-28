# @qcksys/croncheck

A modern TypeScript library for parsing and matching cron expressions with timezone support.

## Installation

```bash
npm install @qcksys/croncheck
# or
pnpm add @qcksys/croncheck
# or
yarn add @qcksys/croncheck
```

## Usage

```typescript
import { parse, getFutureMatches, isTimeMatch } from '@qcksys/croncheck';

// Parse a cron expression
const result = parse('0 9 * * 1-5');
if (result.success) {
  // Get the next 5 matching dates
  const matches = getFutureMatches(result.expression, {
    matchCount: 5,
    timezone: 'America/New_York'
  });
  console.log(matches);
}

// Check if a date matches a cron expression
const { expression } = parse('*/15 * * * *');
const matches = isTimeMatch(expression, new Date());
```

## Cron Expression Format

Supports 4-5 field expressions:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12 or JAN-DEC)
│ │ │ │ ┌───────────── day of week (0-6 or SUN-SAT, optional)
│ │ │ │ │
* * * * *
```

### Supported Syntax

| Symbol | Description | Example |
|--------|-------------|---------|
| `*` | Any value | `* * * * *` (every minute) |
| `?` | Omit field | `0 0 ? * 1` (Mondays at midnight) |
| `,` | List | `0 9,17 * * *` (9am and 5pm) |
| `-` | Range | `0 9-17 * * *` (every hour 9am-5pm) |
| `/` | Step | `*/15 * * * *` (every 15 minutes) |
| `L` | Last day of month | `0 0 L * *` (last day of month) |
| `LW` | Last weekday of month | `0 0 LW * *` |
| `nW` | Nearest weekday to day n | `0 0 15W * *` (nearest weekday to 15th) |
| `n#m` | Nth occurrence of day | `0 0 ? * 5#3` (3rd Friday) |
| `nL` | Last occurrence of weekday | `0 0 ? * 5L` (last Friday) |

### Predefined Macros

| Macro | Equivalent |
|-------|------------|
| `@yearly` | `0 0 1 1 *` |
| `@monthly` | `0 0 1 * *` |
| `@weekly` | `0 0 ? * 0` |
| `@daily` | `0 0 * * *` |
| `@hourly` | `0 * * * *` |
| `@minutely` | `* * * * *` |

### Month and Day Aliases

- **Months**: `JAN`, `FEB`, `MAR`, `APR`, `MAY`, `JUN`, `JUL`, `AUG`, `SEP`, `OCT`, `NOV`, `DEC`
- **Days**: `SUN`, `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`

## API

### `parse(expression: string): ParsedCronExpression`

Parses a cron expression string into a structured object.

```typescript
const result = parse('0 9 * * 1-5');
// {
//   success: true,
//   pattern: '0 9 * * 1-5',
//   expression: { minute: {...}, hour: {...}, ... }
// }
```

### `getFutureMatches(expression: CronExpression, options?: MatchOptions): Date[]`

Returns an array of future dates that match the cron expression.

```typescript
const matches = getFutureMatches(expression, {
  startAt: new Date(),        // Start searching from this date (default: now)
  matchCount: 5,              // Number of matches to find (default: 2)
  timezone: 'UTC',            // Timezone for matching (default: 'UTC')
  maxLoopCount: 1000,         // Max iterations to prevent infinite loops
  matchValidator: (date) => { // Custom validation function
    return date.getHours() !== 12; // Skip noon
  }
});
```

### `isTimeMatch(expression: CronExpression, date: TZDate): boolean`

Checks if a specific date matches a cron expression.

```typescript
import { TZDate } from '@date-fns/tz';

const date = new TZDate(new Date(), 'America/New_York');
const matches = isTimeMatch(expression, date);
```

## Day of Month / Day of Week Logic

When both `day_of_month` and `day_of_week` are specified (not `*` or `?`), the match uses **OR logic** - either condition can satisfy the match. When only one is specified, only that constraint applies.

```typescript
// Matches on the 15th OR on Fridays
parse('0 9 15 * 5');

// Matches only on the 15th (day_of_week is *)
parse('0 9 15 * *');

// Matches only on Fridays (day_of_month is ?)
parse('0 9 ? * 5');
```

## License

MIT