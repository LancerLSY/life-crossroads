export type StatKey = 'health' | 'happiness' | 'knowledge' | 'wealth'
export type Stats = Record<StatKey, number>
export type Focus = 'balance' | 'study' | 'career' | 'social' | 'health'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  year: number
}

export interface Person {
  id: string
  name: string
  role: string
  age: number
  personality: string
  closeness: number
  trust: number
  mood: string
  avatar: number
  memories: string[]
  messages: ChatMessage[]
}

export interface Choice {
  id: string
  label: string
  hint: string
  effects: Partial<Stats>
  personId?: string
  relationshipDelta?: number
}

export interface LifeEvent {
  id: string
  year: number
  age: number
  kind: 'life' | 'choice' | 'relationship' | 'world'
  title: string
  description: string
  choices: Choice[]
  source: 'local' | 'deepseek'
}

export interface WorldMessage {
  id: string
  speaker: string
  target?: string
  text: string
  year: number
}

export interface LifeConfig {
  name: string
  birthYear: number
  location: string
  startAge: number
  intelligence: number
  seed: number
}

export interface GameState {
  version: 1
  id: string
  config: LifeConfig
  age: number
  year: number
  stats: Stats
  focus: Focus
  people: Person[]
  history: LifeEvent[]
  currentEvent: LifeEvent
  worldMessages: WorldMessage[]
  ended: boolean
  ending?: string
  turn: number
  worldThreads?: WorldThread[]
  worldUpdatedYear?: number
}

export interface WorldThread {
  id: string
  personId: string
  title: string
  cause: string
  stage: 1 | 2 | 3
  status: 'active' | 'resolved'
  direction: 'support' | 'distance' | 'conflict'
  impact: string
  startedYear: number
  nextYear: number
  relatedThreadId?: string
}
