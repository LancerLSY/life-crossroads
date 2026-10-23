import familyData from './family-data.json' with { type: 'json' }
import { COUNTRIES } from './countries.ts'
import type { FamilySamplingMetadata } from './types.ts'

/** Draw an index from nonnegative counts or probabilities without rounding them. */
export function sampleWeightedIndex(weights: readonly number[], random: () => number): number {
  const total = weights.reduce((sum, weight) => {
    if (!Number.isFinite(weight) || weight < 0) throw new RangeError('Family weights must be finite and nonnegative')
    return sum + weight
  }, 0)
  if (!Number.isFinite(total) || total <= 0) throw new RangeError('Family weights must have positive total mass')
  const fraction = random()
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) throw new RangeError('Random fraction must be in [0, 1)')
  let cursor = fraction * total
  for (let index = 0; index < weights.length; index++) {
    cursor -= weights[index]!
    if (cursor < 0) return index
  }
  // Floating-point addition can leave a tiny remainder at the upper boundary.
  for (let index = weights.length - 1; index >= 0; index--) if (weights[index]! > 0) return index
  throw new RangeError('Family weights must have positive total mass')
}

export interface FamilyGroup {
  label: string
  count: number
  birthOrder: number[]
}
export interface FamilySurvey {
  countryCode: string
  surveyId: string
  surveyYear: number
  sourceURL: string
  totalBirths: number
  referencePeriodYears?: number
  maternalAgeBasis: string
  wealth: FamilyGroup[]
  residence: FamilyGroup[]
  maternalAge: (FamilyGroup & { min: number; max: number })[]
  birthOrder: number[]
}

export function probabilities(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!Number.isFinite(total) || total <= 0 || weights.some(weight => !Number.isFinite(weight) || weight < 0)) throw new RangeError('Invalid family probability distribution')
  return weights.map(weight => weight / total)
}

/** Group counts are weighted survey births, not numbers of surveyed households. */
export function conditionalGroupWeights(groups: readonly FamilyGroup[], birthOrder: number): number[] {
  return groups.map(group => group.count * (probabilities(group.birthOrder)[birthOrder] ?? 0))
}

/** Use one survey per country, so repeat surveys cannot inflate a country's mass. */
export function nearestSurveys(surveys: readonly FamilySurvey[], year: number): FamilySurvey[] {
  const countries = new Map<string, FamilySurvey>()
  for (const survey of surveys) {
    const previous = countries.get(survey.countryCode)
    if (!previous || Math.abs(survey.surveyYear - year) < Math.abs(previous.surveyYear - year)
      || Math.abs(survey.surveyYear - year) === Math.abs(previous.surveyYear - year) && survey.surveyYear > previous.surveyYear) countries.set(survey.countryCode, survey)
  }
  return [...countries.values()]
}

const eligibleSurveys: FamilySurvey[] = familyData.surveys.filter(survey => COUNTRIES.some(country => country.id === survey.countryCode) && survey.wealth.length === 5 && survey.residence.some(group => group.label === 'Urban') && survey.residence.some(group => group.label === 'Rural') && survey.maternalAge.length > 0)
const countryBirths = new Map(COUNTRIES.map(country => [country.id, country.births]))

export function sampleFamily(countryId: string, year: number, random: () => number) {
  const references = nearestSurveys(eligibleSurveys, year)
  const local = references.find(survey => survey.countryCode === countryId)
  const survey = local ?? references[sampleWeightedIndex(references.map(reference => countryBirths.get(reference.countryCode) ?? 0), random)]!
  const wealthProbabilities = probabilities(survey.wealth.map(group => group.count))
  const wealthIndex = sampleWeightedIndex(wealthProbabilities, random)
  const order = sampleWeightedIndex(survey.wealth[wealthIndex]!.birthOrder, random)
  const ageProbabilities = probabilities(conditionalGroupWeights(survey.maternalAge, order))
  const ageGroup = survey.maternalAge[sampleWeightedIndex(ageProbabilities, random)]!
  // A representative age, not an invented observed within-bin age distribution.
  const motherAge = Math.max(15 + order, Math.round((ageGroup.min + ageGroup.max) / 2 - (survey.referencePeriodYears ?? 2) / 2))
  const residenceProbabilities = probabilities(conditionalGroupWeights(survey.residence, order))
  const urban = survey.residence[sampleWeightedIndex(residenceProbabilities, random)]!.label === 'Urban'
  const urbanProbability = survey.residence.reduce((sum, group, index) => sum + (group.label === 'Urban' ? residenceProbabilities[index]! : 0), 0)
  const metadata: FamilySamplingMetadata = {
    version: 1, surveyId: survey.surveyId, surveyYear: survey.surveyYear, sourceCountry: survey.countryCode,
    sourceURL: survey.sourceURL, countryMatch: !!local, requestedYear: year, birthOrderGroup: (['1', '2', '3', '4', '5+'] as const)[order]!, evidence: 'survey-proxy',
    wealthProbabilities, urbanProbability, maternalAgeDistribution: survey.maternalAge.map((group, index) => ({ label: group.label, probability: ageProbabilities[index]! })),
    notes: [
      local ? '使用本国最近年份DHS调查；调查中的近两年出生样本不等于该出生年的精确分布。' : '本国无完整DHS调查，按已覆盖国家的基准出生人口权重选参考国家；不是全球或本国实测概率。',
      '财富五档按来源调查的家庭资产排名划分，按各档实际调查出生权重抽样；不是全球收入档位。',
      '先抽财富及其条件出生次序，再按出生次序抽母亲年龄组与城乡；联合关系采用条件独立模型。',
      '母亲年龄组按调查时年龄处理；出生母龄用组中点减一年代理，并保证先前出生的年龄顺序可行。',
      '父龄设为母龄、姓名与职业为叙事生成；这些不是统计观测。',
      order === 4 ? '第5胎及以上是开放尾组：仅生成4名较年长手足作为下界代理，实际先前出生可能更多。' : '较年长手足人数由先前出生次数代理；未观测存活、同住或多胞胎情况。',
      '手足年龄使用母龄范围内的规则间隔代理，不代表观测到的出生间隔。',
    ],
  }
  return { familyQuintile: wealthIndex + 1, motherAge, fatherAge: motherAge, urban, siblings: order, metadata }
}
