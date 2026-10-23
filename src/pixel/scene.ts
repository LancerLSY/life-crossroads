import type { GameState, Person } from '../game/types.ts'
import type { Simulation, Sex } from '../simulation/types.ts'
import { countryById } from '../simulation/countries.ts'

export const SCENE_WIDTH = 192
export const SCENE_HEIGHT = 60
export const PORTRAIT_WIDTH = 24
export const PORTRAIT_HEIGHT = 32

type Color = readonly [number, number, number]
export type HomeKind = 'flat' | 'cottage' | 'hut' | 'house' | 'villa'
export type SceneProp = 'toys' | 'school' | 'work' | 'garden' | 'bench' | 'memorial'
export interface ScenePerson {
  id: string
  name: string
  age: number
  role: string
  sex?: Sex
  self: boolean
}
export interface SceneModel {
  age: number
  year: number
  countryId: string
  countryName: string
  urban: boolean
  home: HomeKind
  climate: 'temperate' | 'tropical' | 'arid' | 'cold'
  time: 'morning' | 'day' | 'evening'
  weather: 'clear' | 'sunny' | 'overcast'
  prop: SceneProp
  people: ScenePerson[]
  ended: boolean
  dark: boolean
  seed: number
  caption: string
}
export interface PersonHitbox {
  id: string
  name: string
  age: number
  role: string
  self: boolean
  x: number
  y: number
  width: number
  height: number
}
export interface PixelFrame {
  width: number
  height: number
  pixels: Uint8ClampedArray
  people: PersonHitbox[]
}
export interface PortraitOptions {
  name: string
  age: number
  role?: string
  sex?: Sex
  seed?: number
  dark?: boolean
}

const HOME_NAMES: Record<HomeKind, string> = { flat: '城市公寓', cottage: '乡间小屋', hut: '简朴的小屋', house: '自己的家', villa: '花园住宅' }
const TROPICAL = new Set(['IND', 'BGD', 'LKA', 'THA', 'VNM', 'IDN', 'MYS', 'SGP', 'PHL', 'BRA', 'COL', 'ECU', 'VEN', 'NGA', 'GHA', 'CMR', 'COD', 'COG', 'UGA', 'KEN', 'TZA', 'GAB', 'CIV', 'PNG', 'HTI', 'DOM', 'CUB'])
const ARID = new Set(['EGY', 'DZA', 'MAR', 'TUN', 'LBY', 'SAU', 'ARE', 'QAT', 'KWT', 'OMN', 'YEM', 'IRN', 'IRQ', 'JOR', 'ISR', 'PAK', 'AFG', 'SDN', 'NER', 'MLI', 'TCD', 'MRT'])
const COLD = new Set(['CAN', 'RUS', 'NOR', 'SWE', 'FIN', 'ISL', 'MNG', 'EST', 'LVA', 'LTU'])

function hash(text: string): number {
  let value = 2166136261
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  return value >>> 0
}

function sexFromRole(role: string): Sex | undefined {
  if (/母亲|妈妈|女儿|姐姐|妹妹|妻子/.test(role)) return '女'
  if (/父亲|爸爸|儿子|哥哥|弟弟|丈夫/.test(role)) return '男'
  return undefined
}

function isHousehold(person: Person): boolean {
  return !/已离世|已故|前伴侣/.test(person.role) && (
    /^(mother|father|sibling-|child-)/.test(person.id) || /^(母亲|父亲|伴侣|妻子|丈夫|孩子|姐姐|哥哥|弟弟|妹妹)/.test(person.role)
  )
}

/** The visible world is derived from the save; rendering never advances or mutates it. */
export function deriveSceneModel(state?: GameState, simulation?: Simulation, dark = false): SceneModel {
  const age = state?.age ?? 7
  const countryId = simulation?.currentCountryId ?? 'CHN'
  const country = countryById(countryId)
  const seed = state?.config.seed ?? 718
  const moved = simulation && simulation.currentCountryId !== simulation.birth.countryId
  const urban = simulation ? moved ? (hash(`${seed}:${countryId}`) % 1000) / 1000 < country.urban : simulation.birth.urban : true
  const quintile = simulation?.birth.familyQuintile ?? 3
  const home: HomeKind = simulation?.economy.homeOwned
    ? simulation.economy.homeValue > 300_000 ? 'villa' : 'house'
    : quintile >= 5 ? 'villa' : quintile <= 1 ? 'hut' : urban ? 'flat' : 'cottage'
  const ended = state?.ended ?? false
  const happiness = state?.stats.happiness ?? 76
  const occupation = simulation?.occupation ?? ''
  const student = simulation ? occupation === '学生' : age >= 6 && age < 18
  const prop: SceneProp = ended ? 'memorial' : age < 6 ? 'toys' : simulation?.retired ? 'bench'
    : student ? 'school' : age < 16 ? 'toys' : !occupation || /等待|照顾|无业/.test(occupation) ? 'garden' : 'work'
  const self: ScenePerson = { id: 'self', name: state?.config.name ?? '小禾', age, role: '你', sex: simulation?.birth.sex, self: true }
  const family: ScenePerson[] = state ? state.people.filter(isHousehold).map(person => ({
    id: person.id, name: person.name, age: person.age, role: person.role, sex: sexFromRole(person.role), self: false,
  })) : [
    { id: 'mother', name: '陈晚晴', age: 34, role: '母亲', sex: '女', self: false },
    { id: 'father', name: '林远山', age: 36, role: '父亲', sex: '男', self: false },
  ]
  // Partners and children stay visible even in unusually large extended households.
  family.sort((a, b) => Number(/伴侣|孩子|女儿|儿子/.test(b.role)) - Number(/伴侣|孩子|女儿|儿子/.test(a.role)))
  const people = [...(ended ? [] : [self]), ...family].slice(0, 10)
  const countryName = simulation ? country.name : state?.config.location ?? '中国'
  const climate = TROPICAL.has(countryId) ? 'tropical' : ARID.has(countryId) ? 'arid' : COLD.has(countryId) ? 'cold' : 'temperate'
  const household = people.length ? people.map(person => `${person.name}（${person.role}，${person.age}岁）`).join('、') : '安静的小院'
  return {
    age, year: state?.year ?? 1997, countryId, countryName, urban, home, climate,
    time: ended || age >= 60 ? 'evening' : age < 13 ? 'morning' : 'day',
    weather: happiness < 35 ? 'overcast' : happiness > 70 ? 'sunny' : 'clear',
    prop, people, ended, dark, seed,
    caption: `${countryName} · ${urban ? '城市' : '乡村'} · ${HOME_NAMES[home]}。${ended ? '记忆里的家，' : ''}${household}。`,
  }
}

const rgb = (hex: string): Color => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const C = {
  ink: rgb('#3f4248'), skin: ['#f5caa9', '#e6b38c', '#cd9870', '#b67e5b'].map(rgb),
  hair: ['#4c4542', '#705342', '#3c414a', '#a58152'].map(rgb),
  shirt: ['#7896a7', '#a58b9d', '#8c9fac', '#b4a084', '#8f91ac', '#869c8b'].map(rgb),
  trousers: rgb('#566574'), paper: rgb('#f0f0e9'), white: rgb('#fcfcf7'), roof: rgb('#805b64'),
  terracotta: rgb('#aa7881'), wall: rgb('#e9e8df'), wallShadow: rgb('#bec3c4'), window: rgb('#a4bfce'),
  windowShade: rgb('#667e8e'), wood: rgb('#887264'), bark: rgb('#796d5e'), barkLight: rgb('#a3957a'),
  leaf: rgb('#82a78e'), leafDark: rgb('#5c8372'), leafLight: rgb('#acc4a0'), flower: rgb('#d6a0af'),
}

/** Integer-only drawing keeps all clusters on the same native pixel grid. */
class Raster {
  frame: PixelFrame
  constructor(width: number, height: number, background: Color) {
    this.frame = { width, height, pixels: new Uint8ClampedArray(width * height * 4), people: [] }
    this.rect(0, 0, width, height, background)
  }
  rect(x: number, y: number, width: number, height: number, color: Color) {
    const left = Math.max(0, Math.floor(x)), top = Math.max(0, Math.floor(y))
    const right = Math.min(this.frame.width, Math.floor(x + width)), bottom = Math.min(this.frame.height, Math.floor(y + height))
    for (let row = top; row < bottom; row++) for (let column = left; column < right; column++) {
      const index = (row * this.frame.width + column) * 4
      this.frame.pixels[index] = color[0]
      this.frame.pixels[index + 1] = color[1]
      this.frame.pixels[index + 2] = color[2]
      this.frame.pixels[index + 3] = 255
    }
  }
  dot(x: number, y: number, color: Color) { this.rect(x, y, 1, 1, color) }
}

export function personAppearance(name: string, age: number, role = '', sex?: Sex, seed?: number) {
  const value = hash(`${name}:${seed ?? 0}`)
  return {
    skin: C.skin[value % C.skin.length]!,
    hair: age >= 65 ? rgb('#c3c2b4') : C.hair[(value >>> 3) % C.hair.length]!,
    shirt: /^(你|me)$/.test(role) ? rgb('#4b9d94') : /母亲|妈妈/.test(role) ? rgb('#94a4b7') : /父亲|爸爸/.test(role) ? rgb('#74899e') : C.shirt[(value >>> 7) % C.shirt.length]!,
    longHair: (sex ?? sexFromRole(role)) === '女' || (!sex && !sexFromRole(role) && (value & 4) === 0),
  }
}

function cloud(r: Raster, x: number, y: number, color: Color) {
  r.rect(x + 3, y, 9, 2, color)
  r.rect(x, y + 2, 19, 3, color)
  r.rect(x + 1, y + 5, 15, 1, color)
}

function tree(r: Raster, x: number, ground: number, climate: SceneModel['climate'], small = false) {
  if (climate === 'tropical') {
    r.rect(x + 6, ground - 20, 2, 20, C.bark)
    r.rect(x + 5, ground - 10, 1, 7, C.barkLight)
    r.rect(x - 2, ground - 22, 8, 2, C.leaf)
    r.rect(x + 4, ground - 24, 7, 3, C.leafDark)
    r.rect(x + 11, ground - 21, 7, 2, C.leaf)
    r.rect(x - 5, ground - 20, 5, 2, C.leafDark)
    r.rect(x + 16, ground - 19, 4, 2, C.leafDark)
    r.rect(x, ground - 18, 4, 2, C.leafLight)
    r.rect(x + 12, ground - 17, 3, 2, C.leafDark)
    return
  }
  const height = small ? 16 : 24
  r.rect(x + 6, ground - height + 8, 3, height - 8, C.bark)
  r.rect(x + 6, ground - 9, 1, 7, C.barkLight)
  r.rect(x + 4, ground - 11, 2, 2, C.bark)
  if (climate === 'cold') {
    for (let tier = 0; tier < 4; tier++) r.rect(x + 6 - tier * 2, ground - height + tier * 4, 3 + tier * 4, 5, tier % 2 ? C.leafDark : C.leaf)
    r.rect(x + 6, ground - height, 3, 1, C.paper)
  } else {
    const muted = climate === 'arid'
    r.rect(x + 3, ground - height, 9, 2, muted ? C.leafLight : C.leaf)
    r.rect(x, ground - height + 2, 15, 8, C.leafDark)
    r.rect(x - 2, ground - height + 5, 18, 5, C.leafDark)
    r.rect(x + 1, ground - height + 2, 10, 7, C.leaf)
    r.rect(x + 3, ground - height + 1, 6, 3, C.leafLight)
    r.rect(x + 10, ground - height + 7, 5, 3, C.leaf)
    r.rect(x + 2, ground - height + 10, 11, 2, C.leafDark)
  }
}

function window(r: Raster, x: number, y: number, evening: boolean, width = 5, height = 6) {
  r.rect(x, y, width, height, C.windowShade)
  r.rect(x + 1, y + 1, width - 2, height - 2, evening ? rgb('#e2bd79') : C.window)
  r.rect(x, y + height, width + 1, 1, C.paper)
  if (width > 5) r.rect(x + Math.floor(width / 2), y + 1, 1, height - 2, C.wallShadow)
}

function house(r: Raster, model: SceneModel) {
  const x = 5, floor = 48
  const evening = model.time === 'evening' || model.dark
  if (model.home === 'flat') {
    r.rect(x - 1, 7, 34, 41, C.ink)
    r.rect(x, 8, 28, 40, C.wall)
    r.rect(x + 28, 8, 4, 40, C.wallShadow)
    r.rect(x - 2, 6, 36, 2, C.ink)
    r.rect(x - 1, 6, 34, 1, rgb('#8a979e'))
    r.rect(x + 2, 9, 24, 1, C.white)
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) window(r, x + 3 + col * 8, 12 + row * 8, evening, 5, 5)
      r.rect(x + 1, 18 + row * 8, 27, 1, rgb('#d2d6d3'))
    }
    r.rect(x + 10, 39, 9, 9, C.ink)
    r.rect(x + 11, 40, 7, 8, C.windowShade)
    r.rect(x + 12, 41, 5, 3, C.window)
    r.dot(x + 16, 46, C.wall)
    r.rect(x + 7, 48, 20, 1, C.wallShadow)
    r.rect(x + 22, 1, 1, 5, C.ink)
    r.rect(x + 18, 2, 8, 1, C.ink)
  } else if (model.home === 'hut') {
    r.rect(x + 4, 31, 25, floor - 31, C.wallShadow)
    r.rect(x + 2, 29, 29, 3, C.wood)
    r.rect(x + 5, 26, 23, 3, C.wood)
    r.rect(x + 8, 23, 17, 3, C.wood)
    for (let i = 0; i < 6; i++) r.rect(x + 5 + i * 4, 29 - i % 2, 2, 2, C.wall)
    r.rect(x + 8, 37, 7, 11, C.ink)
    window(r, x + 21, 35, evening, 4, 4)
    r.rect(x + 5, 46, 23, 2, C.wood)
    r.rect(x + 8, 46, 7, 2, C.ink)
  } else {
    const villa = model.home === 'villa', owned = model.home === 'house'
    const top = villa ? 22 : 31, width = villa ? 38 : 31
    r.rect(x, top - 1, width + 2, floor - top + 1, C.ink)
    r.rect(x + 1, top, width, floor - top, C.wallShadow)
    r.rect(x + 1, top, width - 3, floor - top, C.wall)
    if (model.climate === 'arid') {
      r.rect(x - 1, top - 2, width + 4, 3, C.wallShadow)
      r.rect(x + 2, top - 3, width - 2, 1, C.paper)
    } else {
      for (let row = 0; row < 7; row++) r.rect(x - 2 + row * 2, top - row - 1, width + 6 - row * 4, 1, row === 0 ? C.ink : row % 3 === 1 ? C.terracotta : C.roof)
      r.rect(x + width - 8, top - 9, 4, 7, C.roof)
      r.rect(x + width - 9, top - 10, 6, 1, C.wallShadow)
    }
    window(r, x + 5, top + 4, evening, 6, 6)
    window(r, x + width - 11, top + 4, evening, 6, 6)
    if (villa) {
      r.rect(x + 1, 35, width - 3, 1, C.paper)
      window(r, x + 5, 38, evening, 6, 6)
      window(r, x + width - 11, 38, evening, 6, 6)
    }
    r.rect(x + Math.floor(width / 2) - 2, 39, 6, 9, C.wood)
    r.rect(x + Math.floor(width / 2) - 1, 40, 4, 3, C.windowShade)
    r.dot(x + Math.floor(width / 2) + 2, 44, C.wall)
    if (owned || villa) {
      r.rect(x - 1, 44, width + 4, 1, C.wood)
      for (let col = 0; col <= width; col += 4) {
        if (col > width / 2 - 4 && col < width / 2 + 6) continue
        r.rect(x + col, 42, 1, 6, C.paper)
      }
    }
  }
  r.rect(44, 43, 2, 5, C.wood)
  r.rect(42, 40, 6, 4, model.home === 'hut' ? C.wallShadow : C.windowShade)
  r.rect(43, 41, 4, 1, C.paper)
}

function drawPerson(r: Raster, person: ScenePerson, x: number, ground: number) {
  const look = personAppearance(person.name, person.age, person.role, person.sex)
  const baby = person.age < 2, child = person.age < 12
  const height = baby ? 8 : child ? 14 : 19
  const y = ground - height
  const width = baby ? 6 : 9
  r.rect(x - 1, ground, width + 2, 1, rgb('#9da8a3'))
  if (baby) {
    r.rect(x + 1, y, 4, 1, C.ink)
    r.rect(x, y + 1, 6, 4, C.ink)
    r.rect(x + 1, y + 1, 4, 3, look.skin)
    r.rect(x + 2, y + 1, 2, 1, look.hair)
    r.dot(x + 1, y + 2, C.ink)
    r.dot(x + 4, y + 2, C.ink)
    r.rect(x + 1, y + 5, 5, 3, C.ink)
    r.rect(x + 2, y + 5, 3, 2, look.shirt)
    r.dot(x + 2, y + 7, C.paper)
  } else {
    // A large, rounded-corner head and two distinct eyes read at native scale.
    r.rect(x + 2, y, 5, 1, C.ink)
    r.rect(x + 1, y + 1, 7, 6, C.ink)
    r.rect(x, y + 2, 9, 4, C.ink)
    r.rect(x + 2, y + 7, 5, 1, C.ink)
    r.rect(x + 1, y + 2, 7, 4, look.skin)
    r.rect(x + 2, y + 6, 5, 1, look.skin)
    r.rect(x + 1, y + 1, 7, 2, look.hair)
    r.dot(x + 1, y + 3, look.hair)
    r.dot(x + 3, y + 4, C.ink)
    r.dot(x + 6, y + 4, C.ink)
    r.dot(x + 5, y + 6, C.terracotta)
    if (look.longHair) { r.rect(x, y + 3, 1, 6, look.hair); r.rect(x + 8, y + 3, 1, 6, look.hair) }
    r.rect(x + 3, y + 8, 3, 1, look.skin)
    const body = child ? 3 : 7
    r.rect(x + 1, y + 9, 7, body, C.ink)
    r.rect(x + 2, y + 9, 5, body - 1, look.shirt)
    r.rect(x, y + 9, 1, child ? 2 : 5, C.ink)
    r.rect(x + 8, y + 9, 1, child ? 2 : 5, C.ink)
    r.dot(x, y + (child ? 10 : 13), look.skin)
    r.dot(x + 8, y + (child ? 10 : 13), look.skin)
    r.rect(x + 2, ground - 3, 2, 3, C.trousers)
    r.rect(x + 5, ground - 3, 2, 3, C.trousers)
    r.rect(x + 1, ground - 1, 3, 1, C.ink)
    r.rect(x + 5, ground - 1, 3, 1, C.ink)
    if (person.age >= 70) { r.rect(x + 10, ground - 6, 1, 6, C.wood); r.rect(x + 8, ground - 6, 3, 1, C.wood) }
  }
  r.frame.people.push({ id: person.id, name: person.name, age: person.age, role: person.role, self: person.self, x: x - 1, y: y - 1, width: width + 3, height: height + 2 })
}

function sceneProp(r: Raster, model: SceneModel) {
  const x = 143
  if (model.prop === 'toys') {
    r.rect(x, 45, 4, 3, C.terracotta)
    r.rect(x + 5, 43, 3, 5, C.window)
    r.rect(x + 9, 46, 4, 2, C.wallShadow)
    r.rect(x - 5, 45, 3, 3, C.shirt[3]!)
    r.dot(x - 4, 44, C.shirt[3]!)
  } else if (model.prop === 'school') {
    r.rect(x + 1, 41, 7, 7, C.ink)
    r.rect(x + 2, 42, 5, 5, C.terracotta)
    r.rect(x + 3, 39, 3, 2, C.wood)
    r.rect(x + 3, 44, 3, 2, C.wallShadow)
    r.rect(x + 9, 45, 6, 3, C.windowShade)
    r.rect(x + 10, 45, 4, 1, C.paper)
  } else if (model.prop === 'work') {
    r.rect(x, 42, 9, 6, C.ink)
    r.rect(x + 1, 43, 7, 4, C.wood)
    r.rect(x + 3, 40, 3, 2, C.ink)
    r.dot(x + 4, 44, C.wall)
  } else if (model.prop === 'bench') {
    r.rect(x - 2, 40, 18, 2, C.wood)
    r.rect(x - 2, 43, 18, 2, C.wood)
    r.rect(x - 3, 45, 20, 1, C.wood)
    r.rect(x, 46, 2, 2, C.ink)
    r.rect(x + 12, 46, 2, 2, C.ink)
  } else if (model.prop === 'memorial') {
    r.rect(99, 37, 6, 1, C.wallShadow)
    r.rect(98, 38, 8, 10, C.wallShadow)
    r.rect(99, 39, 6, 8, C.paper)
    r.rect(100, 41, 4, 1, C.wood)
    r.rect(100, 43, 3, 1, C.wood)
    r.rect(96, 47, 12, 2, C.wallShadow)
    r.rect(95, 44, 1, 4, C.leafDark)
    r.rect(94, 43, 3, 2, C.flower)
    r.dot(95, 43, C.white)
  } else {
    r.rect(x, 43, 6, 5, C.terracotta)
    r.rect(x - 1, 42, 8, 2, C.roof)
    r.rect(x + 2, 37, 2, 5, C.leafDark)
    r.rect(x, 38, 6, 2, C.leaf)
    r.rect(x + 2, 35, 3, 3, C.flower)
  }
}

export function renderScene(model: SceneModel): PixelFrame {
  const night = model.dark, dusk = model.time === 'evening', grey = model.weather === 'overcast'
  const sky = rgb(night ? '#304553' : grey ? '#d2dce2' : dusk ? '#e7cfca' : model.time === 'morning' ? '#dceaf3' : '#cfe4f1')
  const r = new Raster(SCENE_WIDTH, SCENE_HEIGHT, sky)
  const cloudColor = rgb(night ? '#5c6c79' : grey ? '#bac8d1' : dusk ? '#f8e6e0' : '#f8fbfa')
  const distant = rgb(night ? '#445c6d' : dusk ? '#b5b4be' : '#b7c7d1')
  r.rect(0, 35, SCENE_WIDTH, 13, rgb(night ? '#536a73' : '#c8d5d8'))
  if (model.weather === 'sunny' && !night) {
    r.rect(150, 7, 6, 8, rgb('#e9cc84'))
    r.rect(149, 8, 8, 6, rgb('#e9cc84'))
    r.rect(151, 8, 4, 4, rgb('#f3df9b'))
  } else if (night) {
    r.rect(150, 6, 5, 7, C.paper)
    r.rect(153, 5, 4, 6, sky)
    for (const [x, y] of [[43, 5], [86, 11], [123, 4], [177, 18]]) r.dot(x!, y!, C.wall)
  }
  cloud(r, 54, grey ? 11 : 8, cloudColor)
  cloud(r, 112, 15, cloudColor)
  cloud(r, 170, 6, cloudColor)
  if (model.urban) {
    const value = hash(model.countryId)
    for (let i = 0; i < 9; i++) {
      const x = 35 + i * 19, height = 9 + ((value >>> (i % 6 * 4)) & 15)
      r.rect(x, 46 - height, 13, height, distant)
      r.rect(x + 3, 43 - height, 6, 3, distant)
      if (model.year >= 1950) for (let y = 48 - height; y < 43; y += 5) {
        r.rect(x + 3, y, 2, 2, cloudColor)
        r.rect(x + 8, y, 2, 2, cloudColor)
      }
    }
  } else {
    for (let i = 0; i < 6; i++) {
      r.rect(i * 37 - 2, 37 - i % 3 * 3, 29, 9 + i % 3 * 3, distant)
      r.rect(i * 37 + 6, 34 - i % 3 * 3, 14, 3, distant)
    }
    if (model.climate === 'arid') r.rect(0, 43, SCENE_WIDTH, 5, rgb('#c5b993'))
  }
  if (model.year >= 1920) {
    const wire = rgb(night ? '#84909a' : '#7e8991')
    r.rect(36, 17, 23, 1, wire)
    r.rect(59, 18, 39, 1, wire)
    r.rect(98, 19, 55, 1, wire)
    r.rect(153, 18, 32, 1, wire)
  }
  tree(r, 60, 47, model.climate, true)
  tree(r, 166, 48, model.climate)
  const grass = rgb(night ? '#637e73' : model.climate === 'arid' ? '#c9c3a5' : model.climate === 'cold' ? '#bdc8bd' : '#acc6a5')
  r.rect(0, 47, SCENE_WIDTH, 4, grass)
  r.rect(0, 51, SCENE_WIDTH, 3, rgb(night ? '#7e8a8d' : '#d5d9d7'))
  r.rect(0, 54, SCENE_WIDTH, 1, rgb(night ? '#495a63' : '#7d8990'))
  r.rect(0, 55, SCENE_WIDTH, 5, rgb(night ? '#52636e' : '#a5b0b8'))
  for (let x = 5; x < SCENE_WIDTH; x += 23) r.rect(x, 58, 11, 1, rgb(night ? '#a1afb3' : '#edf0ea'))
  for (let x = 3; x < SCENE_WIDTH; x += 11) {
    r.rect(x, 49, 2, 1, C.leaf)
    if (x % 3 === 0) r.dot(x + 3, 48, C.paper)
  }
  const fence = rgb(night ? '#90a3a4' : '#e4e7e3'), fenceShade = rgb(night ? '#61787b' : '#a1afb1')
  r.rect(49, 43, 115, 1, fenceShade)
  r.rect(49, 45, 115, 1, fence)
  for (let x = 50; x < 165; x += 6) {
    r.rect(x, 41, 2, 7, fenceShade)
    r.rect(x, 41, 1, 7, fence)
  }
  if (model.year >= 1920) {
    r.rect(184, 14, 2, 34, C.wood)
    r.rect(178, 17, 13, 1, C.ink)
    r.rect(180, 15, 1, 4, C.ink)
    r.rect(188, 15, 1, 4, C.ink)
  }
  house(r, model)
  sceneProp(r, model)
  const count = model.people.length
  const spacing = count > 7 ? 10 : 12
  const start = Math.max(50, 104 - Math.floor((count * spacing) / 2))
  const selfIndex = model.people.findIndex(person => person.self)
  const orderedPeople = [...model.people]
  if (selfIndex !== -1) orderedPeople.splice(Math.floor(count / 2), 0, ...orderedPeople.splice(selfIndex, 1))
  const leftFamily = Math.ceil(count / 2)
  // Draw the youngest in front; every visible family member has its own hitbox.
  orderedPeople.map((person, index) => ({ person, x: model.ended ? index < leftFamily ? 86 - index * 10 : 113 + (index - leftFamily) * 10 : start + index * spacing })).sort((a, b) => b.person.age - a.person.age).forEach(({ person, x }) => {
    drawPerson(r, person, x, person.self ? 49 : 48)
  })
  if (model.weather === 'overcast' && !model.ended) {
    for (let i = 0; i < 10; i++) r.rect(54 + i * 13, 24 + i % 3 * 6, 1, 2, rgb(night ? '#75908c' : '#a8bdb9'))
  }
  return r.frame
}

export function renderPortrait(options: PortraitOptions): PixelFrame {
  const { name, age, role = '', sex, seed, dark = false } = options
  const look = personAppearance(name, age, role, sex, seed)
  const r = new Raster(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, rgb(dark ? '#52645b' : '#d7d9bd'))
  r.rect(0, 0, 24, 1, rgb(dark ? '#748375' : '#f1ead2'))
  r.rect(0, 0, 1, 32, rgb(dark ? '#748375' : '#f1ead2'))
  r.rect(23, 0, 1, 32, rgb(dark ? '#394d48' : '#9caa8f'))
  r.rect(0, 31, 24, 1, rgb(dark ? '#394d48' : '#9caa8f'))
  r.rect(2, 23, 20, 7, rgb(dark ? '#63725e' : '#bec9a1'))
  if (age < 2) {
    const wrap = rgb(dark ? '#67918f' : '#94bfbd')
    const light = rgb(dark ? '#a9c7bd' : '#deeee5')
    // A newborn is wrapped in a blanket; an adult bust shifted down still looks adult.
    r.rect(9, 5, 6, 1, C.ink)
    r.rect(7, 6, 10, 2, C.ink)
    r.rect(6, 8, 12, 16, C.ink)
    r.rect(5, 11, 14, 9, C.ink)
    r.rect(7, 24, 10, 3, C.ink)
    r.rect(9, 27, 6, 1, C.ink)
    r.rect(8, 7, 8, 18, wrap)
    r.rect(7, 9, 10, 14, wrap)
    r.rect(6, 12, 12, 7, wrap)
    r.rect(8, 24, 8, 2, wrap)
    r.rect(8, 8, 8, 9, C.ink)
    r.rect(9, 9, 6, 7, look.skin)
    r.rect(10, 8, 4, 2, look.hair)
    r.dot(10, 12, C.ink)
    r.dot(13, 12, C.ink)
    r.rect(11, 14, 2, 1, C.terracotta)
    r.rect(7, 17, 10, 1, light)
    for (let step = 0; step < 7; step++) r.rect(7 + step, 18 + step, 2, 1, light)
    r.rect(9, 25, 6, 1, light)
    return r.frame
  }
  const offset = age < 12 ? 2 : 0
  const headY = 5 + offset
  r.rect(8, headY - 1, 8, 1, C.ink)
  r.rect(6, headY, 12, 10, C.ink)
  r.rect(7, headY + 1, 10, 8, look.skin)
  r.rect(7, headY, 10, 3, look.hair)
  r.rect(7, headY + 3, 2, 2, look.hair)
  if (look.longHair) {
    r.rect(5, headY + 3, 2, 11, look.hair)
    r.rect(17, headY + 3, 2, 11, look.hair)
  }
  r.dot(10, headY + 5, C.ink)
  r.dot(15, headY + 5, C.ink)
  r.rect(12, headY + 7, 2, 1, C.terracotta)
  r.rect(10, headY + 10, 5, 2, C.ink)
  r.rect(11, headY + 10, 3, 2, look.skin)
  r.rect(6, headY + 12, 13, 1, C.ink)
  r.rect(4, headY + 13, 17, 13, C.ink)
  r.rect(5, headY + 13, 15, 12, look.shirt)
  r.rect(5, headY + 14, 2, 10, look.skin)
  r.rect(18, headY + 14, 2, 10, look.skin)
  r.rect(8, headY + 13, 2, 4, C.paper)
  r.rect(15, headY + 13, 2, 4, C.paper)
  // Keep the final bottom border visible after the cropped bust.
  r.rect(0, 31, 24, 1, rgb(dark ? '#394d48' : '#9caa8f'))
  return r.frame
}
