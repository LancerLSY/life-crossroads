import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceYear, applyGeneratedEvent, createLife, interact } from '../src/game/engine.ts';
import { isGameState, parseGeneratedTurn } from './schema.mjs';

test('server accepts real engine saves through multiple eras, life stages and NPC interactions', () => {
  for (const birthYear of [1900, 1990, 2100]) {
    for (const startAge of [0, 18, 60, 90]) {
      let game = createLife({ birthYear, startAge, seed: 42 });
      assert.equal(isGameState(game), true, `initial ${birthYear}/${startAge}`);
      while (!game.ended) {
        const present = game.people.find((person) => !person.role.endsWith('已离世'));
        if (present && game.age % 5 === 0) {
          game = interact(game, present.id, '最近还好吗？');
          assert.equal(isGameState(game), true, `chat ${birthYear}/${game.age}`);
        }
        game = advanceYear(game, game.currentEvent.choices[game.turn % game.currentEvent.choices.length]?.id);
        assert.equal(isGameState(game), true, `advanced ${birthYear}/${game.age}`);
      }
    }
  }
});

test('server accepts archived engine relationships with their preserved chats and memories', () => {
  let game = createLife({ startAge: 69, seed: 42 });
  game = interact(game, 'father', '谢谢你一直以来的陪伴。');
  const messages = game.people.find((person) => person.id === 'father').messages;
  while (!game.people.find((person) => person.id === 'father').role.endsWith('已离世')) {
    game = advanceYear(game, game.currentEvent.choices[0]?.id);
  }
  const departed = game.people.find((person) => person.id === 'father');
  assert.equal(departed.age, 100);
  assert.deepEqual(departed.messages, messages);
  assert.ok(departed.memories.length > 0);
  assert.equal(isGameState(game), true);
});

test('validated provider output can be applied and advanced by the actual game engine', () => {
  const initial = createLife({ seed: 7 });
  const game = advanceYear(initial, initial.currentEvent.choices[0]?.id);
  const person = game.people[0];
  const generated = parseGeneratedTurn({
    event: { kind: 'relationship', title: '一段散步时光', description: '你们终于有时间好好聊聊。', choices: [
      { id: 'listen', label: '认真听一听', hint: '给陪伴一点时间', effects: { happiness: 4 }, personId: person.id, relationshipDelta: 6 },
      { id: 'share', label: '分享自己的近况', hint: '让关系更靠近', effects: { happiness: 3, knowledge: 2 } },
    ] },
    worldMessages: [{ speaker: person.id, text: '今天我们慢慢走吧。' }],
  }, game);
  const enriched = applyGeneratedEvent(game, generated.event, generated.worldMessages);
  assert.equal(isGameState(enriched), true);
  assert.equal(enriched.year, game.year);
  assert.equal(enriched.currentEvent.source, 'deepseek');
  assert.equal(enriched.worldMessages.at(-1).text, '今天我们慢慢走吧。');
  assert.equal(isGameState(advanceYear(enriched, enriched.currentEvent.choices[0].id)), true);
});
