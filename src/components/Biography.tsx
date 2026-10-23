import { ArrowUpRight, Wallet } from 'lucide-react';
import type { GameState } from '../game/types.ts';
import type { Simulation } from '../simulation/types.ts';
import { countryAt } from '../simulation/countries.ts';
import PixelPortrait from './PixelPortrait';
import { deriveSceneModel } from '../pixel/scene.ts';
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
export default function Biography({ state, simulation, onEconomy, onTimeline, disabled }: {
  state: GameState; simulation: Simulation; onEconomy: () => void; onTimeline: () => void; disabled: boolean;
}) {
  const country = countryAt(simulation.currentCountryId, state.year, simulation.config.world);
  const economy = simulation.economy;
  const urban = deriveSceneModel(state, simulation).urban;
  const netWorth = economy.cash + economy.investments + economy.homeValue - economy.debt;
  const stats = [
    { id: 'health', label: '健康', value: state.stats.health },
    { id: 'happiness', label: '幸福', value: state.stats.happiness },
    { id: 'knowledge', label: '知识', value: state.stats.knowledge },
    { id: 'relationships', label: '人际关系', value: simulation.relationships },
  ];
  return <aside className="biography">
    <section className="identity-card">
      <div className="identity-card-top"><span>身份纪录 · {simulation.birth.countryId}</span><span>{state.config.birthYear}</span></div>
      <div className="identity">
        <PixelPortrait name={state.config.name} age={state.age} role="me" sex={simulation.birth.sex} size={64}/>
        <div className="identity-text"><h2>{state.config.name}</h2><dl className="identity-facts">
          <dt>性别</dt><dd>{simulation.birth.sex === '女' ? '女性' : '男性'}</dd>
          <dt>出生</dt><dd>{simulation.birth.countryName} · {state.config.birthYear} 年</dd>
          <dt>居住地</dt><dd>{country.name} · {urban ? '城市' : '乡村'}</dd>
          <dt>出身家庭</dt><dd title={simulation.birth.familyClass} className="family-quintile">{'●'.repeat(simulation.birth.familyQuintile)}<span>{'○'.repeat(5 - simulation.birth.familyQuintile)}</span></dd>
          <dt>学历</dt><dd>{simulation.education}</dd>
          <dt>生活</dt><dd>{simulation.occupation}</dd>
        </dl></div>
      </div>
      <div className="identity-code" aria-hidden="true">I&lt;{simulation.birth.countryId}{state.config.name.replace(/\s/g, '<').slice(0, 18)}&lt;&lt;&lt;&lt;&lt;<br/>{state.config.birthYear}{simulation.birth.sex === '女' ? 'F' : 'M'}{simulation.birth.countryId}&lt;{String(state.age).padStart(3, '0')}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</div>
    </section>
    <section className="status-panel panel"><div className="section-heading"><h3>状态</h3><span>0—100</span></div>
      <div className="stats" aria-label="人生状态">{stats.map(s => <div className={`stat ${s.id}`} key={s.id}>
        <span className="stat-label">{s.label}</span><div className="progress-track" role="meter" aria-label={s.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.value}><i style={{ width: `${s.value}%` }}/></div><strong>{Math.round(s.value)}</strong>
      </div>)}</div>
      <details className="stat-help"><summary>这些状态代表什么？</summary><p>健康影响风险与日常活动；幸福记录生活感受；知识影响学习与职业机会；人际关系来自亲密与信任。状态提高机会，选择仍会遇到意外。</p></details>
      <div className="finance-summary"><div><span>净资产 · PPP 美元</span><strong>{state.age < 16 ? '—' : number.format(netWorth)}</strong><small>{state.age < 16 ? '还在家人的照顾下' : economy.homeOwned ? '拥有自住房' : '现金、投资与债务合计'}</small></div><div><span>年收入 · PPP 美元</span><strong>{state.age < 16 ? '—' : number.format(economy.annualIncome)}</strong><small>{state.age < 16 ? `家境：第 ${simulation.birth.familyQuintile} 分位` : simulation.occupation}</small></div></div>
      <button className="secondary-button full-width" disabled={disabled} onClick={onEconomy}><Wallet size={14}/>花钱 · 投资</button>
    </section>
    <section className="panel timeline-shortcut"><div><h3>人生的另一种可能</h3><p>{state.config.birthYear} — {state.year} · {state.age} 岁</p></div><button className="icon-button" onClick={onTimeline} aria-label="查看完整时间线"><ArrowUpRight size={18}/></button></section>
    <details className="country-profile panel"><summary>{country.name} · 生活环境</summary><dl>
      <dt>人口</dt><dd>{number.format(country.population)}</dd><dt>每年出生人数</dt><dd>{number.format(country.births)}</dd>
      <dt>平均寿命 · 女 / 男</dt><dd>{country.femaleLifeExpectancy.toFixed(1)} / {country.maleLifeExpectancy.toFixed(1)} 岁</dd>
      <dt>婴儿死亡率</dt><dd>{country.infantMortality.toFixed(1)}‰</dd><dt>人均 GDP · PPP</dt><dd>${number.format(country.gdp)}</dd>
      <dt>城市人口</dt><dd>{Math.round(country.urban * 100)}%</dd><dt>总生育率</dt><dd>{country.fertility.toFixed(2)}</dd>
    </dl><p>资料来自 WDI 与官方补充数据；缺失年份及未来条件使用游戏情景。</p></details>
  </aside>;
}
