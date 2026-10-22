import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app.mjs';
import { isGameState } from './schema.mjs';

function state(overrides = {}) {
  return {
    version: 1, id: 'life-1', config: { name: '林知夏', birthYear: 1990, location: '杭州', startAge: 18, intelligence: 60, seed: 4242 },
    age: 19, year: 2009, stats: { health: 80, happiness: 65, knowledge: 50, wealth: 40 }, focus: 'balance',
    people: [
      { id: 'friend-1', name: '许安', role: '朋友', age: 20, personality: '直率，喜欢摄影', closeness: 68, trust: 66,
        mood: '期待', avatar: 2, memories: ['2008年一起爬山'], messages: [{ id: 'chat-1', role: 'assistant', text: '下次一起看展吧。', year: 2008 }] },
      { id: 'friend-2', name: '周晴', role: '同学', age: 19, personality: '细心，热爱音乐', closeness: 58, trust: 60,
        mood: '平静', avatar: 3, memories: ['一起完成课程项目'], messages: [] },
    ],
    history: [{ id: 'event-old', year: 2008, age: 18, kind: 'life', title: '进入大学', description: '你开始了新的生活。', choices: [], source: 'local' }],
    currentEvent: { id: 'event-now', year: 2009, age: 19, kind: 'choice', title: '新的选择', description: '你收到社团邀请。',
      choices: [{ id: 'accept', label: '加入', hint: '认识新朋友', effects: { happiness: 3 } }], source: 'local' },
    worldMessages: [{ id: 'world-old', speaker: '许安', target: '周晴', text: '周末有空吗？', year: 2009 }],
    ended: false, turn: 1, ...overrides,
  };
}

function generated(overrides = {}) {
  return { event: { kind: 'choice', title: '周末的邀请', description: '许安约你和周晴一起去看摄影展。', choices: [
    { id: 'visit', label: '一起看展', hint: '见见老朋友', effects: { happiness: 90 }, personId: 'friend-1', relationshipDelta: 20 },
    { id: 'study', label: '准备考试', hint: '把精力留给学业', effects: { knowledge: 5 } },
  ] }, worldMessages: [{ speaker: 'friend-1', target: 'friend-2', text: '我们也叫上知夏吧。' }], ...overrides };
}

function modelResponse(value) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function appServer(t, options = {}) {
  const server = createServer(createApp({ ...options, config: { apiKey: 'test-secret-key', ...options.config } }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function post(base, route, body, headers = {}) {
  const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function rawRequest(base, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(base);
    const request = httpRequest({ hostname: url.hostname, port: url.port, path, method: options.method ?? 'GET', headers: options.headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    if (options.chunks) for (const chunk of options.chunks) request.write(chunk);
    request.end();
  });
}

test('status reports real key configuration and model without exposing credentials', async (t) => {
  const base = await appServer(t, { config: { apiKey: '', model: 'custom-deepseek', accessToken: 'private-token' } });
  const response = await fetch(`${base}/api/status`);
  assert.deepEqual(await response.json(), { configured: false, provider: 'DeepSeek', model: 'custom-deepseek', requiresAccessToken: true });
  const missing = await post(base, '/api/turn', { state: state() }, { Authorization: 'Bearer private-token' });
  assert.equal(missing.status, 503);
  assert.equal(missing.body.error.code, 'MODEL_NOT_CONFIGURED');
});

test('turn enriches the already advanced year, validates JSON, and clamps effects', async (t) => {
  const calls = [];
  const base = await appServer(t, { fetch: async (url, options) => { calls.push({ url, options }); return modelResponse(generated()); } });
  const input = state();
  const result = await post(base, '/api/turn', { state: input });
  assert.equal(result.status, 200);
  assert.equal(result.body.event.id, input.currentEvent.id);
  assert.equal(result.body.event.year, input.year);
  assert.equal(result.body.event.age, input.age);
  assert.equal(result.body.event.source, 'deepseek');
  assert.equal(result.body.event.choices[0].effects.happiness, 12);
  assert.equal(result.body.event.choices[0].relationshipDelta, 12);
  assert.equal(result.body.worldMessages[0].speaker, '许安');
  assert.equal(result.body.worldMessages[0].target, '周晴');
  assert.equal(result.body.worldMessages[0].year, 2009);
  assert.equal(input.currentEvent.source, 'local');
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret-key');
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.model, 'deepseek-flash');
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.deepEqual(payload.thinking, { type: 'disabled' });
  assert.match(payload.messages[0].content, /json/u);
  assert.match(payload.messages[1].content, /进入大学/u);
  assert.match(payload.messages[1].content, /一起爬山/u);
});

test('chat uses selected NPC memory, conversation, and shared recent world history', async (t) => {
  let payload;
  const base = await appServer(t, { fetch: async (_, options) => { payload = JSON.parse(options.body); return modelResponse({ reply: '还记得上次爬山吗？这次想去看展。' }); } });
  const result = await post(base, '/api/chat', { state: state(), personId: 'friend-1', message: '你最近有什么打算？' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { reply: '还记得上次爬山吗？这次想去看展。', source: 'deepseek' });
  const context = JSON.parse(payload.messages[1].content);
  assert.equal(context.speakingPerson.id, 'friend-1');
  assert.equal(context.speakingPerson.recentConversation[0].text, '下次一起看展吧。');
  assert.equal(context.recentWorldMessages[0].text, '周末有空吗？');
  assert.equal(context.recentHistory[0].year, 2008);
});

test('world intelligence changes temperature, detail budget, and bounded autonomous dialogue', async (t) => {
  const payloads = [];
  const base = await appServer(t, { fetch: async (_, options) => { payloads.push(JSON.parse(options.body)); return modelResponse(generated({ worldMessages: [] })); } });
  for (const intelligence of [0, 100]) {
    const input = state(); input.config.intelligence = intelligence;
    assert.equal((await post(base, '/api/turn', { state: input })).status, 200);
  }
  assert.ok(payloads[0].temperature < payloads[1].temperature);
  assert.ok(payloads[0].max_tokens < payloads[1].max_tokens);
  assert.match(payloads[0].messages[0].content, /最多0条/u);
  assert.match(payloads[1].messages[0].content, /最多7条/u);
});

test('authentication, source validation, and HTTP methods reject unauthorized work', async (t) => {
  let calls = 0;
  const base = await appServer(t, { config: { accessToken: 'session-token' }, fetch: async () => { calls++; return modelResponse(generated()); } });
  assert.equal((await post(base, '/api/turn', { state: state() })).status, 401);
  assert.equal((await post(base, '/api/turn', { state: state() }, { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await post(base, '/api/turn', { state: state() }, { Authorization: 'Bearer session-token', Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await post(base, '/api/turn', { state: state() }, { Authorization: 'Bearer session-token', Origin: base })).status, 200);
  assert.equal((await fetch(`${base}/api/turn`)).status, 405);
  assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
  assert.equal(calls, 1);
});

test('an explicit public origin supports TLS reverse proxies without opening CORS', async (t) => {
  const base = await appServer(t, { config: { publicOrigin: 'https://life.example.com' }, fetch: async () => modelResponse(generated()) });
  assert.equal((await post(base, '/api/turn', { state: state() }, { Origin: 'https://life.example.com' })).status, 200);
  assert.equal((await post(base, '/api/turn', { state: state() }, { Origin: 'https://life.example.com.evil.test' })).status, 403);
  assert.equal((await post(base, '/api/turn', { state: state() }, { Origin: base })).status, 403);
});

test('malformed state, unknown people, empty chats and prototype-like keys do not reach provider', async (t) => {
  let calls = 0;
  const base = await appServer(t, { fetch: async () => { calls++; return modelResponse({ reply: '你好' }); } });
  const invalid = [null, {}, state({ stats: { health: 'full' } }), state({ currentEvent: null }), state({ people: [null] }), state({ year: 2010 })];
  for (const input of invalid) assert.equal((await post(base, '/api/turn', { state: input })).status, 400);
  assert.equal((await post(base, '/api/chat', { state: state(), personId: '__proto__', message: '你好' })).status, 400);
  assert.equal((await post(base, '/api/chat', { state: state(), personId: 'friend-1', message: ' ' })).status, 400);
  assert.equal((await post(base, '/api/chat', { state: state(), personId: 'friend-1', message: 'a'.repeat(1001) })).status, 400);
  assert.equal((await post(base, '/api/turn', { state: state({ ended: true }) })).status, 400);
  assert.equal(calls, 0);
});

test('body parsing rejects wrong media types, malformed JSON, and declared or streamed oversized bodies', async (t) => {
  const base = await appServer(t, { fetch: async () => { throw new Error('must not call'); } });
  assert.equal((await fetch(`${base}/api/turn`, { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(`${base}/api/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
  assert.equal((await post(base, '/api/turn', { padding: 'a'.repeat(257 * 1024) })).status, 413);
  const streamed = await rawRequest(base, '/api/turn', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }, chunks: ['a'.repeat(130 * 1024), 'b'.repeat(130 * 1024)] });
  assert.equal(streamed.status, 413);
});

test('invalid generated choices, NPC references, and unbounded dialogue are rejected', async (t) => {
  const invalid = [
    generated({ event: { ...generated().event, choices: [{ id: 'x', label: 'x', hint: '', effects: {} }] } }),
    generated({ event: { ...generated().event, choices: generated().event.choices.map((choice) => ({ ...choice, personId: 'invented-person' })) } }),
    generated({ event: { ...generated().event, choices: generated().event.choices.map((choice) => ({ ...choice, effects: { exploit: 9 } })) } }),
    generated({ worldMessages: [{ speaker: '虚构人物', text: '你好' }] }),
    generated({ worldMessages: Array.from({ length: 8 }, () => ({ speaker: '许安', text: '很多话' })) }),
    { reply: 'wrong endpoint format' },
  ];
  let index = 0;
  const base = await appServer(t, { fetch: async () => modelResponse(invalid[index++]) });
  for (let i = 0; i < invalid.length; i++) {
    const result = await post(base, '/api/turn', { state: state() });
    assert.equal(result.status, 502);
    assert.equal(result.body.error.code, 'INVALID_MODEL_OUTPUT');
  }
});

test('provider failure, invalid envelopes and error content stay private', async (t) => {
  const secret = 'sk-private-provider-secret';
  const responses = [
    () => new Response(`${secret}: authentication failed`, { status: 401 }),
    () => new Response(`not json: ${secret}`, { status: 200 }),
    () => new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{}\n```' } }] }), { status: 200 }),
    () => { throw new Error(`socket error ${secret}`); },
    () => new Response('a'.repeat(129 * 1024), { status: 200 }),
  ];
  let index = 0;
  const base = await appServer(t, { fetch: async () => responses[index++]() });
  for (let i = 0; i < responses.length; i++) {
    const result = await post(base, '/api/turn', { state: state() });
    assert.equal(result.status, 502);
    assert.ok(!JSON.stringify(result.body).includes(secret));
    assert.ok(!JSON.stringify(result.body).includes('authentication failed'));
  }
});

test('provider timeout aborts work and releases concurrency for a later request', async (t) => {
  let calls = 0;
  let signal;
  const base = await appServer(t, { config: { timeoutMs: 20, maxConcurrent: 1 }, fetch: async (_, options) => {
    if (++calls === 1) { signal = options.signal; return new Promise(() => {}); }
    return modelResponse(generated());
  } });
  const result = await post(base, '/api/turn', { state: state() });
  assert.equal(result.status, 504);
  assert.equal(result.body.error.code, 'MODEL_TIMEOUT');
  assert.equal(signal.aborted, true);
  assert.equal((await post(base, '/api/turn', { state: state() })).status, 200);
});

test('rate limit blocks extra work and resets after its window', async (t) => {
  let now = 1000;
  const base = await appServer(t, { config: { rateLimit: 1, rateWindowMs: 100 }, now: () => now, fetch: async () => modelResponse(generated()) });
  assert.equal((await post(base, '/api/turn', { state: state() })).status, 200);
  const limited = await post(base, '/api/turn', { state: state() });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
  assert.ok(limited.headers.get('retry-after'));
  now += 101;
  assert.equal((await post(base, '/api/turn', { state: state() })).status, 200);
});

test('concurrency cap prevents simultaneous provider work', async (t) => {
  let release;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const base = await appServer(t, { config: { maxConcurrent: 1 }, fetch: async () => { started(); await new Promise((resolve) => { release = resolve; }); return modelResponse(generated()); } });
  const first = post(base, '/api/turn', { state: state() });
  await ready;
  const second = await post(base, '/api/turn', { state: state() });
  assert.equal(second.status, 429);
  assert.equal(second.body.error.code, 'SERVER_BUSY');
  release();
  assert.equal((await first).status, 200);
});

test('static serving supports assets and HEAD, blocks traversal, dotfiles and symlink escapes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'life-crossroads-server-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'dist');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>人生岔路</title>');
  await writeFile(join(root, 'assets', 'game.js'), 'console.log("game")');
  await writeFile(join(directory, 'private.txt'), 'private server secret');
  await writeFile(join(root, '.env'), 'private server secret');
  await symlink(join(directory, 'private.txt'), join(root, 'escaped.txt'));
  const base = await appServer(t, { config: { staticDir: root } });
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /人生岔路/u);
  assert.match(home.headers.get('content-type'), /text\/html/u);
  const asset = await fetch(`${base}/assets/game.js`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(`${base}/assets/game.js`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
  for (const path of ['/%2e%2e/private.txt', '/%2eenv', '/escaped.txt', '/assets/..%5c..%5cprivate.txt', '/%00']) {
    const result = await rawRequest(base, path);
    assert.equal(result.status, 404, path);
    assert.ok(!result.text.includes('private server secret'));
  }
});

test('state validator checks nested fields and cross references without throwing', () => {
  assert.equal(isGameState(state()), true);
  const input = state(); input.people.push({ ...input.people[0] });
  assert.equal(isGameState(input), false);
  assert.equal(isGameState(state({ history: [null] })), false);
  const broken = state(); broken.currentEvent.choices[0].personId = 'missing';
  assert.equal(isGameState(broken), false);
});

test('departed NPC chats are rejected before a provider call and retained in valid saves', async (t) => {
  let calls = 0;
  const base = await appServer(t, { fetch: async () => { calls++; return modelResponse({ reply: '不应生成' }); } });
  const game = state();
  game.people[0].role += ' · 已离世';
  game.people[0].age = 100;
  assert.equal(isGameState(game), true);
  const result = await post(base, '/api/chat', { state: game, personId: 'friend-1', message: '好久不见。' });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'PERSON_UNAVAILABLE');
  assert.equal(calls, 0);
});

test('turn prompts retain departed memories outside active NPCs and reject their new interactions', async (t) => {
  const game = state();
  game.people[0].role += ' · 已离世';
  game.people[0].age = 100;
  const choices = [
    { id: 'remember', label: '整理旧照片', hint: '珍惜共同的记忆', effects: { happiness: 3 } },
    { id: 'continue', label: '和朋友散步', hint: '把日子继续过好', effects: { health: 3 }, personId: 'friend-2', relationshipDelta: 2 },
  ];
  const valid = { event: { ...generated().event, choices }, worldMessages: [{ speaker: 'friend-2', text: '你愿意聊聊他吗？' }] };
  const outputs = [
    valid,
    { ...valid, event: { ...valid.event, choices: [{ ...choices[0], personId: 'friend-1' }, choices[1]] } },
    { ...valid, worldMessages: [{ speaker: 'friend-1', text: '我又回来了。' }] },
    { ...valid, worldMessages: [{ speaker: 'friend-2', target: 'friend-1', text: '一起出门吧。' }] },
  ];
  const contexts = [];
  const base = await appServer(t, { fetch: async (_, options) => {
    contexts.push(JSON.parse(JSON.parse(options.body).messages[1].content));
    return modelResponse(outputs[contexts.length - 1]);
  } });
  assert.equal((await post(base, '/api/turn', { state: game })).status, 200);
  assert.deepEqual(contexts[0].people.map((person) => person.id), ['friend-2']);
  assert.equal(contexts[0].pastRelationships[0].name, '许安');
  assert.deepEqual(contexts[0].pastRelationships[0].memories, ['2008年一起爬山']);
  assert.equal(contexts[0].pastRelationships[0].id, undefined);
  for (let i = 1; i < outputs.length; i++) {
    const result = await post(base, '/api/turn', { state: game });
    assert.equal(result.status, 502);
    assert.equal(result.body.error.code, 'INVALID_MODEL_OUTPUT');
  }
});
