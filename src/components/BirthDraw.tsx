import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Dices, Globe2, House, Settings2, UserRound } from 'lucide-react'
import { COUNTRIES, countryAt } from '../simulation/countries.ts'
import type { FoundationConfig, Simulation, World } from '../simulation/types.ts'
import type { GameState } from '../game/types.ts'
import PixelPortrait from './PixelPortrait'

const TICKETS = [
  { label: '出生地', icon: Globe2 }, { label: '我的身份', icon: UserRound }, { label: '家庭起点', icon: House },
]
function WorldBackdrop() {
  return <img className="lottery-world-art" src={`${import.meta.env.BASE_URL}assets/birth-world.png`} alt="像素地球、星空与世界各地的城镇" width="1536" height="1024" fetchPriority="high"/>
}

export function BirthWelcome({ onCreate, onSettings, hasSaved, onResume, initialIntelligence = 60 }: {
  onCreate: (config: Partial<FoundationConfig>) => boolean
  onSettings: () => void; hasSaved: boolean; onResume: () => void
  initialIntelligence?: number
}) {
  const currentYear = new Date().getFullYear()
  const [world, setWorld] = useState<World | 'any'>('present')
  const [birthYear, setBirthYear] = useState(currentYear)
  const [drawMode, setDrawMode] = useState<FoundationConfig['drawMode']>('birth')
  const [paceMinutes, setPace] = useState<FoundationConfig['paceMinutes']>(60)
  const [softMode, setSoftMode] = useState(true)
  const [intelligence, setIntelligence] = useState(initialIntelligence)
  const [drawing, setDrawing] = useState(false)
  const submitted = useRef(false)
  const [error, setError] = useState('')
  const previewWorld = world === 'any' ? 'present' : world
  const previewYear = world === 'present' || world === 'any' ? currentYear : birthYear
  const odds = useMemo(() => {
    const field = drawMode === 'birth' ? 'births' : 'population'
    const countries = COUNTRIES.map(country => countryAt(country.id, previewYear, previewWorld))
    const total = countries.reduce((sum, country) => sum + country[field], 0)
    return countries.sort((a, b) => b[field] - a[field]).slice(0, 6).map(country => ({ ...country, share: country[field] / total }))
  }, [drawMode, previewYear, previewWorld])
  function chooseWorld(next: World | 'any') {
    setWorld(next)
    setBirthYear(next === 'past' ? 1980 : next === 'future' ? Math.min(2100, currentYear + 24) : currentYear)
  }
  function draw(event: FormEvent) {
    event.preventDefault()
    if (submitted.current) return
    submitted.current = true; setDrawing(true); setError('')
    try {
      const random = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
      const year = world === 'any' ? 1950 + random % 151 : world === 'present' ? currentYear : birthYear
      const selectedWorld: World = world === 'any' ? year < currentYear ? 'past' : year > currentYear ? 'future' : 'present' : world
      if (onCreate({ world: selectedWorld, birthYear: year, drawMode, paceMinutes, softMode, intelligence })) return
    } catch { setError('这张签暂时没有抽出，请再试一次。') }
    submitted.current = false; setDrawing(false)
  }
  return <main className="birth-lottery">
    <header className="lottery-heading"><h1>出生，是一场<span>抽签</span>。</h1><p>你决定从哪个年代开始，其余交给命运。</p></header>
    <form className="lottery-layout" onSubmit={draw}>
      <section className="lottery-stage" aria-label="出生抽签">
        <WorldBackdrop/>
        <div className="lottery-stage-bottom">
          <div className="birth-tickets">{TICKETS.map(({ label, icon: Icon }) => <div className="birth-ticket sealed" key={label}><Icon size={22}/><span>{label}</span><strong>?</strong></div>)}</div>
          <button type="submit" className="draw-button" disabled={drawing}><Dices size={25}/>{drawing ? '正在抽取…' : '抽取我的人生'}</button>
          <p>姓名、性别、出生地与家庭，随签揭晓。</p>
        </div>
      </section>
      <aside className="lottery-controls">
        <fieldset className="foundation-fieldset"><legend>时间线</legend><div className="world-options">{([
          ['past', '过去'], ['present', '当下'], ['future', '未来'], ['any', '随机'],
        ] as const).map(([value, title]) => <button type="button" key={value} disabled={drawing} className={world === value ? 'selected' : ''} aria-pressed={world === value} onClick={() => chooseWorld(value)}>{title}</button>)}</div></fieldset>
        <div className="lottery-year">{world === 'past' || world === 'future' ? <label>开始年份<input aria-label="开始年份" type="number" required min={world === 'future' ? currentYear + 1 : 1950} max={world === 'past' ? currentYear - 1 : 2100} value={birthYear} disabled={drawing} onChange={event => setBirthYear(Number(event.target.value))}/></label> : <><span>{world === 'any' ? '让年代也交给命运' : '当前年份'}</span><strong>{world === 'any' ? '1950—2100' : currentYear}</strong></>}<small>{world === 'past' ? '历史条件随年份演变' : world === 'future' ? '走进一个可能的未来' : world === 'any' ? '抽签时随机决定出生年份' : '以当代生活条件为基准'}</small></div>
        <fieldset className="foundation-fieldset"><legend>人生节奏</legend><div className="segmented-control">{([30, 60, 90] as const).map(value => <button type="button" key={value} disabled={drawing} className={paceMinutes === value ? 'selected' : ''} aria-pressed={paceMinutes === value} onClick={() => setPace(value)}>{value} 分钟</button>)}</div></fieldset>
        <details className="lottery-settings"><summary>抽签规则与世界设置</summary><label className="foundation-label">抽签权重<select aria-label="抽签权重" value={drawMode} disabled={drawing} onChange={event => setDrawMode(event.target.value as FoundationConfig['drawMode'])}><option value="birth">按年度出生人数</option><option value="population">按总人口</option></select></label><label className="foundation-toggle"><input type="checkbox" checked={softMode} disabled={drawing} onChange={event => setSoftMode(event.target.checked)}/><span>温柔模式<small>降低极端不幸事件的冲击。</small></span></label><label className="foundation-label intelligence-label"><span>世界智能<output>{intelligence}</output></span><input aria-label="出生世界智能" type="range" min="0" max="100" step="5" value={intelligence} disabled={drawing} onChange={event => setIntelligence(Number(event.target.value))}/></label><button type="button" className="text-button" onClick={onSettings}><Settings2 size={14}/>模型连接设置</button></details>
        <p className="lottery-rule">{COUNTRIES.length} 个国家与地区，<br/>{drawMode === 'birth' ? '按出生人数加权抽取。' : '按总人口加权抽取。'}</p>
        {hasSaved && <button type="button" className="text-button lottery-resume" disabled={drawing} onClick={onResume}>继续上次人生<ArrowRight size={14}/></button>}
      </aside>
    </form>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <details className="lottery-odds"><summary>了解抽签概率</summary><p>{world === 'any' ? '以下为当代预览；抽中的年代会改变实际权重。' : `${previewYear} 年的抽签权重。`}出生地由概率抽取，不保证各地出现次数相同。</p><ol>{odds.map(country => <li key={country.id}><span>{country.name}</span><i style={{ width: `${country.share / odds[0]!.share * 100}%` }}/><strong>{(country.share * 100).toFixed(1)}%</strong></li>)}</ol><p>抽样在支持的 {COUNTRIES.length} 个国家与地区内归一化。出生地依据 WDI 数据。家庭财富按 DHS 出生调查加权，并与出生次序、城乡和母亲年龄组联动；调查不足时使用明确标注的参考分布，出生登记中可查看来源与概率。</p></details>
  </main>
}

export function BirthReveal({ state, simulation, onComplete }: { state: GameState; simulation: Simulation; onComplete: () => void }) {
  const [revealed, setRevealed] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 3 : 0)
  const { birth } = simulation
  useEffect(() => {
    if (revealed >= 3) return
    const timer = setTimeout(() => setRevealed(value => value + 1), revealed === 0 ? 850 : 650)
    return () => clearTimeout(timer)
  }, [revealed])
  const facts = [
    { title: birth.countryName, detail: `${simulation.config.birthYear} 年 · ${birth.urban ? '城市' : '乡村'}` },
    { title: state.config.name, detail: birth.sex === '女' ? '一个女孩，刚刚来到这个世界' : '一个男孩，刚刚来到这个世界' },
    { title: birth.familyClass, detail: birth.siblings ? `父母与 ${birth.siblings} 位手足，等着认识你` : '你是这个家庭的第一个孩子' },
  ]
  return <main className="birth-reveal">
    <header className="lottery-heading"><h1>{revealed < 3 ? '命运，正在落笔。' : '世界里，多了一个你。'}</h1><p>{revealed < 3 ? '一张出生签，一段未写完的人生。' : '出生的起点已经落定，未来由你的选择继续。'}</p></header>
    <section className={`lottery-stage reveal-stage ${revealed < 3 ? 'is-drawing' : 'is-revealed'}`} aria-label="出生签揭晓">
      <WorldBackdrop/>
      <div className="reveal-content">
        <div className="reveal-avatar">{revealed >= 2 ? <PixelPortrait name={state.config.name} age={0} role="me" sex={birth.sex} size={96}/> : <Dices size={44}/>}</div>
        <div className="birth-tickets">{TICKETS.map(({ label, icon: Icon }, index) => <article className={`birth-ticket ${revealed > index ? 'revealed' : 'sealed'}`} key={label}><Icon size={20}/><span>{label}</span>{revealed > index ? <><strong>{facts[index].title}</strong><small>{facts[index].detail}</small></> : <strong>?</strong>}</article>)}</div>
        <p className="reveal-announcement" role="status" aria-live="polite">{revealed ? `${TICKETS[revealed - 1].label}：${facts[revealed - 1].title}` : '正在抽取这一次人生…'}</p>
        {revealed >= 3 ? <button className="draw-button" onClick={onComplete}>接过这张人生签<ArrowRight size={20}/></button> : <button className="reveal-skip" onClick={() => setRevealed(3)}>直接揭晓</button>}
      </div>
    </section>
    <p className="reveal-note">抽签结果已确定。接下来，看看家人和你将生活的地方。</p>
  </main>
}
