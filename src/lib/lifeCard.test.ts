import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { createSimulation } from '../simulation/core.ts'
import { createLifeCardSvg, PUBLIC_PLAY_URL } from './lifeCard.ts'
import playLinkQr from './playLinkQr.json' with { type: 'json' }

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

test('fixed QR matrix preserves the validated play URL, binary modules and white quiet zone', () => {
  assert.equal(playLinkQr.url, PUBLIC_PLAY_URL)
  assert.equal(playLinkQr.rows.length, 43)
  const size = playLinkQr.rows.length
  assert.ok(playLinkQr.rows.every(row => row.length === size && /^[01]+$/.test(row)))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < 4 || y < 4 || x >= size - 4 || y >= size - 4) assert.equal(playLinkQr.rows[y][x], '0')
    }
  }
  assert.ok(playLinkQr.rows.some(row => row.includes('1')))
  assert.equal(createHash('sha256').update(playLinkQr.rows.join('\n')).digest('hex'), 'a99459c6b33a8af1423d4ae3cf56f429bdf1e404bb4c3354ba9496515a81b53a')
})

test('birth and ending cards render a local crisp QR footer beside one readable play URL', () => {
  const { state, simulation } = fixture()
  for (const ended of [false, true]) {
    const svg = createLifeCardSvg({ ...state, ended }, simulation, SCENE)
    const group = svg.match(/<g id="play-link-qr"[\s\S]*?<\/g>/)?.[0]
    assert.ok(group)
    assert.match(group, /role="img" aria-label="扫码免费试玩人生岔路"/)
    assert.match(group, /shape-rendering="crispEdges"/)
    const position = group.match(/translate\((\d+) (\d+)\)/)
    const dimensions = group.match(/<rect width="(\d+)" height="(\d+)" fill="#FFFFFF"/)
    assert.ok(position && dimensions)
    const [, x, y] = position.map(Number)
    const [, width, height] = dimensions.map(Number)
    assert.ok(x >= 24 && x + width <= 616, 'QR stays inside the card panel')
    assert.ok(y >= 692 && y + height <= 796, 'QR fits below the divider without clipping')
    assert.equal(width, height)
    assert.ok(width > 0)
    const address = [...svg.matchAll(/<text ([^>]+)>([^<]*)<\/text>/g)].find(match => match[2] === PUBLIC_PLAY_URL)
    assert.ok(address)
    const linkX = Number(address[1].match(/(?:^| )x="(\d+)"/)?.[1])
    const linkY = Number(address[1].match(/(?:^| )y="(\d+)"/)?.[1])
    const fontSize = Number(address[1].match(/font-size="(\d+)"/)?.[1])
    assert.ok(linkX >= 24 && linkX + PUBLIC_PLAY_URL.length * fontSize * .65 < x, 'readable URL has space beside the QR')
    assert.ok(linkY > y && linkY < y + height)
    assert.ok(svg.includes('扫码试玩，你的人生会走向哪里？'))
    assert.equal(svg.split(PUBLIC_PLAY_URL).length - 1, 1)
    assert.match(group, /<path d="[^"]+" fill="#[0-9A-Fa-f]{6}"/)
    assert.equal((svg.match(/href=/g) ?? []).length, 1)
  }
})
