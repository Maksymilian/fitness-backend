import { streak } from './streak.handler.js';

function day(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

describe('streak', () => {
  const today = day('2026-10-08');

  it('counts consecutive active days ending today', () => {
    expect(streak([day('2026-10-08'), day('2026-10-07'), day('2026-10-06'), day('2026-10-04')], today)).toBe(3);
  });

  it('still counts a streak that ended yesterday: today has no workout yet', () => {
    expect(streak([day('2026-10-07'), day('2026-10-06')], today)).toBe(2);
  });

  it('is broken when the latest active day is before yesterday', () => {
    expect(streak([day('2026-10-06'), day('2026-10-05')], today)).toBe(0);
  });

  it('is 0 without any active day', () => {
    expect(streak([], today)).toBe(0);
  });
});
