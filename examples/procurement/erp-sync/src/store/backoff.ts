export const MAX_ATTEMPTS = 8;

const BASE_DELAY_MS = 5 * 60_000;
const MAX_DELAY_MS = 24 * 3_600_000;

/** Exponential backoff with "equal jitter": half fixed, half random, capped at a day. */
export function nextAttemptAt(attempts: number, now: Date, random: () => number = Math.random): Date {
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError('attempts starts at 1');
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempts - 1));
  const delay = ceiling / 2 + random() * (ceiling / 2);
  return new Date(now.getTime() + Math.round(delay));
}

export function shouldGiveUp(attempts: number, retryable: boolean): boolean {
  return !retryable || attempts >= MAX_ATTEMPTS;
}
