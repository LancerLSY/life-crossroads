import countryData from './countries.json' with { type: 'json' }

/** Snapshot units and substitutions are documented in docs/data-sources.md. */
export interface Country {
  id: string
  name: string
  population: number
  births: number
  lifeExpectancy: number
  femaleLifeExpectancy: number
  maleLifeExpectancy: number
  infantMortality: number
  gdp: number
  urban: number
  fertility: number
  education: number
}

const numericFields = [
  'population', 'births', 'lifeExpectancy', 'femaleLifeExpectancy',
  'maleLifeExpectancy', 'infantMortality', 'gdp', 'urban', 'fertility', 'education',
] as const

function asCountry(row: Country): Country {
  const result: Country = { id: row.id, name: row.name, ...Object.fromEntries(
    numericFields.map((field) => [field, row[field]]),
  ) } as Country
  return result
}

export const COUNTRIES: Country[] = countryData.countries.map(asCountry)
export const COUNTRY_DATA_METADATA = {
  baselineYear: countryData.baselineYear,
  retrievedAt: countryData.retrievedAt,
  attribution: countryData.attribution,
  license: countryData.license,
  sources: countryData.sources,
  supplementalSources: countryData.supplementalSources,
}

const byId = new Map(COUNTRIES.map((country) => [country.id, country]))
const histories = new Map(countryData.countries.map((country) => [
  country.id,
  [...country.history, country].sort((a, b) => a.year - b.year),
]))

/** Unknown IDs fall back to China, so imported or older saves remain playable. */
export function countryById(id: string): Country {
  return byId.get(id.toUpperCase()) ?? byId.get('CHN')!
}

function seededFraction(seed: number): number {
  let state = ((Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0) + 0x6d2b79f5
  state = Math.imul(state ^ (state >>> 15), state | 1)
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296
}

/** Select among the supported 172 geographies, using annual births or population. */
export function sampleCountry(seed: number, mode: 'birth' | 'population'): Country {
  const field = mode === 'birth' ? 'births' : 'population'
  const total = COUNTRIES.reduce((sum, country) => sum + country[field], 0)
  let remaining = seededFraction(seed) * total
  for (const country of COUNTRIES) {
    remaining -= country[field]
    if (remaining < 0) return country
  }
  return COUNTRIES[COUNTRIES.length - 1]
}

function interpolate(lower: Country, upper: Country, ratio: number): Country {
  const result = { ...lower }
  for (const field of numericFields) {
    result[field] = lower[field] + (upper[field] - lower[field]) * ratio
  }
  result.population = Math.round(result.population)
  result.births = Math.round(result.births)
  return result
}

/**
 * Interpolate independently sourced historical anchors. Outside 1960–2024,
 * apply explicit game scenarios, rather than representing values as forecasts.
 */
export function countryAt(id: string, year: number, world: 'past' | 'present' | 'future'): Country {
  const country = countryById(id)
  if (world === 'present') return { ...country }
  const requestedYear = Number.isFinite(year) ? Math.max(1800, Math.min(2200, year)) : 2024
  const anchors = histories.get(country.id)!
  if (requestedYear >= 1960 && requestedYear <= 2024) {
    const upperIndex = anchors.findIndex((anchor) => anchor.year >= requestedYear)
    const upper = anchors[upperIndex]
    const lower = anchors[Math.max(0, upperIndex - 1)]
    const ratio = upper.year === lower.year ? 0 : (requestedYear - lower.year) / (upper.year - lower.year)
    return interpolate(asCountry({ ...lower, id: country.id, name: country.name }),
      asCountry({ ...upper, id: country.id, name: country.name }), ratio)
  }

  const future = requestedYear > 2024
  const anchor = future ? country : asCountry({ ...anchors[0], id: country.id, name: country.name })
  const elapsed = requestedYear - (future ? 2024 : 1960)
  const scenarioRate = future && world === 'past' ? 0.7 : 1
  const years = elapsed * scenarioRate
  const result = { ...anchor }
  for (const field of ['lifeExpectancy', 'femaleLifeExpectancy', 'maleLifeExpectancy'] as const) {
    result[field] = Math.max(25, Math.min(110, anchor[field] + years * (future ? 0.12 : 0.18)))
  }
  result.gdp = Math.max(100, anchor.gdp * Math.exp(years * (future ? 0.018 : 0.015)))
  result.infantMortality = Math.max(0.2, Math.min(400, anchor.infantMortality * Math.exp(-years * 0.015)))
  result.urban = Math.max(0.02, Math.min(1, anchor.urban + years * 0.0015))
  result.education = Math.max(0.02, Math.min(1, anchor.education + years * 0.002))
  result.fertility = Math.max(0.7, Math.min(8, anchor.fertility - years * 0.008))
  result.population = Math.max(1, Math.round(anchor.population * Math.exp(years * (future ? 0.003 : 0.01))))
  const birthRate = anchor.births / anchor.population
  result.births = Math.max(1, Math.round(result.population * birthRate * result.fertility / anchor.fertility))
  return result
}
