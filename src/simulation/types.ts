import type { Focus, GameState } from '../game/types.ts'

export type World = 'past' | 'present' | 'future'
export type Sex = '女' | '男'
export type InvestmentPolicy = 'deposit' | 'bonds' | 'balanced' | 'local' | 'global' | 'property' | 'trading'
export type EducationLevel = 'none' | 'primary' | 'secondary' | 'vocational' | 'university' | 'postgraduate'
export type Temperament = Record<'curiosity' | 'activity' | 'sociability' | 'persistence', number>

export interface FoundationConfig {
  world: World
  birthYear: number
  drawMode: 'birth' | 'population'
  paceMinutes: 30 | 60 | 90
  homeCountryId?: string
  softMode: boolean
  seed: number
  intelligence: number
  name?: string
  countryId?: string
}

export interface BirthParent {
  name: string
  age: number
  occupation: string
}

export interface FamilySamplingMetadata {
  version: 1
  surveyId: string
  surveyYear: number
  sourceCountry: string
  sourceURL: string
  countryMatch: boolean
  requestedYear: number
  birthOrderGroup: '1' | '2' | '3' | '4' | '5+'
  evidence: 'survey-proxy'
  wealthProbabilities: number[]
  urbanProbability: number
  maternalAgeDistribution: { label: string; probability: number }[]
  notes: string[]
}

export interface BirthRecord {
  countryId: string
  countryName: string
  sex: Sex
  familyClass: string
  familyQuintile: number
  urban: boolean
  parents: { mother: BirthParent; father: BirthParent }
  siblings: number
  /** Absent in legacy saves, which retain their original family. */
  familySampling?: FamilySamplingMetadata
}

export interface Economy {
  cash: number
  annualIncome: number
  annualExpenses: number
  investments: number
  debt: number
  homeOwned: boolean
  homeValue: number
  policy: InvestmentPolicy
  investmentReturn: number
  /** Cumulative cash expenses and income, including one-off transactions. PPP dollars. */
  totalIncome: number
  totalExpenses: number
}

export interface PeerYear {
  age: number
  health: number
  happiness: number
  occupation: string
  income: number
  alive: boolean
}

export interface Peer {
  id: string
  name: string
  countryId: string
  countryName: string
  sex: Sex
  deathAge: number
  cause: string
  years: PeerYear[]
}

export interface YearRecord {
  age: number
  year: number
  health: number
  happiness: number
  knowledge: number
  relationships: number
  netWorth: number
  income: number
  expenses: number
  cash: number
  investments: number
  debt: number
  countryId: string
  occupation: string
  education: string
  title: string
  marker?: 'birth' | 'education' | 'work' | 'family' | 'move' | 'death'
  alive: boolean
}

export interface Simulation {
  version: 1
  config: FoundationConfig
  birth: BirthRecord
  economy: Economy
  education: string
  educationLevel: EducationLevel
  schoolUntil: number
  occupation: string
  workYears: number
  retired: boolean
  currentCountryId: string
  children: number
  relationships: number
  temperament?: Temperament
  peers: Peer[]
  years: YearRecord[]
  notes: { age: number; text: string }[]
  starred: string[]
  reflectedAges: number[]
  reflectionAge?: number
  /** One-year earnings adjustment from an already resolved decision; consumed at settlement. */
  pendingIncomeFactor?: number
  cause?: string
}

export interface SimulationResult {
  state: GameState
  simulation: Simulation
}

export type FocusWeights = Partial<Record<Focus, number>>
