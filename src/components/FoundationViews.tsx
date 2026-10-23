import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, BookOpen, Leaf, Sparkles } from 'lucide-react'
import type { GameState } from '../game/types.ts'
import PixelScene from './PixelScene'
import PixelPortrait from './PixelPortrait'
import { COUNTRIES, COUNTRY_DATA_METADATA, countryAt, countryById } from '../simulation/countries.ts'
import { secondsPerYear, survivalAt } from '../simulation/core.ts'
import type { InvestmentPolicy, Simulation, World } from '../simulation/types.ts'

export type SpendAction = 'health' | 'travel' | 'social' | 'study' | 'home' | 'repay' | 'invest'

const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
const MONEY = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })
const amountText = (value: number) => MONEY.format(value)
const percentage = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`
const assetTotal = (simulation: Simulation) => simulation.economy.cash + simulation.economy.investments + simulation.economy.homeValue - simulation.economy.debt
const WORLD_NAMES: Record<World, string> = { past: '过去的世界', present: '当下的世界', future: '未来的世界' }
const MARKERS = { birth: '出生', education: '教育', work: '工作', family: '家庭', move: '迁居', death: '离世' }

function CountryOptions({ emptyLabel }: { emptyLabel?: string }) {
  return <>{emptyLabel ? <option value="">{emptyLabel}</option> : null}{SORTED_COUNTRIES.map(country => <option key={country.id} value={country.id}>{country.name}</option>)}</>
}

function DataFootnote({ children }: { children?: ReactNode }) {
  return <p className="foundation-source">{children ?? <>国家与地区参数来自 World Bank WDI 与补充官方数据（{COUNTRY_DATA_METADATA.baselineYear}基准）；缺失值、历史插值与未来变化采用明示的游戏模型。</>}</p>
}

function BirthComparison({ simulation }: { simulation: Simulation }) {
  const { config, birth } = simulation
  const country = countryAt(birth.countryId, config.birthYear, config.world)
  const home = config.homeCountryId ? countryAt(config.homeCountryId, config.birthYear, config.world) : undefined
  if (!home) return null
  return <section className="birth-comparison"><h3>如果和你熟悉的地方相比</h3><div className="foundation-table-wrap"><table><caption className="sr-only">出生地与我的国家或地区对照</caption><thead><tr><th scope="col">出生环境</th><th scope="col">{country.name}</th><th scope="col">{home.name}</th></tr></thead><tbody><tr><th scope="row">出生时预期寿命</th><td>{country.lifeExpectancy.toFixed(1)} 年</td><td>{home.lifeExpectancy.toFixed(1)} 年</td></tr><tr><th scope="row">婴儿死亡率</th><td>{country.infantMortality.toFixed(1)}‰</td><td>{home.infantMortality.toFixed(1)}‰</td></tr><tr><th scope="row">人均 GDP · PPP</th><td>{amountText(country.gdp)}</td><td>{amountText(home.gdp)}</td></tr><tr><th scope="row">城镇人口占比</th><td>{percentage(country.urban)}</td><td>{percentage(home.urban)}</td></tr></tbody></table></div><p className="foundation-help">PPP 为按购买力平价折算的国际元。人均 GDP 描述环境，不等于个人工资。</p></section>
}

export function BirthCertificate({ state, simulation, onBegin, onShare }: { state: GameState; simulation: Simulation; onBegin: () => void; onShare: () => void }) {
  const { birth, config } = simulation
  const country = countryAt(birth.countryId, config.birthYear, config.world)
  const total = COUNTRIES.reduce((sum, item) => sum + countryAt(item.id, config.birthYear, config.world)[config.drawMode === 'birth' ? 'births' : 'population'], 0)
  const chance = country[config.drawMode === 'birth' ? 'births' : 'population'] / total
  const expectancy = birth.sex === '女' ? country.femaleLifeExpectancy : country.maleLifeExpectancy
  return <main className="certificate-page">
    <section className="birth-certificate"><div className="certificate-top"><div><h1>世界里，多了一个你</h1></div><span className="certificate-seal">出生<br />记录</span></div>
      <p className="certificate-intro">{config.birthYear} 年，你在{country.name}的{birth.urban ? '城市' : '乡村'}睁开眼睛。<br />这是你的起点，此后的故事，正在等你。</p>
      <div className="certificate-identity"><PixelPortrait name={state.config.name} age={0} role="me" sex={birth.sex} size={80}/><div><h2>{state.config.name}</h2><p>{birth.sex === '女' ? '女孩' : '男孩'} <span>·</span> {country.name} <span>·</span> {birth.urban ? '城市' : '乡村'}</p></div><span className="certificate-year">{config.birthYear}<small>年出生</small></span></div>
      <div className="certificate-scene"><PixelScene state={state} simulation={simulation}/></div><dl className="certificate-facts"><div><dt>家庭条件</dt><dd>{birth.familyClass}<small>本地家庭资源第 {birth.familyQuintile} / 5 档</small></dd></div><div><dt>兄弟姐妹</dt><dd>{birth.siblings ? `${birth.siblings} 位` : '独生子女'}<small>家庭的相处从此刻开始</small></dd></div>{(['mother', 'father'] as const).map(role => <div key={role}><dt>{role === 'mother' ? '母亲' : '父亲'}</dt><dd>{birth.parents[role].name}<small>{birth.parents[role].age} 岁 · {birth.parents[role].occupation}</small></dd></div>)}</dl>
      <div className="birth-environment"><div><span>同地同性别预期寿命</span><strong>{expectancy.toFixed(1)}<small>年</small></strong><p>群体平均，个人结局由模拟决定</p></div><div><span>一岁前死亡风险</span><strong>{percentage(country.infantMortality / 1000, 2)}</strong><p>当地每千活产 {country.infantMortality.toFixed(1)} 人</p></div><div><span>当地人均 GDP · PPP</span><strong>{amountText(country.gdp)}</strong><p>国际元 / 年 · 不等于个人收入</p></div><div><span>随机落在这里的概率</span><strong>{percentage(chance, 2)}</strong><p>{config.countryId ? '本次指定了出生地；此处为随机基准' : config.drawMode === 'birth' ? '按支持地区年度出生人数加权' : '按支持地区总人口加权'}</p></div></div>
      <BirthComparison simulation={simulation} />
      <div className="certificate-peers"><h3>同一年，他们也来到这个世界</h3><p>四条独立的人生，将和你一起向前。</p><div>{simulation.peers.map(peer => <article key={peer.id}><PixelPortrait name={peer.name} age={0} sex={peer.sex} size={32}/><strong>{peer.name}</strong><small>{peer.countryName} · {peer.sex}</small></article>)}</div></div>
      <div className="certificate-start"><p>{WORLD_NAMES[config.world]} <span>·</span> 约 {Math.round(secondsPerYear(simulation))} 秒走过一年<br /><small>你可以随时暂停，慢慢做决定。</small></p><div><button className="secondary-button" onClick={onShare}>分享出生卡</button><button className="primary-button" onClick={onBegin}>开始这一生 <ArrowRight size={17} /></button></div></div>
      <DataFootnote />
    </section>
  </main>
}

function SurvivalChart({ state, simulation }: { state: GameState; simulation: Simulation }) {
  const { config, birth } = simulation
  const curves = useMemo(() => {
    const ages = Array.from({ length: 23 }, (_, index) => index * 5)
    const weighted = COUNTRIES.map(country => ({ id: country.id, births: countryAt(country.id, config.birthYear, config.world).births }))
    const total = weighted.reduce((sum, country) => sum + country.births, 0)
    return {
      cohort: ages.map(age => survivalAt(birth.countryId, age, birth.sex, config.world, config.birthYear)),
      world: ages.map(age => weighted.reduce((sum, country) => sum + survivalAt(country.id, age, birth.sex, config.world, config.birthYear) * country.births, 0) / total),
      home: config.homeCountryId ? ages.map(age => survivalAt(config.homeCountryId!, age, birth.sex, config.world, config.birthYear)) : undefined,
    }
  }, [birth.countryId, birth.sex, config.birthYear, config.world, config.homeCountryId])
  const left = 38, top = 18, width = 464, height = 160
  const line = (values: number[]) => values.map((value, index) => `${(left + index * width / 22).toFixed(1)},${(top + (1 - value) * height).toFixed(1)}`).join(' ')
  const currentX = left + Math.min(110, state.age) / 110 * width
  const currentSurvival = survivalAt(birth.countryId, state.age, birth.sex, config.world, config.birthYear)
  return <section className="survival-section"><div className="foundation-section-title"><div><h3>存活曲线</h3></div><span>同出生队列 · {birth.sex}性</span></div><div className="survival-legend"><span><i className="cohort-line" /> {birth.countryName}</span><span><i className="world-line" /> 世界基准</span>{curves.home ? <span><i className="home-line" /> {countryById(config.homeCountryId!).name}</span> : null}</div>
      <svg className="survival-chart" viewBox="0 0 520 213" role="img" aria-label={`出生队列生存曲线，${state.age}岁时出生地模型生存比例为${percentage(currentSurvival)}`}><title>从出生到各年龄仍在世的模型比例</title>{[0, .25, .5, .75, 1].map(value => <g key={value}><line x1={left} y1={top + (1 - value) * height} x2={left + width} y2={top + (1 - value) * height} className="chart-gridline" /><text x={left - 9} y={top + (1 - value) * height + 4} textAnchor="end">{Math.round(value * 100)}%</text></g>)}{[0, 20, 40, 60, 80, 100, 110].map(age => <text key={age} x={left + age / 110 * width} y={top + height + 22} textAnchor="middle">{age}</text>)}<polyline points={line(curves.world)} className="chart-world" />{curves.home ? <polyline points={line(curves.home)} className="chart-home" /> : null}<polyline points={line(curves.cohort)} className="chart-cohort" /><line x1={currentX} y1={top} x2={currentX} y2={top + height} className="chart-current" /><circle cx={currentX} cy={top + (1 - currentSurvival) * height} r={4} className="chart-dot" /><text x={Math.max(left + 25, Math.min(left + width - 25, currentX))} y={10} textAnchor="middle" className="chart-current-label">你 · {state.age} 岁</text><text x={left + width} y={211} textAnchor="end">年龄 / 岁</text></svg>
      <p className="survival-annotation">与你同地、同性别出生的 100 人，模型中约有 <strong>{Math.round(currentSurvival * 100)}</strong> 人走到 {state.age} 岁。曲线描述群体机会，健康、资源和个人经历会改变这一生的风险。</p><DataFootnote>依据 WDI 预期寿命与婴儿死亡率拟合的游戏生存模型，并非官方生命表。世界基准按支持地区同年出生权重汇总；历史与未来随时间线演变。</DataFootnote>
    </section>
}

export function SimulationDashboard({ state, simulation, onSnapshot }: { state: GameState; simulation: Simulation; onSnapshot?: (age: number) => void }) {
  const years = new Map(simulation.years.map(year => [year.age, year]))
  return <div className="simulation-dashboard"><section className="peer-lives"><div className="foundation-section-title"><div><h3>在同一秒出生的人们</h3></div><span>与你同龄的四个人</span></div><div className="peer-live-list">{simulation.peers.map(peer => {
    const current = peer.years[Math.min(state.age, peer.years.length - 1)] ?? peer.years[0]!
    return <article key={peer.id} className={!current.alive ? 'peer-departed' : ''}><PixelPortrait name={peer.name} age={current.age} sex={peer.sex} role={!current.alive ? "已离世" : undefined} size={32}/><div><strong>{peer.name}</strong><small>{peer.countryName} · {current.alive ? `${current.age} 岁` : `止于 ${current.age} 岁`}</small></div><div className="peer-life-detail"><span>{current.alive ? current.occupation : '这一生已结束'}</span><small>{current.alive ? `幸福 ${Math.round(current.happiness)} · 年收入 ${amountText(current.income)} PPP` : peer.cause}</small></div><span className={`peer-presence ${current.alive ? 'alive' : ''}`} aria-label={current.alive ? '在世' : '已离世'} /></article>
  })}</div><p className="foundation-help">每位同龄人独立经历教育、工作与生命事件；只展示他们已经走过的年份。</p></section>
    <section className="life-grid-section"><div className="foundation-section-title"><div><h3>人生地图</h3></div><span>一格 = 1年</span></div><div className="life-year-grid">{Array.from({ length: 111 }, (_, age) => {
      const record = years.get(age)
      const title = record ? `${record.year} 年 · ${age} 岁 · 幸福 ${Math.round(record.happiness)}${record.marker ? ` · ${MARKERS[record.marker]}` : ''} · ${record.title}` : `${age} 岁 · 尚未走到`
      const tone = !record ? 'unlived' : record.happiness >= 75 ? 'happy' : record.happiness >= 50 ? 'steady' : record.happiness >= 30 ? 'low' : 'hard'
      return <button key={age} type="button" className={`life-year-cell ${tone} ${age === state.age ? 'current' : ''} ${record?.marker ? 'has-marker' : ''}`} title={title} aria-label={title} aria-current={age === state.age ? 'step' : undefined} disabled={!record} onClick={() => onSnapshot?.(age)}><span>{age}</span>{record?.marker ? <i aria-hidden="true" /> : null}</button>
    })}</div><div className="life-grid-key"><span>幸福感</span><span><i className="hard" /> 低</span><span><i className="steady" /> 平稳</span><span><i className="happy" /> 高</span><span><i className="unlived" /> 未走到</span><span className="milestone-key">• 人生节点</span></div><p className="foundation-help">0—110 岁，每格一年。{onSnapshot ? '点击已走过的年份，回看当时的生活。' : '悬停或聚焦已走过的年份，查看幸福感与人生节点。'}</p></section>
    <SurvivalChart state={state} simulation={simulation} />
  </div>
}

const INVESTMENTS: { id: InvestmentPolicy; name: string; risk: string; description: string }[] = [
  { id: 'deposit', name: '银行储蓄', risk: '低风险', description: '优先保留资产，回报较低，仍可能受购买力变化影响。' },
  { id: 'bonds', name: '稳健债券', risk: '较低风险', description: '偏向稳定回报，收益和价格仍会随年份波动。' },
  { id: 'balanced', name: '均衡配置', risk: '中等风险', description: '分配到不同资产，兼顾增长与波动。' },
  { id: 'local', name: '本地市场', risk: '较高风险', description: '跟随所在地区的市场表现，收益更集中。' },
  { id: 'global', name: '全球市场', risk: '较高风险', description: '参与全球市场，长期增长伴随年度涨跌。' },
  { id: 'property', name: '房产投资', risk: '较高风险', description: '投资房产相关资产，与自住房分开计算。' },
  { id: 'trading', name: '主动交易', risk: '高风险', description: '回报区间最大，也更容易经历明显亏损。' },
]
const SPENDING: { action: SpendAction; name: string; detail: string; adult?: boolean }[] = [
  { action: 'health', name: '照顾健康', detail: '改善身体状态' }, { action: 'study', name: '继续学习', detail: '积累知识与能力' },
  { action: 'social', name: '陪伴与社交', detail: '为关系留出时间' }, { action: 'travel', name: '出门旅行', detail: '增加见闻与幸福感' },
  { action: 'invest', name: '投入投资', detail: '现金转入投资账户', adult: true }, { action: 'repay', name: '偿还贷款', detail: '按现金与欠款上限偿还', adult: true },
]

export function LifeEconomy({ state, simulation, onAction, onPolicy, onMigrate }: {
  state: GameState; simulation: Simulation; onAction: (action: SpendAction, amount?: number) => void; onPolicy: (policy: InvestmentPolicy) => void; onMigrate: (id: string) => void
}) {
  const [amount, setAmount] = useState('100')
  const [destination, setDestination] = useState('')
  const economy = simulation.economy
  const currentCountry = countryAt(simulation.currentCountryId, simulation.config.world === 'present' ? simulation.config.birthYear : state.year, simulation.config.world)
  const target = destination ? countryAt(destination, simulation.config.world === 'present' ? simulation.config.birthYear : state.year, simulation.config.world) : undefined
  const migrationCost = target ? currentCountry.gdp * .12 + countryById(destination).gdp * .025 : 0
  const amountNumber = Number(amount)
  const validAmount = Number.isFinite(amountNumber) && amountNumber > 0 && amountNumber <= 1e12
  const adult = state.age >= 18 && !state.ended
  return <div className="life-economy"><div className="economy-context"><div><span>当前教育</span><strong>{simulation.education}</strong></div><div><span>当前职业</span><strong>{simulation.occupation}</strong></div><div><span>生活在</span><strong>{currentCountry.name}</strong></div></div>
    <section className="economy-overview"><p>你的净资产 <span>PPP 国际元</span></p><strong>{amountText(assetTotal(simulation))}</strong><small>现金 + 投资 + 自住房价值 − 债务</small><dl><div><dt>可用现金</dt><dd>{amountText(economy.cash)}</dd></div><div><dt>投资资产</dt><dd>{amountText(economy.investments)}</dd></div><div><dt>本年收入</dt><dd>{amountText(economy.annualIncome)}</dd></div><div><dt>本年支出</dt><dd>{amountText(economy.annualExpenses)}</dd></div><div><dt>债务</dt><dd>{amountText(economy.debt)}</dd></div><div><dt>自住房价值</dt><dd>{amountText(economy.homeValue)}</dd></div></dl><p className="economy-return">本年投资回报 <strong className={economy.investmentReturn < 0 ? 'negative' : ''}>{economy.investmentReturn > 0 ? '+' : ''}{amountText(economy.investmentReturn)} PPP</strong></p></section>
    <section className="economy-section"><div className="foundation-section-title"><h3>把资源用在生活里</h3><span>{state.age < 6 ? '6 岁后可以安排支出' : '按实际现金结算'}</span></div><label className="foundation-label spending-amount">本次金额 · PPP 国际元<input type="number" min="0.01" max="1000000000000" step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /><small>投入投资与还贷是资产转移；其他安排会计入本年支出。</small></label><div className="spending-actions">{SPENDING.map(item => <button type="button" key={item.action} disabled={state.ended || state.age < (item.adult ? 18 : 6) || !validAmount} onClick={() => onAction(item.action, amountNumber)}><strong>{item.name}</strong><small>{item.detail}</small><ArrowRight size={15} /></button>)}</div></section>
    <section className="economy-section"><div className="foundation-section-title"><h3>投资怎么安排</h3><span>18 岁后可调整</span></div><div className="investment-options">{INVESTMENTS.map(policy => <button type="button" key={policy.id} className={economy.policy === policy.id ? 'selected' : ''} disabled={!adult} aria-pressed={economy.policy === policy.id} onClick={() => onPolicy(policy.id)}><span><strong>{policy.name}</strong><small>{policy.risk}</small></span><p>{policy.description}</p>{economy.policy === policy.id ? <span className="investment-selected">当前配置</span> : null}</button>)}</div><p className="foundation-help">切换配置收取投资资产的 0.3% 手续费。成年后每年会将结余的 20% 转入投资；收益为游戏模型结果。</p></section>
    <section className="economy-section housing-section"><div><h3>{economy.homeOwned ? '属于自己的家' : '安顿一个自己的家'}</h3><p>{economy.homeOwned ? `自住房估值 ${amountText(economy.homeValue)} PPP，房贷已计入总债务。` : `当地房屋模型价格 ${amountText(currentCountry.gdp * 4.5)} PPP，首付 ${amountText(currentCountry.gdp * .9)} PPP，其余计入贷款。`}</p></div><button type="button" className="secondary-button" disabled={!adult || economy.homeOwned} onClick={() => onAction('home')}>{economy.homeOwned ? '已拥有自住房' : '支付首付购房'}</button></section>
    <section className="economy-section"><div className="foundation-section-title"><h3>去另一个地方生活</h3><span>18 岁后可迁居</span></div><div className="migration-form"><label className="foundation-label">目的地<select value={destination} disabled={!adult} onChange={event => setDestination(event.target.value)}><CountryOptions emptyLabel="选择新的国家 / 地区" /></select></label><button type="button" className="primary-button" disabled={!adult || !destination || destination === simulation.currentCountryId} onClick={() => onMigrate(destination)}>确认迁居 <ArrowRight size={15} /></button></div>{target ? <div className="migration-preview"><span>搬迁费用 <strong>{amountText(migrationCost)} PPP</strong></span><span>当地人均 GDP <strong>{amountText(target.gdp)} PPP</strong></span><span>当地预期寿命 <strong>{target.lifeExpectancy.toFixed(1)} 年</strong></span></div> : null}<p className="foundation-help">迁居保留学历、家庭与已有资产；目的地条件会影响之后的收入与生命风险。费用不足时无法迁居。</p></section>
  </div>
}

const REFLECTION_PROMPTS: Record<number, string> = { 5: '你刚刚开始认识这个世界。此刻最想记住的是什么？', 15: '站在成长的路口，你希望未来的自己成为什么样的人？', 30: '一路走到这里，哪些选择、哪些人，对你最重要？', 50: '半生的时光里，有什么值得留下，又有什么愿意放下？', 70: '回望一路的相遇与告别，你想对这一生说些什么？' }

export function Reflection({ age, onSave }: { age: number; onSave: (text: string) => void }) {
  const [text, setText] = useState('')
  return <form className="life-reflection" onSubmit={event => { event.preventDefault(); onSave(text.trim()) }}><span className="reflection-leaf"><Leaf size={27} /></span><h3>写给 {age} 岁的自己</h3><p>{REFLECTION_PROMPTS[age] ?? '时间走到了这里。停一停，记下此刻的心情。'}</p><label className="foundation-label"><span className="sr-only">此刻的心情（可选，最多 200 字）</span><textarea value={text} maxLength={200} rows={5} placeholder="留下一句话，也可以不写，继续向前……" onChange={event => setText(event.target.value)} /><small className="reflection-count">{text.length} / 200</small></label><div><button type="button" className="text-button" onClick={() => onSave('')}>此刻不写</button><button type="submit" className="primary-button">{text.trim() ? '收好这段心情' : '继续向前'} <ArrowRight size={16} /></button></div></form>
}

export function LifeEnding({ state, simulation, onNew, onHistory, onShare }: { state: GameState; simulation: Simulation; onNew: () => void; onHistory: () => void; onShare: () => void }) {
  const family = state.people.filter(person => !person.role.endsWith('已离世'))
  const finalCountry = countryById(simulation.currentCountryId)
  const career = [...new Set(simulation.years.map(year => year.occupation).filter(job => !['由家人照顾', '学生', '等待工作机会'].includes(job)))]
  const averageHappiness = simulation.years.reduce((sum, year) => sum + year.happiness, 0) / Math.max(1, simulation.years.length)
  return <section className="life-ending"><div className="ending-scene"><PixelScene state={state} simulation={simulation} showCaption={false}/></div><h1>{state.config.name}的一生</h1><p className="ending-dates">{simulation.config.birthYear} — {state.year}<span>享年 {state.age} 岁</span></p><p className="ending-narrative">{state.ending ?? `${state.config.name}出生于${simulation.birth.countryName}，在${finalCountry.name}走到了${state.age}岁。一路的选择与相遇，已经成为这一生独有的故事。`}</p><div className="ending-reason"><span>生命终点</span><strong>{simulation.cause ?? '生命自然终止'}</strong></div><dl className="ending-facts"><div><dt>出生地与性别</dt><dd>{simulation.birth.countryName} · {simulation.birth.sex}</dd></div><div><dt>最后生活在</dt><dd>{finalCountry.name}</dd></div><div><dt>教育经历</dt><dd>{simulation.education}</dd></div><div><dt>走过的职业</dt><dd>{career.length ? career.join('、') : '尚未开始职业生涯'}</dd></div><div><dt>家庭与相遇</dt><dd>{simulation.children} 位孩子 · {family.length} 位仍在世的亲友</dd></div><div><dt>最终净资产</dt><dd>{amountText(assetTotal(simulation))} PPP</dd></div><div><dt>一生平均幸福感</dt><dd>{Math.round(averageHappiness)} / 100</dd></div><div><dt>留下的手记</dt><dd>{simulation.notes.length} 则</dd></div></dl>{simulation.notes.length ? <blockquote>“{simulation.notes[simulation.notes.length - 1]!.text}”<cite>—— {simulation.notes[simulation.notes.length - 1]!.age} 岁时，写给自己</cite></blockquote> : null}<p className="ending-note">这段人生会保存在本机的人生档案里，你可以回看其中的年份与选择。</p><div className="ending-actions"><button className="secondary-button" onClick={onHistory}><BookOpen size={16} /> 回看这一生</button><button className="secondary-button" onClick={onShare}>分享人生卡</button><button className="primary-button" onClick={onNew}><Sparkles size={16} /> 再活一次</button></div></section>
}
