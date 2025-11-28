import { describe, it, expect } from 'vitest';
import { TZDate } from '@date-fns/tz';
import { parse, getFutureMatches, isTimeMatch } from '../src';

describe('README examples validation', () => {
  describe('Basic usage example', () => {
    it('parses cron expression and gets future matches', () => {
      const result = parse('0 9 * * 1-5');
      expect(result.success).toBe(true);

      if (result.success && result.expression) {
        // Start from a known date to verify exact match values
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 5,
          timezone: 'UTC'
        });

        // Verify we get exactly 5 matches
        expect(matches).toHaveLength(5);

        // Verify each match is at 9:00 AM on a weekday (Mon-Fri)
        // Jan 1, 2024 is Monday, so first 5 weekdays are Jan 1-5
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T09:00:00.000Z', // Monday
          '2024-01-02T09:00:00.000Z', // Tuesday
          '2024-01-03T09:00:00.000Z', // Wednesday
          '2024-01-04T09:00:00.000Z', // Thursday
          '2024-01-05T09:00:00.000Z', // Friday
        ]);
      }
    });

    it('checks if a date matches a cron expression', () => {
      const result = parse('*/15 * * * *');
      expect(result.success).toBe(true);

      if (result.success && result.expression) {
        // Create a date at minute 0 (should match */15)
        const testDate = new TZDate(2024, 0, 1, 12, 0, 0, 'UTC');
        const matches = isTimeMatch(result.expression, testDate);
        expect(matches).toBe(true);

        // Create a date at minute 7 (should not match */15)
        const nonMatchDate = new TZDate(2024, 0, 1, 12, 7, 0, 'UTC');
        const notMatches = isTimeMatch(result.expression, nonMatchDate);
        expect(notMatches).toBe(false);
      }
    });
  });

  describe('Supported syntax', () => {
    it('* - any value (every minute)', () => {
      const result = parse('* * * * *');
      expect(result.success).toBe(true);
      expect(result.expression?.minute.all).toBe(true);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T00:00:00.000Z',
          '2024-01-01T00:01:00.000Z',
          '2024-01-01T00:02:00.000Z',
        ]);
      }
    });

    it('? - omit field (every Monday at midnight)', () => {
      const result = parse('0 0 ? * 1');
      expect(result.success).toBe(true);
      expect(result.expression?.day_of_month.omit).toBe(true);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        // Jan 1, 2024 is Monday
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T00:00:00.000Z',
          '2024-01-08T00:00:00.000Z',
          '2024-01-15T00:00:00.000Z',
        ]);
      }
    });

    it(', - list (9am and 5pm daily)', () => {
      const result = parse('0 9,17 * * *');
      expect(result.success).toBe(true);
      expect(result.expression?.hour.values).toEqual([9, 17]);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 4,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T09:00:00.000Z',
          '2024-01-01T17:00:00.000Z',
          '2024-01-02T09:00:00.000Z',
          '2024-01-02T17:00:00.000Z',
        ]);
      }
    });

    it('- - range (every hour 9am-5pm)', () => {
      const result = parse('0 9-12 * * *');
      expect(result.success).toBe(true);
      expect(result.expression?.hour.ranges).toEqual([{ from: 9, to: 12 }]);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 4,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T09:00:00.000Z',
          '2024-01-01T10:00:00.000Z',
          '2024-01-01T11:00:00.000Z',
          '2024-01-01T12:00:00.000Z',
        ]);
      }
    });

    it('/ - step (every 15 minutes)', () => {
      const result = parse('*/15 * * * *');
      expect(result.success).toBe(true);
      expect(result.expression?.minute.steps).toEqual([{ from: 0, to: 59, step: 15 }]);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 5,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T00:00:00.000Z',
          '2024-01-01T00:15:00.000Z',
          '2024-01-01T00:30:00.000Z',
          '2024-01-01T00:45:00.000Z',
          '2024-01-01T01:00:00.000Z',
        ]);
      }
    });

    it('L - last day of month', () => {
      const result = parse('0 0 L * *');
      expect(result.success).toBe(true);
      expect(result.expression?.day_of_month.lastDay).toBe(true);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-31T00:00:00.000Z', // Jan has 31 days
          '2024-02-29T00:00:00.000Z', // Feb 2024 is leap year
          '2024-03-31T00:00:00.000Z', // Mar has 31 days
        ]);
      }
    });

    it('LW - last weekday of month', () => {
      const result = parse('0 0 LW * *');
      expect(result.success).toBe(true);
      expect(result.expression?.day_of_month.lastWeekday).toBe(true);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-31T00:00:00.000Z', // Jan 31, 2024 is Wednesday
          '2024-02-29T00:00:00.000Z', // Feb 29, 2024 is Thursday
          '2024-03-29T00:00:00.000Z', // Mar 31 is Sunday, so last weekday is 29th (Friday)
        ]);
      }
    });

    it('nW - nearest weekday to day n', () => {
      const result = parse('0 0 15W * *');
      expect(result.success).toBe(true);
      expect(result.expression?.day_of_month.nearestWeekdays).toEqual([15]);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 4,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-15T00:00:00.000Z', // Jan 15 is Monday
          '2024-02-15T00:00:00.000Z', // Feb 15 is Thursday
          '2024-03-15T00:00:00.000Z', // Mar 15 is Friday
          '2024-04-15T00:00:00.000Z', // Apr 15 is Monday
        ]);
      }
    });

    it('n#m - nth occurrence of day (3rd Friday)', () => {
      const result = parse('0 0 ? * 5#3');
      expect(result.success).toBe(true);
      expect(result.expression?.day_of_week.nthDays).toEqual([{ day_of_week: 5, instance: 3 }]);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-19T00:00:00.000Z', // 3rd Friday of Jan 2024
          '2024-02-16T00:00:00.000Z', // 3rd Friday of Feb 2024
          '2024-03-15T00:00:00.000Z', // 3rd Friday of Mar 2024
        ]);
      }
    });

    it('nL - last occurrence of weekday (last Friday)', () => {
      const result = parse('0 0 ? * 5L');
      expect(result.success).toBe(true);
      expect(result.expression?.day_of_week.lastDays).toEqual([5]);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-26T00:00:00.000Z', // Last Friday of Jan 2024
          '2024-02-23T00:00:00.000Z', // Last Friday of Feb 2024
          '2024-03-29T00:00:00.000Z', // Last Friday of Mar 2024
        ]);
      }
    });
  });

  describe('Predefined macros', () => {
    it('@yearly - runs Jan 1st at midnight', () => {
      const result = parse('@yearly');
      expect(result.success).toBe(true);
      expect(result.expression?.minute.values).toEqual([0]);
      expect(result.expression?.hour.values).toEqual([0]);
      expect(result.expression?.day_of_month.values).toEqual([1]);
      expect(result.expression?.month.values).toEqual([1]);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
        ]);
      }
    });

    it('@monthly - runs 1st of each month at midnight', () => {
      const result = parse('@monthly');
      expect(result.success).toBe(true);
      expect(result.expression?.minute.values).toEqual([0]);
      expect(result.expression?.hour.values).toEqual([0]);
      expect(result.expression?.day_of_month.values).toEqual([1]);
      expect(result.expression?.month.all).toBe(true);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 4,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T00:00:00.000Z',
          '2024-02-01T00:00:00.000Z',
          '2024-03-01T00:00:00.000Z',
          '2024-04-01T00:00:00.000Z',
        ]);
      }
    });

    it('@weekly - runs every Sunday at midnight', () => {
      const result = parse('@weekly');
      expect(result.success).toBe(true);
      expect(result.expression?.minute.values).toEqual([0]);
      expect(result.expression?.hour.values).toEqual([0]);
      expect(result.expression?.day_of_week.values).toEqual([0]);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        // Jan 1, 2024 is Monday, first Sunday is Jan 7
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-07T00:00:00.000Z',
          '2024-01-14T00:00:00.000Z',
          '2024-01-21T00:00:00.000Z',
        ]);
      }
    });

    it('@daily - runs every day at midnight', () => {
      const result = parse('@daily');
      expect(result.success).toBe(true);
      expect(result.expression?.minute.values).toEqual([0]);
      expect(result.expression?.hour.values).toEqual([0]);
      expect(result.expression?.day_of_month.all).toBe(true);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T00:00:00.000Z',
          '2024-01-02T00:00:00.000Z',
          '2024-01-03T00:00:00.000Z',
        ]);
      }
    });

    it('@hourly - runs every hour at minute 0', () => {
      const result = parse('@hourly');
      expect(result.success).toBe(true);
      expect(result.expression?.minute.values).toEqual([0]);
      expect(result.expression?.hour.all).toBe(true);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 4,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T00:00:00.000Z',
          '2024-01-01T01:00:00.000Z',
          '2024-01-01T02:00:00.000Z',
          '2024-01-01T03:00:00.000Z',
        ]);
      }
    });

    it('@minutely - runs every minute', () => {
      const result = parse('@minutely');
      expect(result.success).toBe(true);
      expect(result.expression?.minute.all).toBe(true);

      if (result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 3,
          timezone: 'UTC'
        });
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T00:00:00.000Z',
          '2024-01-01T00:01:00.000Z',
          '2024-01-01T00:02:00.000Z',
        ]);
      }
    });
  });

  describe('Month and day aliases', () => {
    it('month aliases (JAN-DEC)', () => {
      const result = parse('0 0 1 JAN *');
      expect(result.success).toBe(true);
      expect(result.expression?.month.values).toEqual([1]);

      const result2 = parse('0 0 1 DEC *');
      expect(result2.success).toBe(true);
      expect(result2.expression?.month.values).toEqual([12]);
    });

    it('day aliases (SUN-SAT)', () => {
      const result = parse('0 0 ? * SUN');
      expect(result.success).toBe(true);
      expect(result.expression?.day_of_week.values).toEqual([0]);

      const result2 = parse('0 0 ? * SAT');
      expect(result2.success).toBe(true);
      expect(result2.expression?.day_of_week.values).toEqual([6]);
    });
  });

  describe('API examples', () => {
    it('parse() returns structured result', () => {
      const result = parse('0 9 * * 1-5');
      expect(result).toMatchObject({
        success: true,
        pattern: '0 9 * * 1-5'
      });
      expect(result.expression).toBeDefined();
      expect(result.expression?.minute).toBeDefined();
      expect(result.expression?.hour).toBeDefined();
      expect(result.expression?.day_of_month).toBeDefined();
      expect(result.expression?.month).toBeDefined();
      expect(result.expression?.day_of_week).toBeDefined();
    });

    it('getFutureMatches() with all options', () => {
      const result = parse('0 9 * * *');
      expect(result.success).toBe(true);

      if (result.success && result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 5,
          timezone: 'UTC',
          maxLoopCount: 1000,
          matchValidator: (date) => {
            return date.getHours() !== 12; // Skip noon (but we're matching 9am so all pass)
          }
        });

        // Verify exact match values - every day at 9am UTC
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T09:00:00.000Z',
          '2024-01-02T09:00:00.000Z',
          '2024-01-03T09:00:00.000Z',
          '2024-01-04T09:00:00.000Z',
          '2024-01-05T09:00:00.000Z',
        ]);
      }
    });

    it('getFutureMatches() with matchValidator filtering', () => {
      const result = parse('0 * * * *'); // Every hour on the hour
      expect(result.success).toBe(true);

      if (result.success && result.expression) {
        const matches = getFutureMatches(result.expression, {
          startAt: new Date('2024-01-01T00:00:00Z'),
          matchCount: 5,
          timezone: 'UTC',
          matchValidator: (date) => {
            // Only allow even hours
            return date.getUTCHours() % 2 === 0;
          }
        });

        // Verify only even hours are returned
        expect(matches.map(d => d.toISOString())).toEqual([
          '2024-01-01T00:00:00.000Z',
          '2024-01-01T02:00:00.000Z',
          '2024-01-01T04:00:00.000Z',
          '2024-01-01T06:00:00.000Z',
          '2024-01-01T08:00:00.000Z',
        ]);
      }
    });

    it('isTimeMatch() with TZDate', () => {
      const result = parse('0 9 * * *');
      expect(result.success).toBe(true);

      if (result.success && result.expression) {
        const date = new TZDate(2024, 0, 15, 9, 0, 0, 'America/New_York');
        const matches = isTimeMatch(result.expression, date);
        expect(matches).toBe(true);
      }
    });
  });

  describe('Day of month / day of week logic', () => {
    it('OR logic when both specified - matches on 15th OR Fridays', () => {
      const result = parse('0 9 15 * 5');
      expect(result.success).toBe(true);

      if (result.success && result.expression) {
        // January 15, 2024 is a Monday - should match (day_of_month)
        const jan15 = new TZDate(2024, 0, 15, 9, 0, 0, 'UTC');
        expect(isTimeMatch(result.expression, jan15)).toBe(true);

        // January 19, 2024 is a Friday - should match (day_of_week)
        const jan19 = new TZDate(2024, 0, 19, 9, 0, 0, 'UTC');
        expect(isTimeMatch(result.expression, jan19)).toBe(true);

        // January 16, 2024 is Tuesday, not the 15th - should NOT match
        const jan16 = new TZDate(2024, 0, 16, 9, 0, 0, 'UTC');
        expect(isTimeMatch(result.expression, jan16)).toBe(false);
      }
    });

    it('only day_of_month constraint when day_of_week is *', () => {
      const result = parse('0 9 15 * *');
      expect(result.success).toBe(true);

      if (result.success && result.expression) {
        // January 15, 2024 - should match
        const jan15 = new TZDate(2024, 0, 15, 9, 0, 0, 'UTC');
        expect(isTimeMatch(result.expression, jan15)).toBe(true);

        // January 19, 2024 (Friday) - should NOT match (only 15th matches)
        const jan19 = new TZDate(2024, 0, 19, 9, 0, 0, 'UTC');
        expect(isTimeMatch(result.expression, jan19)).toBe(false);
      }
    });

    it('only day_of_week constraint when day_of_month is ?', () => {
      const result = parse('0 9 ? * 5');
      expect(result.success).toBe(true);

      if (result.success && result.expression) {
        // January 19, 2024 is a Friday - should match
        const jan19 = new TZDate(2024, 0, 19, 9, 0, 0, 'UTC');
        expect(isTimeMatch(result.expression, jan19)).toBe(true);

        // January 15, 2024 is a Monday - should NOT match
        const jan15 = new TZDate(2024, 0, 15, 9, 0, 0, 'UTC');
        expect(isTimeMatch(result.expression, jan15)).toBe(false);
      }
    });
  });
});