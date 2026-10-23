import type { Simulation } from '../simulation/types.ts'
const ACTIONS: Record<string, string> = { help: '寻找外界援助', observe: '保持冷静，等待转机', escape: '尝试脱离控制' }

export default function CrisisSummary({ simulation }: { simulation: Simulation }) {
  const crisis = simulation.crisis
  if (!crisis) return null
  const active = crisis.phase !== 'resolved'
  return <section className={`crisis-summary panel ${active ? 'active' : ''}`} aria-label="虚构隐藏剧情记录">
    <strong>{active ? '隐藏支线 · 失联的行程' : crisis.outcome === 'dead' ? '隐藏支线 · 未能归来' : crisis.outcome === 'injured' ? '隐藏支线 · 伤痕仍在' : '隐藏支线 · 重新回到生活'}</strong>
    <p>{active ? '日常时间已经暂停。先处理眼前的处境，每次选择都会立即推进剧情。' : crisis.outcome === 'dead' ? '死亡原因：嘎腰子。此结局来自专门的虚构剧情。' : crisis.outcome === 'injured' ? '你已脱险，但严重伤害会持续影响健康。此前的选择与关系仍然保留。' : '你已脱离危险，可以继续原来的生活与未完成的选择。'}</p>
    <small>虚构彩蛋：成年后从境外到访缅甸有 80% 触发本支线，触发后有 90% 进入致命路线；均为游戏参数，不代表现实风险。同年同种到访方式只抽取一次，刷新不重抽。</small>
    {!!crisis.history.length && <details><summary>回看这段行程</summary><ol>{crisis.history.map((action, index) => <li key={index}>{['失去自由', '辗转求救', '最后的转机'][index]} · {ACTIONS[action]}</li>)}</ol></details>}
  </section>
}
