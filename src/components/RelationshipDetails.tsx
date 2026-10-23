import type { Person, RelationshipAction } from '../game/types.ts'

const delta = (value: number) => `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}`
export default function RelationshipDetails({ person, year, age, disabled = false, onAction }: {
  person: Person; year: number; age: number; disabled?: boolean; onAction?: (action: RelationshipAction) => void;
}) {
  const changes = person.relationshipHistory ?? []
  const latest = changes.at(-1)
  const pending = (person.commitments ?? []).filter(promise => promise.status === 'pending')
  const keys = person.relationshipYear?.year === year ? person.relationshipYear.keys : []
  const unavailable = (action: RelationshipAction) => disabled || person.age < 3 || age < 3 || (age < 6 && ['help', 'promise-company', 'promise-help', 'cancel-promise'].includes(action)) || keys.includes(`action:${action}`)
  const promised = (kind: 'company' | 'help') => person.commitments?.some(promise => promise.kind === kind && (promise.status === 'pending' || promise.createdYear === year))
  return <div className="relationship-details">
    {latest && <div className="relationship-feedback" role="status"><header><strong>关系回响</strong><span>{latest.year} 年</span></header><p>{latest.reason}</p><div><span>亲密 {delta(latest.closenessDelta)}</span><span>信任 {delta(latest.trustDelta)}</span></div></div>}
    {!!pending.length && <div className="relationship-promises"><strong>还记得的约定</strong>{pending.map(promise => <div key={promise.id}><p>{promise.kind === 'company' ? '留出时间陪伴一次' : '实际帮上一次忙'}<small>{promise.dueYear} 年结束前</small></p>{onAction && <button className="secondary-button" disabled={unavailable(promise.kind)} onClick={() => onAction(promise.kind)}>{promise.kind === 'company' ? '去陪伴' : '去帮忙'}</button>}</div>)}{pending.some(promise => keys.includes(`action:${promise.kind}`)) && <small>这一年已做过这类行动。下一年还可以继续兑现约定。</small>}</div>}
    {onAction && <><div className="relationship-actionbar" aria-label="用行动回应">{([['listen', '认真倾听'], ['company', age < 6 ? '一起玩一会儿' : '陪伴一会儿'], ['help', '帮个小忙']] as const).map(([action, label]) => <button type="button" className="secondary-button" key={action} disabled={unavailable(action)} onClick={() => onAction(action)}>{label}</button>)}</div><details className="relationship-extras"><summary>道歉与约定</summary><div className="relationship-actionbar"><button type="button" className="secondary-button" disabled={unavailable('apologize')} onClick={() => onAction('apologize')}>认真道歉</button><button type="button" className="secondary-button" disabled={unavailable('promise-company') || promised('company')} onClick={() => onAction('promise-company')}>约好下次相伴</button><button type="button" className="secondary-button" disabled={unavailable('promise-help') || promised('help')} onClick={() => onAction('promise-help')}>答应下次帮忙</button>{!!pending.length && <button type="button" className="text-button" disabled={unavailable('cancel-promise')} onClick={() => onAction('cancel-promise')}>说明无法履行以上约定</button>}</div><p>话语会被记住，行动才会兑现约定。相处需要时间，重复同一句话或同一种行动不会反复增加关系。</p></details></>}
    {!!changes.length && <details className="relationship-change-log"><summary>查看关系变化 · {changes.length}</summary><ol>{[...changes].reverse().map(change => <li key={change.id}><span>{change.year} 年 · 亲密 {delta(change.closenessDelta)} · 信任 {delta(change.trustDelta)}</span><p>{change.reason}</p></li>)}</ol></details>}
  </div>
}
