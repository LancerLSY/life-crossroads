const STAT_KEYS = ['health', 'happiness', 'knowledge', 'wealth'];
const FOCUSES = ['balance', 'study', 'career', 'social', 'health'];
const KINDS = ['life', 'choice', 'relationship', 'world'];

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max, min = 1) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value, min, max) => number(value, min, max) && Number.isInteger(value);
const list = (value, max) => Array.isArray(value) && value.length <= max;
const year = (value) => integer(value, -10000, 10000);
const identifier = (value) => text(value, 100) && !/[\u0000-\u001f]/u.test(value);
const clampEffect = (value) => Math.max(-12, Math.min(12, value));

export const isActivePerson = (person) => !person.role.endsWith('已离世');

function validEffects(value, limit = 100) {
  return object(value) && Object.entries(value).every(([key, effect]) => STAT_KEYS.includes(key) && number(effect, -limit, limit));
}

function validChoice(value, peopleIds) {
  return object(value) && identifier(value.id) && text(value.label, 300) && text(value.hint, 600, 0)
    && validEffects(value.effects)
    && (value.personId === undefined || peopleIds.has(value.personId))
    && (value.relationshipDelta === undefined || number(value.relationshipDelta, -100, 100));
}

function validEvent(value, peopleIds) {
  return object(value) && identifier(value.id) && year(value.year) && integer(value.age, 0, 120)
    && KINDS.includes(value.kind) && text(value.title, 300) && text(value.description, 5000)
    && ['local', 'deepseek'].includes(value.source) && list(value.choices, 8)
    && value.choices.every((choice) => validChoice(choice, peopleIds))
    && new Set(value.choices.map((choice) => choice.id)).size === value.choices.length;
}

function validPerson(value) {
  return object(value) && identifier(value.id) && text(value.name, 100) && text(value.role, 200)
    && integer(value.age, 0, 150) && text(value.personality, 1200) && number(value.closeness, 0, 100)
    && number(value.trust, 0, 100) && text(value.mood, 300) && integer(value.avatar, 0, 10000)
    && list(value.memories, 100) && value.memories.every((memory) => text(memory, 1500))
    && list(value.messages, 100) && value.messages.every((message) => object(message)
      && identifier(message.id) && ['user', 'assistant'].includes(message.role)
      && text(message.text, 5000) && year(message.year));
}

function validWorldMessage(value) {
  return object(value) && identifier(value.id) && text(value.speaker, 100)
    && (value.target === undefined || text(value.target, 100)) && text(value.text, 1500) && year(value.year);
}

function validWorldThreads(value, currentYear, firstYear, peopleIds) {
  if (value === undefined) return true;
  if (!list(value, 9)) return false;
  const ids = new Set();
  const references = new Map(value.filter(object).map(item => [item.id, item.startedYear]));
  let active = 0;
  let resolved = 0;
  return value.every(item => {
    if (!object(item) || !text(item.id, 180) || ids.has(item.id) || !peopleIds.has(item.personId)
      || !text(item.title, 140) || !text(item.cause, 1000) || !text(item.impact, 1000)
      || ![1, 2, 3].includes(item.stage) || !['support', 'distance', 'conflict'].includes(item.direction)
      || !integer(item.startedYear, firstYear, currentYear) || !integer(item.nextYear, item.startedYear, currentYear + 3)) return false;
    ids.add(item.id);
    if (item.status === 'active') active++;
    else if (item.status === 'resolved') resolved++;
    else return false;
    return active <= 3 && resolved <= 6 && (item.relatedThreadId === undefined
      || text(item.relatedThreadId, 180) && item.relatedThreadId !== item.id && references.has(item.relatedThreadId)
        && references.get(item.relatedThreadId) <= item.startedYear);
  });
}

export function isGameState(value) {
  if (!object(value) || value.version !== 1 || !identifier(value.id) || !object(value.config)
    || !text(value.config.name, 100) || !year(value.config.birthYear)
    || !text(value.config.location, 200) || !integer(value.config.startAge, 0, 120)
    || !number(value.config.intelligence, 0, 100) || !number(value.config.seed, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    || !integer(value.age, 0, 120) || !year(value.year) || value.year !== value.config.birthYear + value.age
    || !object(value.stats) || !STAT_KEYS.every((key) => number(value.stats[key], 0, 100))
    || !FOCUSES.includes(value.focus) || !list(value.people, 24) || !value.people.every(validPerson)
    || !list(value.history, 150) || !list(value.worldMessages, 100)
    || !value.worldMessages.every(validWorldMessage) || typeof value.ended !== 'boolean'
    || !integer(value.turn, 0, 1000) || (value.ending !== undefined && !text(value.ending, 5000))) return false;
  const peopleIds = new Set(value.people.map((person) => person.id));
  return validWorldThreads(value.worldThreads, value.year, value.config.birthYear + value.config.startAge, peopleIds)
    && (value.worldUpdatedYear === undefined || integer(value.worldUpdatedYear, value.config.birthYear + value.config.startAge, value.year))
    && peopleIds.size === value.people.length && value.history.every((event) => validEvent(event, peopleIds))
    && validEvent(value.currentEvent, peopleIds) && value.currentEvent.year === value.year && value.currentEvent.age === value.age;
}

export function worldLimits(intelligence) {
  return {
    speakers: intelligence === 0 ? 0 : Math.min(3, 1 + Math.floor(intelligence / 35)),
    messages: intelligence === 0 ? 0 : Math.min(7, 2 + Math.floor(intelligence / 20)),
  };
}

export function parseGeneratedTurn(value, state) {
  const invalid = () => { throw new Error('INVALID_MODEL_OUTPUT'); };
  if (!object(value) || !object(value.event) || !list(value.worldMessages, worldLimits(state.config.intelligence).messages)) invalid();
  const input = value.event;
  const people = state.people.filter(isActivePerson);
  const peopleIds = new Set(people.map((person) => person.id));
  if (!text(input.title, 160) || !text(input.description, 2400) || !KINDS.includes(input.kind)
    || !list(input.choices, 4) || input.choices.length < 2
    || !input.choices.every((choice) => validChoice(choice, peopleIds))
    || new Set(input.choices.map((choice) => choice.id)).size !== input.choices.length) invalid();
  const choices = input.choices.map((choice) => ({
    id: choice.id,
    label: choice.label.trim(),
    hint: choice.hint.trim(),
    effects: Object.fromEntries(Object.entries(choice.effects).map(([key, effect]) => [key, clampEffect(effect)])),
    ...(choice.personId === undefined ? {} : { personId: choice.personId }),
    ...(choice.relationshipDelta === undefined ? {} : { relationshipDelta: clampEffect(choice.relationshipDelta) }),
  }));
  const names = new Map(people.flatMap((person) => [[person.id, person.name], [person.name, person.name]]));
  const speakers = new Set();
  const worldMessages = value.worldMessages.map((message, index) => {
    if (!object(message) || !names.has(message.speaker) || !text(message.text, 600)) invalid();
    const speaker = names.get(message.speaker);
    const target = names.get(message.target)
      ?? (message.target === state.config.name || message.target === state.id || message.target === 'protagonist' ? state.config.name : undefined);
    if (message.target !== undefined && (!target || target === speaker)) invalid();
    speakers.add(speaker);
    return { id: `${state.currentEvent.id}-voice-${index}`, speaker,
      ...(target === undefined ? {} : { target }), text: message.text.trim(), year: state.year };
  });
  if (speakers.size > worldLimits(state.config.intelligence).speakers) invalid();
  return {
    event: { id: state.currentEvent.id, year: state.year, age: state.age, kind: input.kind,
      title: input.title.trim(), description: input.description.trim(), choices, source: 'deepseek' },
    worldMessages,
    source: 'deepseek',
  };
}

export function parseGeneratedChat(value) {
  if (!object(value) || !text(value.reply, 1600)) throw new Error('INVALID_MODEL_OUTPUT');
  return { reply: value.reply.trim(), source: 'deepseek' };
}
