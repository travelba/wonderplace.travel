/**
 * Clock port — injected to keep domain services pure (no Date.now()).
 * Implementations: realClock(), fixedClock(date) for tests.
 */
export interface Clock {
  now(): Date;
}

export const realClock = (): Clock => ({
  now: () => new Date(),
});

export const fixedClock = (instant: Date | string): Clock => {
  const fixed = typeof instant === 'string' ? new Date(instant) : instant;
  return { now: () => new Date(fixed.getTime()) };
};
