import { countryById } from '../simulation/countries.ts'
import type { BirthRecord } from '../simulation/types.ts'

const WEALTH_LABELS = ['最低五分位', '第二五分位', '中间五分位', '第四五分位', '最高五分位']
const percent = (value: number) => `${(value * 100).toFixed(1)}%`

export default function FamilyEvidence({ birth }: { birth: BirthRecord }) {
  const data = birth.familySampling
  if (!data) return <details className="family-evidence"><summary>家庭抽签依据</summary><p>这段人生创建于旧版，沿用原有家庭记录。新的出生抽签会显示调查来源与概率。</p></details>
  const source = countryById(data.sourceCountry).name
  return <details className="family-evidence">
    <summary>家庭抽签依据 <span>{data.countryMatch ? '本国调查校准' : '跨国参考估算'}</span></summary>
    <p><strong>{source} · {data.surveyYear} 年 DHS 调查</strong><br/>{data.countryMatch ? '以本国最近年份调查中的出生样本校准。' : `${birth.countryName}没有完整的对应调查，这次使用${source}的参考分布，不能当作本国实测概率。`}</p>
    <div className="family-probabilities" aria-label="参考调查内的家庭财富抽签概率">{data.wealthProbabilities.map((probability, index) => <div key={index} className={birth.familyQuintile === index + 1 ? 'drawn' : ''}><span>{WEALTH_LABELS[index]}{birth.familyQuintile === index + 1 ? ' · 本次抽中' : ''}</span><strong>{percent(probability)}</strong><i style={{ width: `${probability * 100}%` }}/></div>)}</div>
    <p>五分位表示调查地区的相对家庭资产排名。这里按各档调查出生数加权，五档的新生儿比例并不固定为各 20%。</p>
    <dl className="family-sampling-details"><div><dt>出生次序组</dt><dd>{data.birthOrderGroup === '5+' ? '第 5 胎及以上' : `第 ${data.birthOrderGroup} 胎`}</dd></div><div><dt>该次序组的城乡概率</dt><dd>城市 {percent(data.urbanProbability)} · 乡村 {percent(1 - data.urbanProbability)}</dd></div></dl>
    <details className="family-method"><summary>母亲年龄与估算说明</summary><p>该出生次序下，受访母亲调查时的年龄组概率：</p><ul>{data.maternalAgeDistribution.map(group => <li key={group.label}>{group.label.replace(/Age /g, '')} 岁 <strong>{percent(group.probability)}</strong></li>)}</ul><p>出生母龄由调查年龄组和回溯窗口估算；出生次序用于构造较年长手足，不能代表存活或同住人数。父亲年龄、职业和手足年龄属于明确的游戏估算。</p><p>财富、城乡与年龄通过出生次序联系，采用条件独立模型。历史、未来及未覆盖国家的结果均含代理假设。</p></details>
    <a href={data.sourceURL} target="_blank" rel="noreferrer">查看这份官方调查数据 ↗</a>
    <p className="family-attribution">Source: The DHS Program Indicator Data API, The Demographic and Health Surveys (DHS) Program. ICF. Originally funded by the United States Agency for International Development (USAID). Available from api.dhsprogram.com. Accessed 2026-10-23.</p>
  </details>
}
