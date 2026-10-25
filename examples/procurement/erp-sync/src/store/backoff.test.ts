import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ATTEMPTS, nextAttemptAt, shouldGiveUp } from './backoff';

const now = new Date('2026-03-01T02:30:00Z');
const minutesAfter = (d: Date) => (d.getTime() - now.getTime()) / 60_000;

test('the first retry waits between 2.5 and 5 minutes', () => {
  assert.equal(minutesAfter(nextAttemptAt(1, now, () => 0)), 2.5);
  assert.equal(minutesAfter(nextAttemptAt(1, now, () => 1)), 5);
});

test('delays double with each attempt', () => {
  assert.equal(minutesAfter(nextAttemptAt(4, now, () => 1)), 40);
});

test('delays are capped at one day', () => {
  assert.equal(minutesAfter(nextAttemptAt(30, now, () => 1)), 24 * 60);
});

test('non-retryable errors give up immediately; retryable ones after the max', () => {
  assert.equal(shouldGiveUp(1, false), true);
  assert.equal(shouldGiveUp(MAX_ATTEMPTS - 1, true), false);
  assert.equal(shouldGiveUp(MAX_ATTEMPTS, true), true);
});

test('attempt numbers start at one', () => {
  assert.throws(() => nextAttemptAt(0, now), RangeError);
});
