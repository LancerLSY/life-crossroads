import { createSimulation } from './core.ts'
import type { FoundationConfig, SimulationResult } from './types.ts'

/** New lives draw their identity from fresh randomness; replay uses createSimulation. */
export function createBirthDraw(config: Partial<FoundationConfig> = {}): SimulationResult {
  return createSimulation({
    world: config.world,
    birthYear: config.birthYear,
    drawMode: config.drawMode,
    paceMinutes: config.paceMinutes,
    softMode: config.softMode,
    intelligence: config.intelligence,
    homeCountryId: config.homeCountryId,
    seed: globalThis.crypto.getRandomValues(new Uint32Array(1))[0],
  })
}
