import type { ClockState, SaveFile } from './storage.ts';
import type { Focus } from '../game/types.ts';
export function tickClock(clock: ClockState, seconds: number, yearSeconds: number, focus: Focus, blocked: boolean): { clock: ClockState; elapsed: boolean } {
  if (blocked || clock.paused || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(yearSeconds) || yearSeconds <= 0) return { clock, elapsed: false };
  const change = Math.min(Math.min(seconds, .5) * clock.speed * (clock.fastForward ? 24 : 1) / yearSeconds, 1 - clock.fraction);
  const fraction = clock.fraction + change;
  return { clock: { ...clock, fraction: Math.min(.999999, fraction), focusWeights: { ...clock.focusWeights, [focus]: (clock.focusWeights[focus] ?? 0) + change } }, elapsed: fraction >= 1 - 1e-9 };
}

/** Stop next-decision mode at an interruption, including a model-created decision. */
export function interruptClock(clock: ClockState): ClockState {
  return { ...clock, paused: clock.paused || clock.fastForward, fastForward: false };
}

/** Capture transient progress before switching, forking, exporting or saving a life. */
export function saveClock(save: SaveFile, clock: ClockState): SaveFile {
  return { ...save, branches: save.branches.map(branch => branch.id === save.activeBranchId ? { ...branch, clock } : branch) };
}
