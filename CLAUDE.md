# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

- **Build**: `pnpm build` (uses tsdown to build CJS/ESM bundles with type declarations)
- **Test**: `pnpm test` (runs vitest once)
- **Test watch mode**: `pnpm test:watch`
- **Single test**: `pnpm vitest --run test/parse.spec.ts` or `pnpm vitest --run -t "test name"`
- **Lint**: `pnpm biome:ci` (check only) or `pnpm biome:check:unsafe` (auto-fix with unsafe fixes)

## Architecture

This is a cron expression parsing and matching library (`@qcksys/croncheck`) that supports standard 5-field cron expressions plus extensions.

### Core Modules

- **`src/parse.ts`**: Parses cron expression strings into `CronExpression` objects. Handles predefined macros (@yearly, @monthly, etc.), field aliases (JAN-DEC, SUN-SAT), and special syntax (L for last day, W for weekday, # for nth day of week).

- **`src/match.ts`**: Contains `isTimeMatch()` to check if a date matches a cron expression, and `getFutureMatches()` to find upcoming matching dates. Uses `@date-fns/tz` for timezone-aware date handling.

- **`src/types.ts`**: Type definitions including `CronExpression`, `CronMatch`, and `MatchOptions`.

### Cron Expression Format

Supports 4-5 field expressions: `minute hour day_of_month month [day_of_week]`

Special syntax supported:
- `*` (any), `?` (omit), `-` (range), `/` (step), `,` (list)
- `L` (last day of month), `LW` (last weekday of month)
- `nW` (nearest weekday to day n)
- `n#m` (nth occurrence of day m in month)
- `nL` (last occurrence of weekday n in month)

### Day of Month / Day of Week Logic

When both day_of_month and day_of_week are specified (not `*`), matches use OR logic (either condition satisfies). When only one is specified, only that constraint applies.
