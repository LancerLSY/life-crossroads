import test from 'node:test';
import assert from 'node:assert/strict';
import { interruptClock, saveClock, tickClock } from './clock.ts';
import type { ClockState } from './storage.ts';
import { initialSave, validSave } from './storage.ts';
const base: ClockState = { fraction: 0, speed: 1, paused: false, autoDecision: false, fastForward: false, focusWeights: {} };
test('paused and pending decisions freeze fraction and focus contributions', () => {
  assert.deepEqual(tickClock({ ...base, paused: true }, .5, 50, 'study', false).clock.fraction, 0);
  assert.equal(tickClock(base, .5, 50, 'study', true).clock, base);
});
test('speed and next-decision mode multiply elapsed simulated time without skipping a year boundary', () => {
  assert.equal(tickClock({ ...base, speed: 16 }, .5, 50, 'study', false).clock.fraction, .16);
  const r = tickClock({ ...base, speed: 16, fastForward: true, fraction: .8 }, .5, 50, 'study', false);
  assert.ok(r.elapsed); assert.ok(r.clock.fraction < 1);
  assert.ok(Math.abs((r.clock.focusWeights.study ?? 0) - .2) < .000001);
});
test('focus switching apportions year contributions rather than farming immediate stat changes', () => {
  let c = base;
  for (let i = 0; i < 50; i++) c = tickClock(c, .5, 50, 'study', false).clock;
  assert.ok(Math.abs((c.focusWeights.study ?? 0) - .5) < .000001);
  for (let i = 0; i < 50; i++) c = tickClock(c, .5, 50, 'health', false).clock;
  assert.ok(Math.abs((c.focusWeights.health ?? 0) - .5) < .000001);
});

test('next-decision interruptions pause auto play without changing fractional focus or user speed', () => {
  const running = { ...base, fraction: .4, speed: 8 as const, autoDecision: true, fastForward: true, focusWeights: { study: .4 } };
  const stopped = interruptClock(running);
  assert.equal(stopped.paused, true);
  assert.equal(stopped.fastForward, false);
  assert.equal(stopped.autoDecision, true);
  assert.equal(stopped.speed, 8);
  assert.equal(stopped.fraction, .4);
  assert.deepEqual(stopped.focusWeights, { study: .4 });
  assert.equal(tickClock(stopped, .5, 50, 'study', false).clock, stopped);
  assert.equal(interruptClock(base).paused, false);
  assert.equal(interruptClock({ ...base, paused: true }).paused, true);
});

test('saving a transient clock preserves outgoing progress and isolates other branches', () => {
  const save = initialSave();
  const original = save.branches[0];
  const other = { ...original, id: 'other-life', clock: { ...base, fraction: .2 } };
  save.branches.push(other);
  const running = { ...base, fraction: .65, focusWeights: { health: .65 } };
  const preserved = saveClock(save, running);
  assert.equal(preserved.branches[0].clock, running);
  assert.equal(preserved.branches[1], other);
  assert.equal(save.branches[0], original);
  const switched = saveClock({ ...preserved, activeBranchId: other.id }, { ...other.clock, paused: true });
  assert.equal(switched.branches[0].clock.fraction, .65);
  assert.deepEqual(switched.branches[0].clock.focusWeights, { health: .65 });
  assert.equal(switched.branches[1].clock.paused, true);
  assert.equal(switched.branches[1].clock.fraction, .2);
  assert.ok(validSave(switched));
});

test('invalid elapsed times and blocked fast-forward cannot accrue focus', () => {
  for (const seconds of [NaN, Infinity, -1, 0]) assert.equal(tickClock(base, seconds, 50, 'study', false).clock, base);
  for (const yearSeconds of [NaN, Infinity, -1, 0]) assert.equal(tickClock(base, .1, yearSeconds, 'study', false).clock, base);
  const fast = { ...base, speed: 16 as const, fastForward: true };
  assert.equal(tickClock(fast, 60, 12, 'career', true).clock, fast);
});
