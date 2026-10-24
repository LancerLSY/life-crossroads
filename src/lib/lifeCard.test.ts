import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulation } from '../simulation/core.ts'
import { createLifeCardSvg, PUBLIC_PLAY_URL } from './lifeCard.ts'

const SCENE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='

function fixture() {
  return createSimulation({ seed: 918, countryId: 'JPN', birthYear: 2000, name: '小岔' })
}

test('birth card contains birth facts, embedded scene and the fixed playable address', () => {
  const { state, simulation } = fixture()
  const before = structuredClone({ state, simulation })
  const svg = createLifeCardSvg(state, simulation, SCENE)
  assert.match(svg, /width="640" height="820" viewBox="0 0 640 820"/)
  assert.ok(svg.includes('人生岔路 · 出生登记'))
  assert.ok(svg.includes('小岔'))
  assert.ok(svg.includes(`${simulation.birth.countryName} · ${simulation.birth.sex}`))
  assert.ok(svg.includes(`${simulation.birth.urban ? '城市' : '乡村'} · ${simulation.birth.familyClass}`))
  assert.ok(svg.includes('2000 — 未完待续'))
  assert.ok(svg.includes(`href="${SCENE}"`))
  assert.ok(svg.includes('image-rendering:pixelated'))
  assert.equal(PUBLIC_PLAY_URL, 'https://lancerlsy.github.io/life-crossroads/')
  assert.equal(svg.split(PUBLIC_PLAY_URL).length - 1, 1)
  assert.deepEqual({ state, simulation }, before)
})

test('ending card identifies the completed lifespan and actual cause', () => {
  const { state, simulation } = fixture()
  const svg = createLifeCardSvg({ ...state, ended: true, age: 83, year: 2083 }, { ...simulation, education: '大学毕业', cause: '自然衰老' }, SCENE)
  assert.ok(svg.includes('人生岔路 · 人生档案'))
  assert.ok(svg.includes('2000 — 2083'))
  assert.ok(svg.includes('83岁 · 自然衰老'))
  assert.ok(svg.includes('大学毕业'))
  assert.ok(svg.includes('这一段人生，留在时间里。'))
  assert.ok(!svg.includes('出生登记'))
  assert.ok(!svg.includes('未完待续'))
  assert.ok(createLifeCardSvg({ ...state, ended: true }, simulation, SCENE).includes('一生的终点'))
})

test('card text cannot introduce SVG elements or attributes', () => {
  const { state, simulation } = fixture()
  state.config.name = '<script>&"\'名字'
  simulation.birth.countryName = '国</text><script>x</script>'
  simulation.education = '<image href="https://evil.test">'
  simulation.cause = '" onload="alert(1)'
  const svg = createLifeCardSvg({ ...state, ended: true }, simulation, SCENE)
  assert.ok(svg.includes('&lt;script&gt;&amp;&quot;&apos;名字'))
  assert.ok(svg.includes('&lt;/text&gt;'))
  assert.ok(svg.includes('&quot; onload=&quot;alert(1)'))
  assert.ok(!svg.includes('<script>'))
  assert.ok(!svg.includes('<image href="https:'))
  assert.ok(!svg.includes('" onload="'))
  assert.equal((svg.match(/<image /g) ?? []).length, 1)
})

test('long Unicode names and details stay within card line limits', () => {
  const { state, simulation } = fixture()
  state.config.name = '🎮'.repeat(80)
  simulation.education = '学'.repeat(80)
  const svg = createLifeCardSvg(state, simulation, SCENE)
  assert.ok(svg.includes(`>${'🎮'.repeat(23)}…</text>`))
  assert.ok(svg.includes(`>${'学'.repeat(31)}…</text>`))
  assert.ok(!svg.includes('�'))
  assert.ok(svg.includes('font-size="22"'))
})

test('card exports only selected facts and rejects external or injected scene sources', () => {
  const { state, simulation } = fixture()
  state.people[0].messages.push({ id: 'private', role: 'user', text: 'PRIVATE_TRANSCRIPT', year: 2000 })
  state.worldMessages.push({ id: 'private', speaker: '系统', text: 'PRIVATE_MODEL_RESULT', year: 2000 })
  simulation.notes.push({ age: 0, text: 'PRIVATE_NOTE' })
  const withCredentials = { ...state, apiKey: 'PRIVATE_API_KEY', config: { ...state.config, privateToken: 'PRIVATE_TOKEN' } }
  const svg = createLifeCardSvg(withCredentials, simulation, SCENE)
  for (const secret of ['PRIVATE_TRANSCRIPT', 'PRIVATE_MODEL_RESULT', 'PRIVATE_NOTE', 'PRIVATE_API_KEY', 'PRIVATE_TOKEN']) assert.ok(!svg.includes(secret))
  for (const source of ['https://evil.test/scene.png', 'data:image/svg+xml,<svg/>', `${SCENE}" onload="alert(1)`, '']) {
    assert.throws(() => createLifeCardSvg(state, simulation, source), /本地生成的 PNG/)
  }
})
