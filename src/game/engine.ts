import { evolveWorld, validateWorldThreads, worldThreadEvent } from './world.ts'
import type { Choice, Focus, GameState, LifeConfig, LifeEvent, Person, StatKey, Stats, WorldMessage } from './types.ts'

export type { Choice, ChatMessage, Focus, GameState, LifeConfig, LifeEvent, Person, StatKey, Stats, WorldMessage } from './types.ts'

export const LOCATIONS = ['杭州', '上海', '北京', '成都', '广州', '西安', '苏州', '厦门', '大理', '一座海边小城']
export const ERAS = [
  { label: '旧时光', year: 1900, description: '在书信、街巷与缓慢的变迁里长大' },
  { label: '新的起点', year: 1950, description: '在邻里与时代的变化中寻找位置' },
  { label: '奔涌年代', year: 1970, description: '从一条熟悉的街道走向更大的世界' },
  { label: '千禧之前', year: 1990, description: '见证纸上生活与数字世界的交会' },
  { label: '此刻之后', year: 2010, description: '在加速变化的世界里保持自己的节奏' },
  { label: '未来来信', year: 2050, description: '想象技术与人情共同生长的日常' },
  { label: '下个世纪', year: 2100, description: '走进尚未写下的生活，没有唯一剧本' },
]
export const FOCUS_OPTIONS: { id: Focus; label: string; description: string }[] = [
  { id: 'balance', label: '顺其自然', description: '留一点余地，照顾生活的不同部分' },
  { id: 'study', label: '探索学习', description: '把时间交给好奇心，积累知识与新技能' },
  { id: 'career', label: '事业积累', description: '争取工作机会，增加可支配的资源' },
  { id: 'social', label: '经营关系', description: '主动靠近别人，也让别人靠近你' },
  { id: 'health', label: '照顾自己', description: '放慢节奏，优先照顾身体和心情' },
]

const STAT_KEYS: StatKey[] = ['health', 'happiness', 'knowledge', 'wealth']
const FOCUSES: Focus[] = ['balance', 'study', 'career', 'social', 'health']
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const integer = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.round(clamp(value, min, max)) : fallback
function clean(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback
  return [...value.slice(0, max * 2)].filter(character => character.charCodeAt(0) >= 32 || '\t\n\r'.includes(character)).join('').trim().slice(0, max) || fallback
}

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  return value >>> 0
}

function randomFor(seed: number, salt: string): () => number {
  let value = (seed ^ hash(salt)) >>> 0
  return () => {
    value += 0x6d2b79f5
    let result = Math.imul(value ^ value >>> 15, 1 | value)
    result ^= result + Math.imul(result ^ result >>> 7, 61 | result)
    return ((result ^ result >>> 14) >>> 0) / 4294967296
  }
}

function freshSeed(): number {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!
  return Math.floor(Math.random() * 4294967296)
}

function person(id: string, name: string, role: string, age: number, personality: string, avatar: number): Person {
  return { id, name, role, age, personality, closeness: role === '母亲' || role === '父亲' ? 78 : 52, trust: role === '母亲' || role === '父亲' ? 82 : 58, mood: '平静', avatar, memories: [], messages: [] }
}

const isPresent = (person: Person) => !person.role.endsWith('已离世')

function acquaintance(age: number, seed: number): Person {
  return { ...person('acquaintance', ['夏予宁', '宋时安', '黎清禾'][seed % 3]!, '新认识的人', Math.max(18, age + seed % 3 - 1), '独立，真诚，有自己的兴趣，也尊重别人的边界', 5), closeness: 40, trust: 48 }
}

function initialPeople(age: number, seed: number): Person[] {
  const names = [['陈晚晴', '林远山', '许知远', '周予安'], ['沈月', '林明川', '江小满', '顾清和'], ['苏青', '林建平', '程亦舟', '温以宁']][seed % 3]!
  const result: Person[] = []
  if (age < 70) {
    result.push(person('mother', names[0]!, '母亲', age + 27, '细心，习惯用行动表达牵挂', 0))
    result.push(person('father', names[1]!, '父亲', age + 29, '沉稳，慢热，喜欢听人把话说完', 1))
  }
  if (age >= 3) result.push(person('friend', names[2]!, age < 18 ? '一起长大的朋友' : '老朋友', age, '直率，好奇，对新鲜事总有自己的想法', 2))
  if (age >= 6) result.push(person('mentor', names[3]!, age < 24 ? '老师' : age < 60 ? '前辈' : '邻居', Math.min(99, age + (age < 60 ? 20 : 2)), '温和，有耐心，愿意分享也愿意倾听', 3))
  if (age >= 18) result.push(acquaintance(age, seed))
  return result
}

export function getChapter(age: number): string {
  if (age < 6) return '第一章 · 世界很小'
  if (age < 13) return '第二章 · 好奇的年纪'
  if (age < 18) return '第三章 · 试着成为自己'
  if (age < 25) return '第四章 · 路在脚下展开'
  if (age < 40) return '第五章 · 把日子过成生活'
  if (age < 60) return '第六章 · 行至半途'
  if (age < 75) return '第七章 · 再次出发'
  return '第八章 · 来日与回声'
}

type Option = [label: string, hint: string, effects: Partial<Stats>, relationshipDelta?: number]
interface EventTemplate { key: string; title: string; text: string; focus: Focus; kind?: LifeEvent['kind']; options: Option[] }

const CHILDHOOD: EventTemplate[] = [
  { key: 'first-step', title: '比昨天多走一步', text: '家人在院子里等你。世界还很小，一次尝试就足以让一整天变得特别。', focus: 'health', options: [['跟着家人慢慢探索', '在陪伴中试试自己的力气', { health: 4, happiness: 2 }, 3], ['坐下来观察周围', '好奇心也有安静的样子', { knowledge: 4, happiness: 1 }], ['和家人一起做游戏', '熟悉的笑声让人安心', { happiness: 5 }, 4]] },
  { key: 'picture-book', title: '一本翻不完的画册', text: '一本有很多图画的书来到你面前。有人指着里面的小动物，等着你的回应。', focus: 'study', options: [['听家人讲一个故事', '把好奇心交给故事', { knowledge: 5, happiness: 2 }, 2], ['自己涂涂画画', '创造一种自己的答案', { knowledge: 3, happiness: 4 }], ['带着画册去找小伙伴', '分享让故事有了新听众', { happiness: 4 }, 3]] },
  { key: 'rainy-day', title: '下雨的午后', text: '雨把出门的计划留在了门内。家人准备了几种小活动，今天可以慢一点。', focus: 'balance', options: [['靠着家人好好休息', '身体需要恢复的时候就休息', { health: 5, happiness: 2 }, 2], ['搭一个小小的世界', '用手边的东西尝试创造', { knowledge: 4, happiness: 3 }], ['一起做一顿简单点心', '在照顾下参与日常', { happiness: 5, knowledge: 1 }, 4]] },
]
const SCHOOL: EventTemplate[] = [
  { key: 'school-project', title: '把问题带进课堂', text: '老师请大家用一周时间研究一个身边的问题。有人想观察树叶，有人打算记录街上的声音。', focus: 'study', options: [['认真做一次观察记录', '多一点耐心，得到自己的发现', { knowledge: 7, happiness: 1 }], ['和朋友一起完成', '分工也需要练习倾听', { knowledge: 4, happiness: 3 }, 5], ['选一个轻松的题目', '给玩耍留一点空间', { happiness: 5, health: 2 }]] },
  { key: 'playground', title: '操场上的新队友', text: '课后有人邀请你加入一个临时小队。你还不熟悉规则，但他们给你留了位置。', focus: 'social', kind: 'relationship', options: [['加入他们，边玩边学', '一次不熟练的开始，也可以很快乐', { health: 5, happiness: 4 }, 5], ['先在旁边观察', '看懂规则，再决定如何参与', { knowledge: 4, happiness: 1 }], ['邀请朋友一起试试', '熟悉的人让新尝试容易一些', { health: 3, happiness: 4 }, 6]] },
  { key: 'small-dispute', title: '一块橡皮的小风波', text: '朋友以为你弄丢了借来的东西，你却记得已经归还。两个人都觉得有一点委屈。', focus: 'social', kind: 'relationship', options: [['一起回想经过，再找一找', '把解决问题放在争输赢前面', { happiness: 2, knowledge: 2 }, 6], ['先说出自己的委屈', '坦诚表达，也给对方回应的空间', { happiness: 4 }, 3], ['暂时冷静一下', '停下来，让情绪有时间落地', { health: 2, happiness: 1 }, -2]] },
  { key: 'weekend-walk', title: '走到街道的另一头', text: '家人安排了一次不用赶时间的散步。熟悉的城市，也藏着没见过的角落。', focus: 'health', options: [['一起去公园走走', '让身体和眼睛都活动起来', { health: 5, happiness: 4 }, 3], ['绕路去小书店', '把一个下午交给好奇心', { knowledge: 6, happiness: 2 }], ['给家人讲最近的学校生活', '日常的小事也值得分享', { happiness: 5 }, 6]] },
  { key: 'pocket-money', title: '第一次自己做预算', text: '你得到了一笔零用钱。想要的东西不止一样，家人说这次可以由你做决定。', focus: 'career', options: [['存下一半，慢慢计划', '练习为未来留一点余地', { wealth: 5, knowledge: 3 }], ['买一本很想读的书', '给兴趣一个具体的入口', { wealth: -2, knowledge: 7 }], ['和朋友分享一次小快乐', '把资源变成共同记忆', { wealth: -3, happiness: 5 }, 4]] },
]
const TEEN: EventTemplate[] = [
  { key: 'school-direction', title: '答案之外的问题', text: '一次阶段考试之后，大家开始谈论将来。你发现，自己擅长的事和真正喜欢的事不完全一样。', focus: 'study', options: [['深入自己喜欢的科目', '兴趣可能慢慢变成方向', { knowledge: 8, happiness: 3, health: -1 }], ['找老师聊聊不同的路径', '多了解一些选择的代价', { knowledge: 5, happiness: 2 }, 4], ['先调整作息与状态', '不急着用一次成绩定义自己', { health: 6, happiness: 4 }]] },
  { key: 'teen-club', title: '空白名单上的名字', text: '社团正在招募新人。没有人要求你一开始就做得很好，只需要愿意出现。', focus: 'social', options: [['报名参加，认识新朋友', '把一点勇气用在喜欢的事情上', { happiness: 6, knowledge: 3 }, 4], ['和老朋友一起筹备活动', '一起完成一件小事', { knowledge: 4, happiness: 3 }, 6], ['把课余时间留给独处', '安静也能长出自己的兴趣', { knowledge: 6, health: 2 }]] },
  { key: 'expectations', title: '饭桌上的不同想法', text: '家人对未来有一份期待，而你有另一份想象。今晚，话题终于绕到了这里。', focus: 'balance', kind: 'relationship', options: [['说出想法，也听听担心', '理解不一定马上发生，但可以开始', { happiness: 4, knowledge: 2 }, 6], ['做一个小计划证明可行性', '让想象先落地一小步', { knowledge: 7, health: -1 }, 3], ['约好过几天再谈', '给彼此留一点消化的时间', { health: 3, happiness: 1 }, 1]] },
  { key: 'teen-friend', title: '没有被说出口的烦恼', text: '朋友最近安静了不少。放学路上，你们走得比平时慢，他似乎在等一句关心。', focus: 'social', kind: 'relationship', options: [['认真听，先不急着给建议', '陪伴可以从不打断开始', { happiness: 3 }, 8], ['邀请对方一起运动', '用熟悉的小事打开话题', { health: 4, happiness: 3 }, 5], ['尊重对方暂时不想说', '告诉对方需要时你会在', { happiness: 2 }, 3]] },
  { key: 'teen-rest', title: '忙碌里的一点空白', text: '学习和活动把时间排得很满。你开始察觉，充足的精力并不会凭空出现。', focus: 'health', options: [['重新安排睡眠和运动', '先把身体照顾好', { health: 8, happiness: 2 }], ['减少一项不喜欢的活动', '时间可以交回自己手里', { health: 5, happiness: 5 }], ['和朋友交换学习方法', '一起寻找更轻松的节奏', { knowledge: 5, health: 2 }, 4]] },
]
const YOUTH: EventTemplate[] = [
  { key: 'new-city', title: '一张通往新生活的车票', text: '一个学习或实践机会出现在另一座城市。熟悉的生活在身后，新的日常还没有形状。', focus: 'study', options: [['出发，试试陌生的环境', '用适应成本换一次视野的展开', { knowledge: 8, wealth: -4, happiness: 3 }], ['留在本地，认真做眼前的事', '积累也可以发生在熟悉的地方', { knowledge: 5, wealth: 3 }], ['和朋友商量一份共同计划', '让变化里多一个可以说话的人', { knowledge: 3, happiness: 5 }, 5]] },
  { key: 'first-project', title: '第一次被认真托付', text: '有人邀请你参与一个真正需要交付的项目。你会的还不够多，但机会并不总在准备好之后才来。', focus: 'career', options: [['接下来，边做边学', '挑战会带来收获，也会占用精力', { knowledge: 6, wealth: 6, health: -4 }], ['请前辈指导后再开始', '把求助变成一种能力', { knowledge: 7, wealth: 3 }, 4], ['先做一个小范围尝试', '保留余地，逐步建立信心', { knowledge: 4, wealth: 2, happiness: 2 }]] },
  { key: 'late-conversation', title: '聊到夜色渐深', text: '和朋友吃完饭，你们没有立刻告别。谈话从最近的小事，慢慢走到了对未来的担心。', focus: 'social', kind: 'relationship', options: [['认真讲出自己的不确定', '真实的交流让关系多一层深度', { happiness: 6, health: -1 }, 7], ['约定一起尝试一件新事', '把聊天变成一次共同经历', { happiness: 5, knowledge: 3 }, 5], ['送对方回去，早点休息', '温柔也可以藏在很普通的照顾里', { health: 4, happiness: 3 }, 4]] },
  { key: 'independent-budget', title: '自由也需要一份账本', text: '生活的开销第一次清晰地落在你自己手里。每个选择都不大，加在一起却会改变日常。', focus: 'career', options: [['做预算，建立小小的储备', '稳定感从看清数字开始', { wealth: 8, knowledge: 2, happiness: -1 }], ['为一门技能支付学费', '让一笔开销产生更长的回响', { wealth: -5, knowledge: 9 }], ['留一点钱给相聚和出门', '也为生活的温度安排位置', { wealth: -3, happiness: 7 }, 3]] },
  { key: 'different-rhythm', title: '找回自己的节奏', text: '身边的人似乎都在向前赶。你停下来想了想，自己到底想把时间花在哪里。', focus: 'health', options: [['建立规律运动的习惯', '把精力一点点养回来', { health: 8, happiness: 3 }], ['安排一段没有任务的旅行', '让眼睛看到日程以外的生活', { happiness: 8, wealth: -5, knowledge: 3 }], ['和亲近的人聊聊近况', '不必独自消化所有压力', { happiness: 5, health: 2 }, 6]] },
]
const ADULT: EventTemplate[] = [
  { key: 'career-crossroad', title: '熟悉的位置，新的可能', text: '你已经能把手头的事做得很熟练。一个新机会带来了更大的空间，也带来需要重新学习的部分。', focus: 'career', options: [['接受挑战，重新出发', '资源增加，压力也需要管理', { wealth: 10, knowledge: 5, health: -5, happiness: -1 }], ['谈清条件，再逐步转换', '为变化建立一个可承受的节奏', { wealth: 6, knowledge: 4, health: -1 }], ['保留稳定，把时间还给生活', '把主动权用在自己重视的地方', { happiness: 6, health: 4, wealth: -1 }]] },
  { key: 'shared-idea', title: '一张餐巾纸上的想法', text: '朋友有一个想一起完成的小项目。你们把点子写在手边，越聊越觉得它值得试试。', focus: 'study', options: [['投入一段时间做出原型', '把灵感交给一次真实的实践', { knowledge: 8, wealth: -5, happiness: 3 }, 4], ['小额试验，约好投入边界', '在热情之外，也把约定说清楚', { knowledge: 5, wealth: 2 }, 5], ['提供建议，保持轻量参与', '支持别人也可以有自己的节奏', { knowledge: 3, happiness: 3 }, 3]] },
  { key: 'adult-distance', title: '好久没见的那个人', text: '忙碌让一段重要的关系停在了许久以前。今天，你在整理东西时想起了对方。', focus: 'social', kind: 'relationship', options: [['主动约一次见面', '让挂念成为一个具体行动', { happiness: 7, wealth: -2 }, 8], ['写一段认真、不催回复的话', '给近况一个被听见的机会', { happiness: 4 }, 6], ['先把记忆记录下来', '承认想念，也珍惜当下', { happiness: 2, knowledge: 3 }, 1]] },
  { key: 'home-choice', title: '想要怎样的日常', text: '关于住在哪里、怎样分配开销，你有了一次重新安排的机会。你开始认真想象普通一天的样子。', focus: 'balance', options: [['选择更安稳的生活配置', '用一点自由换更大的缓冲', { wealth: 7, health: 2, happiness: -1 }], ['选择更方便相聚的位置', '让人与人的距离近一点', { happiness: 6, wealth: -4 }, 4], ['保持灵活，减少固定负担', '给未来的变化留一扇门', { wealth: 4, knowledge: 3, happiness: 2 }]] },
  { key: 'care-call', title: '一个需要你的电话', text: '亲近的人遇到了一件棘手的小事。对方没有要求你解决，只是希望有人一起商量。', focus: 'social', kind: 'relationship', options: [['腾出时间，陪着理清问题', '让对方知道自己并非孤立无援', { happiness: 4, wealth: -2 }, 8], ['一起寻找合适的支持', '帮助也包括连接更多资源', { knowledge: 4, happiness: 3 }, 6], ['说明自己的时间，再约好联系', '有边界的关心更容易持续', { health: 3, happiness: 2 }, 3]] },
  { key: 'body-reminder', title: '身体发来一条提醒', text: '连续忙碌之后，你发现休息不再能靠一个周末全部补回来。生活需要一次温和的调整。', focus: 'health', options: [['减少负担，认真恢复', '把休息放进真正的安排里', { health: 10, happiness: 3, wealth: -3 }], ['请朋友监督规律作息', '让照顾自己变得更容易坚持', { health: 7, happiness: 3 }, 4], ['学习适合自己的运动方式', '从小而稳定的习惯开始', { health: 6, knowledge: 4, wealth: -2 }]] },
  { key: 'community-table', title: '街角的一张长桌', text: '附近的人想办一次小聚会，交换闲置物品、拿手菜和各自的故事。组织者问你愿不愿意帮忙。', focus: 'social', options: [['参与筹备，认识身边的人', '熟悉的街道开始有了更多名字', { happiness: 6, knowledge: 3, health: -1 }, 5], ['带一份东西来分享', '一份小心意就能开启话题', { happiness: 5, wealth: -2 }, 4], ['帮忙整理物品与预算', '把擅长的事变成共同的便利', { knowledge: 3, wealth: 2 }, 3]] },
]
const MIDLIFE: EventTemplate[] = [
  { key: 'second-skill', title: '重新当一次初学者', text: '一种曾经没有时间尝试的兴趣又回到了眼前。年纪让你更了解自己，也让开始显得格外珍贵。', focus: 'study', options: [['认真报一门课程', '把好奇心放进日历', { knowledge: 9, happiness: 4, wealth: -4 }], ['邀请朋友一起尝试', '一起笨拙地开始，也很有趣', { knowledge: 5, happiness: 6 }, 5], ['先从每天十分钟开始', '持续比一次投入很多更重要', { knowledge: 5, health: 2, happiness: 3 }]] },
  { key: 'middle-work', title: '经验可以用在别处', text: '你积累的经验开始被更多人需要。有人请你带新人，也有人希望你承担更复杂的责任。', focus: 'career', options: [['承担新责任，也谈清资源', '经验值得合适的支持与回报', { wealth: 8, knowledge: 4, health: -3 }], ['带一位新人慢慢成长', '把自己的弯路变成别人的路标', { knowledge: 4, happiness: 5 }, 5], ['适当减量，保留生活空间', '把成熟用来做减法', { health: 6, happiness: 5, wealth: -2 }]] },
  { key: 'old-friends', title: '一桌聊不完的近况', text: '几位很久没聚齐的朋友终于碰上了时间。有人变化很大，有人仍然保持着熟悉的小习惯。', focus: 'social', kind: 'relationship', options: [['放下日程，好好相聚', '有些关系需要一次共同在场', { happiness: 8, wealth: -3 }, 7], ['认真关心一位沉默的朋友', '热闹里也看见一个人的心事', { happiness: 5 }, 8], ['提议建立一个固定的小约定', '让下一次见面不再遥遥无期', { happiness: 5, health: 2 }, 6]] },
  { key: 'middle-boundary', title: '留给自己的那一格', text: '工作、家人和身边的人都需要你的时间。你决定检查一下，日程里是否还给自己留了位置。', focus: 'health', options: [['明确减少一项额外责任', '说清边界，让精力有地方回来', { health: 8, happiness: 5, wealth: -2 }], ['和亲近的人重新分工', '把承担变成可以商量的事情', { health: 5, happiness: 4 }, 6], ['安排规律的独处和运动', '把照顾自己变成习惯', { health: 7, happiness: 3 }]] },
  { key: 'family-album', title: '旧相册里的一页', text: '整理旧物时，一张照片让你停了下来。你忽然想起，当年许多没有问过的问题，现在仍有机会去听。', focus: 'balance', kind: 'relationship', options: [['找熟悉的人聊聊往事', '多听一个角度，记忆也变得丰富', { happiness: 5, knowledge: 4 }, 7], ['整理成一本小小的记录', '让普通人的生活被好好保存', { knowledge: 6, happiness: 3 }], ['安排一次重访旧地', '带着今天的自己回去看看', { happiness: 7, wealth: -4, health: 2 }, 3]] },
]
const LATER: EventTemplate[] = [
  { key: 'later-morning', title: '一个不赶时间的清晨', text: '你可以重新安排一天的开头。没有必须照搬的答案，舒服的节奏可以一点点试出来。', focus: 'health', options: [['散步，再认真吃一顿早餐', '照顾身体，从平常的细节开始', { health: 7, happiness: 4 }], ['去见一位聊得来的朋友', '有来有往的关心让日子明亮', { happiness: 7, health: 2 }, 6], ['拿起放下很久的兴趣', '把空闲交给一直喜欢的事情', { knowledge: 6, happiness: 5 }]] },
  { key: 'later-learning', title: '好奇心没有退休', text: '社区里开了一门新课，来报名的人年龄各不相同。你发现，自己依然享受理解新事物的瞬间。', focus: 'study', options: [['加入课程，慢慢练习', '允许自己有不熟练的时候', { knowledge: 8, happiness: 4, wealth: -2 }], ['和熟人一起去听听', '共同学习让话题长出新的枝叶', { knowledge: 5, happiness: 5 }, 5], ['用自己的经验做一次分享', '学习也可以从交换开始', { knowledge: 4, happiness: 6 }, 4]] },
  { key: 'later-project', title: '想做的事还有下一页', text: '你想把多年积累的经验、兴趣或故事做成一件具体的东西。不需要很宏大，只需要对自己有意义。', focus: 'career', options: [['投入时间，完成一个小作品', '让想法留下可以看见的形状', { knowledge: 6, happiness: 7, wealth: -3 }], ['找朋友一起完成', '作品之外，还有一起做事的记忆', { happiness: 6, knowledge: 4 }, 7], ['把计划拆小，慢慢推进', '按照适合自己的速度走', { health: 4, knowledge: 4, happiness: 4 }]] },
  { key: 'later-neighbor', title: '门外的一声招呼', text: '一位邻居带着小事来敲门，你们顺势聊起近况。熟悉感总是由一次次普通的相遇积累起来。', focus: 'social', kind: 'relationship', options: [['请对方坐下聊一会儿', '为另一个人的故事留一点时间', { happiness: 7 }, 7], ['约一次轻松的户外活动', '在相伴中也照顾身体', { health: 5, happiness: 5 }, 5], ['一起商量社区的小改进', '把经验用在身边的生活里', { knowledge: 4, happiness: 4 }, 4]] },
]
const ELDER: EventTemplate[] = [
  { key: 'elder-memory', title: '想留给未来的话', text: '一些曾经不起眼的片段，今天想来格外清晰。你想用自己舒服的方式，把它们留给愿意听的人。', focus: 'study', options: [['口述一段最想记住的经历', '有人倾听，故事就有了新的去处', { happiness: 7, knowledge: 3 }, 7], ['慢慢写进自己的生活册', '不求完整，只保留重要的部分', { happiness: 5, knowledge: 5 }], ['邀请朋友交换各自的故事', '听见相同年代里不同的人生', { happiness: 7, knowledge: 3 }, 5]] },
  { key: 'elder-support', title: '让日子更省力一点', text: '你留意到生活里有几处可以调整的小地方。接受合适的帮助，也能为喜欢的事情保留更多精力。', focus: 'health', options: [['和信任的人一起调整安排', '把需要说出来，一起寻找办法', { health: 8, happiness: 3, wealth: -2 }, 5], ['减少奔波，留足休息', '按身体的节奏安排今天', { health: 7, happiness: 4 }], ['学会一种让生活方便的方法', '一点新知识换一点从容', { health: 4, knowledge: 5, wealth: -2 }]] },
  { key: 'elder-visit', title: '约好的那次见面', text: '熟悉的人带着近况来到你身边。你们聊起新鲜事，也聊那些讲过很多次却依然好笑的旧事。', focus: 'social', kind: 'relationship', options: [['认真相聚，也说说自己的近况', '被关心，也让别人被关心', { happiness: 8 }, 8], ['一起到附近慢慢走走', '不用走很远，就能看到季节变化', { health: 5, happiness: 6 }, 5], ['请对方帮忙记录一张合照', '为今天留下一个清晰的坐标', { happiness: 6, knowledge: 2 }, 6]] },
  { key: 'elder-small-joy', title: '把今天过得具体', text: '窗外的光换了一个角度。今天值得安排一件让自己期待的小事，大小和别人无关。', focus: 'balance', options: [['听喜欢的音乐，慢慢休息', '熟悉的旋律让心情安定', { health: 5, happiness: 6 }], ['给老朋友捎去问候', '让牵挂在今天抵达', { happiness: 7 }, 6], ['整理一件珍视的小物', '让回忆有一个安稳的位置', { knowledge: 3, happiness: 5 }]] },
]

function companion(state: GameState): Person | undefined {
  const people = state.people.filter(isPresent)
  return people.find(item => item.id === 'friend') ?? people.find(item => Math.abs(item.age - state.age) < 12) ?? people[0]
}

function eventTarget(state: GameState, key: string, optionIndex: number): Person | undefined {
  const people = state.people.filter(isPresent)
  const family = people.find(item => item.id === 'mother') ?? people.find(item => item.id === 'father')
  if (['first-step', 'rainy-day', 'weekend-walk', 'expectations', 'family-album'].includes(key) || key === 'picture-book' && optionIndex !== 2) return family ?? companion(state)
  if (['school-direction', 'first-project'].includes(key)) return people.find(item => item.id === 'mentor') ?? companion(state)
  if (key === 'later-neighbor' || key === 'community-table') return people.find(item => item.id === 'neighbor') ?? people.find(item => item.role.includes('邻居')) ?? companion(state)
  if (key === 'middle-work') return people.find(item => item.id === 'acquaintance') ?? companion(state)
  return companion(state)
}

const BEGIN_PARTNERSHIP = '确认彼此愿意，开始一段伴侣关系'
const REMAIN_FRIENDS = '珍惜友谊，说明自己的界限'
const END_PARTNERSHIP = '坦诚结束伴侣关系'
const RELATIONSHIP_ACTIONS = ['begin-partnership', 'remain-friends', 'end-partnership', 'repair-relationship', 'reconcile', 'slow-repair']
const relationshipAction = (choice: Choice | undefined) => choice ? RELATIONSHIP_ACTIONS.find(action => choice.id.endsWith(`-action-${action}`)) : undefined

function relationshipEvent(state: GameState, random: () => number, recent: Set<string>): LifeEvent | undefined {
  const people = state.people.filter(isPresent)
  const recovering = people.find(item => item.mood === '慢慢重建信任')
  const strained = [...people].filter(item => item.trust < 38 || item.closeness < 32 || item.mood === '需要一点空间' || item.mood === '有些失落').sort((a, b) => a.trust + a.closeness - b.trust - b.closeness)[0]
  const peer = people.find(item => item.id === 'acquaintance' && item.role !== '伴侣' && state.age >= 18 && item.age >= 18 && Math.abs(item.age - state.age) <= 8 && item.closeness >= 60 && item.trust >= 60 && !item.memories.some(memory => memory.includes('约定保持友谊')))
  const partner = people.find(item => item.role === '伴侣')
  const warm = people.filter(item => item.age >= 3 && item.id !== 'mother' && item.id !== 'father')
  const target = recovering ?? strained ?? peer ?? partner ?? warm[Math.floor(random() * warm.length)]
  if (!target) return undefined
  const urgent = recovering || strained
  if (!urgent && random() > (state.focus === 'social' ? .6 : .22) + state.config.intelligence * .001) return undefined
  const id = `${state.id}-year-${state.age}`
  const option = (suffix: string, label: string, hint: string, effects: Partial<Stats>, relationshipDelta: number): Choice => ({ id: `${id}-action-${suffix}`, label, hint, effects, personId: target.id, relationshipDelta })
  let title: string
  let description: string
  let choices: Choice[]
  if (recovering) {
    title = '信任，从一件小事重新开始'
    description = `你和${target.name}已经把心里的话说开，但信任需要日常里的行动。对方想知道，这次的约定会怎样慢慢落实。`
    choices = [option('reconcile', '兑现一次具体的小约定', '用行动给这段关系一个新的开始', { happiness: 5, wealth: -2 }, 12), option('slow-repair', '慢慢来，让行动积累信任', '不催促彼此，保持稳定的关心', { happiness: 3, health: 2 }, 6), option('space', '尊重对方需要的距离', '把边界说清楚，也保留善意', { health: 3 }, 1)]
  } else if (strained) {
    title = '把难受说清楚'
    description = `${target.name}最近和你有了一些隔阂。${target.trust < 38 ? '对方不再像以前那样放心地把话交给你。' : '有些没有说清楚的感受，正在拉开你们的距离。'}接下来如何相处，需要你们一起面对。`
    choices = [option('repair-relationship', '认真道歉，也听听对方的感受', '修复从承担自己的部分开始', { happiness: 2, health: -1 }, 8), option('space', '说清边界，给彼此一点空间', '暂时放慢，也尊重对方', { health: 3, happiness: -1 }, 1), option('avoid', '暂时回避这次谈话', '未解决的事情可能继续影响关系', { happiness: -3 }, -5)]
    if (target.role === '伴侣') choices.push(option('end-partnership', END_PARTNERSHIP, '结束关系，也保留彼此的边界', { happiness: -5, health: 3 }, -8))
  } else if (peer) {
    title = '认真问一次彼此的心意'
    description = `你和${peer.name}在共同的经历里逐渐熟悉。你们开始聊到，是否愿意把关系再向前走一步。亲近没有标准进度，彼此明确的意愿才是开始。`
    choices = [option('begin-partnership', BEGIN_PARTNERSHIP, '在双方愿意的前提下，认真了解与陪伴', { happiness: 7, wealth: -2 }, 8), option('remain-friends', REMAIN_FRIENDS, '友谊也值得清楚、认真地珍惜', { happiness: 4 }, 4), option('time', '还需要时间，先慢慢了解', '让感受按照自己的速度生长', { happiness: 2, health: 2 }, 2)]
  } else {
    title = partner ? '把陪伴放进日常' : '多走近一点'
    description = partner ? `你和${partner.name}已经成为伴侣。除了心动，生活还需要商量时间、分工和各自的空间。你们想为接下来的日子做一个小约定。` : `${target.name}提起了一件最近的小事，也想听听你的近况。${target.trust >= 70 ? '足够的信任，让你们愿意谈得更真实。' : '相处从一次次不急着结束的交流里慢慢生长。'}`
    choices = [option('meet', partner ? '为彼此留出固定时间' : '约一次轻松的见面', '把关心放进一个可以实现的安排', { happiness: 5, wealth: -2 }, 7), option('share', partner ? '一起商量分工与边界' : '分享最近真实的想法', '认真表达，也让对方说完', { happiness: 3, knowledge: 2 }, 6), option('space', '尊重彼此的节奏，保持联系', '靠近也需要留一点空间', { health: 3, happiness: 2 }, 2)]
  }
  if (!urgent && recent.has(title)) return undefined
  return { id, year: state.year, age: state.age, kind: 'relationship', title, description: description + (state.config.intelligence >= 80 ? ' 你也开始留意，言语之外的小小行动，如何改变彼此对未来的期待。' : ''), choices, source: 'local' }
}

function eraDetail(year: number): string {
  if (year < 1940) return '街巷里的消息和一封慢慢抵达的信，连接着各自的生活。'
  if (year < 1980) return '邻里之间的来往和手写的记录，让日常留下细密的痕迹。'
  if (year < 2005) return '生活的变化正在加快，旧习惯与新的可能在同一条街上相遇。'
  if (year < 2040) return '信息来得很快，但人与人之间的理解仍然需要花时间。'
  return '新的技术不断进入日常，人们仍在学习如何好好生活、彼此相待。'
}

function makeEvent(state: GameState, first = false): LifeEvent {
  const id = `${state.id}-year-${state.age}`
  if (state.ended) return { id, year: state.year, age: state.age, kind: 'life', title: '这一生，写到这里', description: state.ending ?? '走过的路，留下了属于你的回声。', choices: [], source: 'local' }
  if (first && state.age === 18) return {
    id, year: state.year, age: state.age, kind: 'choice', title: '夏天，还有很多种可能',
    description: `十八岁的夏天，${state.config.location}的风吹过窗前。接下来的日子还没有被安排好，你可以先为自己选一个开始。`,
    choices: [
      { id: `${id}-choice-1`, label: '去学一点真正感兴趣的东西', hint: '把好奇心变成新的起点', effects: { knowledge: 8, happiness: 3, wealth: -2 } },
      { id: `${id}-choice-2`, label: '和朋友去看更大的世界', hint: '出发，让陌生的风景成为共同记忆', effects: { happiness: 7, knowledge: 3, wealth: -5 }, personId: companion(state)?.id, relationshipDelta: 6 },
      { id: `${id}-choice-3`, label: '留在家里，好好陪伴家人', hint: '普通的一餐饭，也值得认真相处', effects: { happiness: 5, health: 3 }, personId: state.people.find(item => item.id === 'mother')?.id, relationshipDelta: 7 },
    ], source: 'local',
  }
  const random = randomFor(state.config.seed, `event-${state.age}-${state.turn}-${state.focus}`)
  const stage = state.age < 6 ? CHILDHOOD : state.age < 13 ? SCHOOL : state.age < 18 ? TEEN : state.age < 25 ? YOUTH : state.age < 40 ? ADULT : state.age < 60 ? MIDLIFE : state.age < 75 ? LATER : ELDER
  const recent = new Set(state.history.slice(-3).map(event => event.title))
  const relationship = state.age >= 6 ? relationshipEvent(state, randomFor(state.config.seed, `relationship-${state.age}-${state.turn}-${state.focus}`), recent) : undefined
  if (relationship) return relationship
  if (state.age >= 6 && !recent.has('小城里的新变化') && random() < .08 + state.config.intelligence * .0012) {
    const change = state.year < 1940 ? '街边新开了一间可以借阅书报的小屋' : state.year < 1980 ? '邻里准备把一处空地变成大家共同使用的活动空间' : state.year < 2005 ? '新的交通线路让过去不常来往的街区连接起来' : state.year < 2040 ? '一种新的交流工具开始流行，人们也在重新学习怎样保持联系' : '社区开始试用一种帮助人们处理日常事务的智能工具'
    const related = companion(state)
    return {
      id, year: state.year, age: state.age, kind: 'world', title: '小城里的新变化',
      description: `${state.config.location}，${change}。变化没有替你决定方向，却让生活多了几种可能。${state.config.intelligence >= 65 ? '有人兴奋，有人犹豫；你愿意先从自己的感受出发。' : ''}`,
      choices: [
        { id: `${id}-choice-1`, label: state.age < 18 ? '在家人陪伴下去了解一下' : '主动了解，试着参与', hint: '给新事物一点了解的时间', effects: { knowledge: 7, happiness: 2, wealth: state.age < 18 ? 0 : -2 } },
        { id: `${id}-choice-2`, label: '听听朋友们各自的想法', hint: '从不同的经历里看见更多角度', effects: { knowledge: 4, happiness: 4 }, ...(related ? { personId: related.id, relationshipDelta: 5 } : {}) },
        { id: `${id}-choice-3`, label: '保持自己的节奏，慢慢观察', hint: '熟悉的日常也有值得珍惜的部分', effects: { health: 4, happiness: 3, wealth: 2 } },
      ], source: 'local',
    }
  }
  let pool = stage.filter(event => !recent.has(event.title))
  if (!pool.length) pool = stage
  const weighted = pool.map(event => ({ event, weight: event.focus === state.focus ? 2.6 - state.config.intelligence / 100 : 1 }))
  let cursor = random() * weighted.reduce((sum, item) => sum + item.weight, 0)
  const template = weighted.find(item => (cursor -= item.weight) <= 0)?.event ?? pool[pool.length - 1]!
  let description = template.text
  if (state.config.intelligence >= 45) description += ` ${eraDetail(state.year)}`
  if (state.config.intelligence >= 80) description += ` 在${state.config.location}，你发现同一件事，换一个人的角度就会有不同的答案。`
  return {
    id, year: state.year, age: state.age, kind: template.kind ?? 'life', title: template.title, description,
    choices: template.options.map(([label, hint, effects, relationshipDelta], index) => {
      const related = eventTarget(state, template.key, index)
      const adjusted: Partial<Stats> = { ...effects }
      if (state.config.intelligence >= 70) {
        const keys = STAT_KEYS.filter(key => adjusted[key] !== undefined)
        const key = keys[Math.floor(random() * keys.length)]!
        if (key) adjusted[key] = (adjusted[key] ?? 0) + Math.floor(random() * 3) - 1
      }
      return { id: `${id}-choice-${index + 1}`, label, hint, effects: adjusted, ...(related && relationshipDelta !== undefined ? { personId: related.id, relationshipDelta } : {}) }
    }), source: 'local',
  }
}

function worldDialogue(state: GameState): WorldMessage[] {
  const people = state.people.filter(isPresent)
  if (people.length < 2) return []
  const random = randomFor(state.config.seed, `world-${state.turn}-${state.config.intelligence}`)
  const count = state.config.intelligence < 25 ? 1 : state.config.intelligence < 70 ? 2 : state.config.intelligence < 90 ? 3 : 4
  const adultLines = [
    '刚刚那件小事让我想了很久。每个人好像都有自己的难处。',
    '我记得你上次提过这个。后来怎么样了？',
    '等你有空，我们一起出去走走，别总把自己排得太满。',
    '我今天学到一个新办法，回头慢慢讲给你听。',
    '这一年过得真快，不过能坐下来聊聊，就觉得踏实一些。',
    '下次做计划记得叫上我，我也想出一点力。',
  ]
  const childLines = ['我发现了一个好玩的东西，下次一起去看看！', '你愿意和我一起做吗？我还不太会。', '今天那件事我还记得，想起来就开心。']
  return Array.from({ length: count }, (_, index) => {
    const speakerIndex = Math.floor(random() * people.length)
    const speaker = people[speakerIndex]!
    const target = people[(speakerIndex + 1 + Math.floor(random() * (people.length - 1))) % people.length]!
    const lines = speaker.age < 13 ? childLines : adultLines
    const text = lines[Math.floor(random() * lines.length)]!
    return { id: `${state.id}-world-${state.turn}-${index}`, speaker: speaker.name, target: target.name, text, year: state.year }
  })
}

export function createLife(config: Partial<LifeConfig> = {}): GameState {
  const normalized: LifeConfig = {
    name: clean(config.name, '林知夏', 40), birthYear: integer(config.birthYear, 1990, 1900, 2100),
    location: clean(config.location, '杭州', 60), startAge: integer(config.startAge, 18, 0, 90),
    intelligence: integer(config.intelligence, 60, 0, 100), seed: integer(config.seed, freshSeed(), 0, 4294967295),
  }
  const random = randomFor(normalized.seed, 'initial-stats')
  const age = normalized.startAge
  const state: GameState = {
    version: 1, id: `life-${normalized.seed.toString(36)}-${hash(JSON.stringify(normalized)).toString(36)}`, config: normalized,
    age, year: normalized.birthYear + age, stats: { health: clamp(78 - Math.max(0, age - 40) * .45 + Math.floor(random() * 8)), happiness: 60 + Math.floor(random() * 12), knowledge: clamp(20 + age * .7 + Math.floor(random() * 9)), wealth: clamp(22 + age * .3 + Math.floor(random() * 10)) },
    focus: 'balance', people: initialPeople(age, normalized.seed), history: [], currentEvent: {} as LifeEvent,
    worldMessages: [], ended: age >= 90, turn: 0,
  }
  state.stats = Object.fromEntries(STAT_KEYS.map(key => [key, Math.round(state.stats[key])])) as Stats
  if (state.ended) state.ending = makeEnding(state)
  state.currentEvent = makeEvent(state, true)
  state.worldMessages = worldDialogue(state)
  return state
}

function focusEffects(state: GameState): Partial<Stats> {
  switch (state.focus) {
    case 'study': return { knowledge: 3, happiness: 1 }
    case 'career': return state.age < 16 ? { knowledge: 2, wealth: 1 } : state.age >= 65 ? { knowledge: 2, wealth: 1, happiness: 1 } : { wealth: 4, health: -1 }
    case 'social': return { happiness: 3, health: 1 }
    case 'health': return { health: 4, happiness: 1 }
    default: return { health: 1, happiness: 1, knowledge: 1, wealth: 1 }
  }
}

function makeEnding(state: GameState): string {
  const strongest = STAT_KEYS.reduce((best, key) => state.stats[key] > state.stats[best] ? key : best, 'happiness')
  const traits: Record<StatKey, string> = { health: '你学会照顾自己，也珍惜每一个可以出发的清晨', happiness: '你为日常保留了快乐，许多普通的瞬间因此有了光', knowledge: '你始终没有放下好奇心，把人生过成了一段不断理解世界的旅程', wealth: '你为生活积累了选择的余地，也一步步学会如何使用它' }
  const closest = [...state.people].sort((a, b) => b.closeness + b.trust - a.closeness - a.trust)[0]
  return `${state.config.name}的人生在${state.year}年、${state.age}岁时写下这一章的句点。${traits[strongest]}。${closest ? `与${closest.name}共同留下的记忆，成为这条时间线里独特的回声。` : '那些相遇与选择，成为这条时间线里独特的回声。'}这里没有标准答案，只有你走过的一生。`
}

function requireChoice(state: GameState, choiceId: string): Choice {
  const choices = state.currentEvent?.choices
  if (typeof choiceId !== 'string' || !choiceId.trim() || !Array.isArray(choices)) throw new Error('请选择当前事件中的有效方向。')
  const matches = choices.filter(choice => record(choice) && choice.id === choiceId)
  if (matches.length !== 1) throw new Error('这个选择已不属于当前年份，请重新选择。')
  const choice = matches[0]!
  if (!boundedString(choice.id, 180) || !boundedString(choice.label, 100) || !boundedString(choice.hint, 160) || !record(choice.effects)) throw new Error('这个选择的数据不完整，请重新载入有效存档。')
  const effects = choice.effects
  if (Object.keys(effects).some(key => !STAT_KEYS.includes(key as StatKey) || !boundedNumber(effects[key as StatKey], -25, 25))) throw new Error('这个选择的数值无效，请重新载入有效存档。')
  const target = state.people.find(person => person.id === choice.personId && isPresent(person))
  if (choice.personId !== undefined && !target) throw new Error('这位人物的故事已经成为回忆，无法继续这个选择。')
  if (choice.relationshipDelta !== undefined && (choice.personId === undefined || !boundedNumber(choice.relationshipDelta, -15, 15))) throw new Error('这个选择的关系数据无效，请重新载入有效存档。')
  const action = relationshipAction(choice)
  if (action === 'begin-partnership' && (choice.label !== BEGIN_PARTNERSHIP || target?.id !== 'acquaintance' || target.role === '伴侣' || state.age < 18 || target.age < 18 || Math.abs(state.age - target.age) > 8 || target.closeness < 60 || target.trust < 60)) throw new Error('关系已经发生变化，请先重新确认彼此的意愿。')
  if (action === 'remain-friends' && (choice.label !== REMAIN_FRIENDS || target?.id !== 'acquaintance' || state.age < 18 || target.age < 18)) throw new Error('这个关系选择已不适用于当前人物。')
  if (action === 'end-partnership' && (choice.label !== END_PARTNERSHIP || target?.role !== '伴侣' || state.age < 18 || target.age < 18)) throw new Error('当前没有可以结束的这段伴侣关系。')
  return choice
}

/** Choice effects and relationship decisions are shared by immediate and annual resolution. */
function applyChoiceEffects(state: GameState, choice?: Choice, annual?: { stats: Partial<Stats>; socialDrift: number }): GameState {
  const stats = { ...state.stats }
  for (const key of STAT_KEYS) stats[key] = clamp(Math.round(stats[key] + (choice?.effects[key] ?? 0) + (annual?.stats[key] ?? 0)))
  const action = relationshipAction(choice)
  const people = state.people.map(item => {
    if (!isPresent(item)) return item
    const delta = item.id === choice?.personId ? choice.relationshipDelta ?? 0 : annual?.socialDrift ?? 0
    let role = item.role
    let mood = delta >= 5 ? '觉得被在乎' : delta < 0 ? '有些失落' : item.mood
    const memories = [...item.memories]
    if (item.id === choice?.personId) {
      memories.push(`${state.year}年，你选择「${choice.label}」，一起经历了「${state.currentEvent.title}」。`.slice(0, 240))
      if (action === 'begin-partnership' && choice.label === BEGIN_PARTNERSHIP && item.id === 'acquaintance' && role !== '伴侣' && state.age >= 18 && item.age >= 18 && Math.abs(state.age - item.age) <= 8 && item.closeness >= 60 && item.trust >= 60) {
        role = '伴侣'
        mood = '认真期待共同的生活'
        memories.push(`${state.year}年，你们确认彼此愿意，成为伴侣，也约好尊重各自的边界。`)
      } else if (action === 'remain-friends' && choice.label === REMAIN_FRIENDS && item.id === 'acquaintance') {
        role = '朋友'
        mood = '朋友之间的安心'
        memories.push(`${state.year}年，你们约定保持友谊，认真尊重彼此的选择。`)
      } else if (action === 'end-partnership' && choice.label === END_PARTNERSHIP && item.role === '伴侣') {
        role = '朋友（曾是伴侣）'
        mood = '需要一点空间'
        memories.push(`${state.year}年，你们坦诚结束伴侣关系，把过去的共同经历留在记忆里。`)
      } else if (action === 'repair-relationship' || action === 'slow-repair') mood = '慢慢重建信任'
      else if (action === 'reconcile') mood = '重新愿意靠近'
    }
    return { ...item, role, closeness: clamp(item.closeness + delta), trust: clamp(item.trust + Math.round(delta * .7)), mood, memories: memories.slice(-12), messages: [...item.messages] }
  })
  return { ...state, stats, people }
}

export function resolveChoice(state: GameState, choiceId: string): GameState {
  if (state.ended) throw new Error('这一生的选择已经珍藏。')
  const choice = requireChoice(state, choiceId)
  const resolved = applyChoiceEffects(state, choice)
  const outcome = `\n你选择了：${choice.label}。`
  return evolveWorld({ ...resolved, worldUpdatedYear: state.year, currentEvent: { ...state.currentEvent, description: state.currentEvent.description.slice(0, 3000 - outcome.length) + outcome, choices: [] } }, choice)
}

export function advanceYear(state: GameState, choiceId?: string, options: { mortality?: 'engine' | 'external'; world?: 'engine' | 'external' } = {}): GameState {
  if (state.ended) return state
  if (state.age >= 110) throw new Error('这条时间线已经走到110岁，请由生命模拟完成这一生。')
  if (state.currentEvent.choices.length && choiceId === undefined) throw new Error('请先选择今年想走的方向。')
  const choice = choiceId === undefined ? undefined : requireChoice(state, choiceId)
  const annualStats = { ...focusEffects(state) }
  annualStats.health = (annualStats.health ?? 0) + (state.age >= 75 ? -3 : state.age >= 55 ? -2 : -1)
  const applied = evolveWorld({ ...applyChoiceEffects(state, choice, { stats: annualStats, socialDrift: state.focus === 'social' ? 1 : 0 }), worldUpdatedYear: state.year }, choice)
  const stats = applied.stats
  const age = state.age + 1
  const departures: string[] = []
  const people = applied.people.map(item => {
    if (!isPresent(item)) return item
    let role = item.id === 'friend' && age >= 18 && item.role === '一起长大的朋友' ? '老朋友' : item.role
    let mood = item.mood
    const memories = [...item.memories]
    const nextAge = Math.min(100, item.age + 1)
    if (nextAge >= 100) {
      const notice = `${state.year}年末，${item.name}在100岁时离世。你们的对话与共同记忆被留存下来。`
      departures.push(notice)
      memories.push(notice)
      role = `${role} · 已离世`
      mood = '长久的思念'
    } else if (nextAge >= 65 && role === '前辈') role = '退休前辈'
    return { ...item, role, age: nextAge, mood, memories: memories.slice(-12) }
  })
  if (age === 3 && !people.some(item => item.id === 'friend')) people.push(person('friend', ['江小满', '程亦舟', '许知远'][state.config.seed % 3]!, '一起长大的朋友', age, '好奇，活泼，愿意分享自己的发现', 2))
  if (age === 6 && !people.some(item => item.id === 'mentor')) people.push(person('mentor', '周予安', '老师', age + 20, '温和，有耐心，擅长让人自己找到答案', 3))
  if (age >= 18 && !people.some(item => item.id === 'acquaintance')) {
    const introduced = acquaintance(age, state.config.seed)
    introduced.memories = [`${state.config.birthYear + age}年，你们在一次共同感兴趣的活动中认识，决定先从朋友了解起。`]
    people.push(introduced)
  }
  if ((age === 26 || age === 62) && !people.some(item => item.id === 'neighbor')) people.push(person('neighbor', ['唐时雨', '陆星河', '叶闻溪'][state.config.seed % 3]!, age < 60 ? '新朋友' : '邻居', age + 1, '热心，幽默，喜欢和别人一起把日子过得有趣', 4))
  const resolved: LifeEvent = { ...state.currentEvent, kind: choice ? 'choice' : state.currentEvent.kind, description: `${state.currentEvent.description}${choice ? `\n你选择了：${choice.label}。` : ''}${departures.length ? `\n${departures.join('\n')}` : ''}`.slice(0, 3400), choices: [] }
  let next: GameState = { ...applied, config: { ...state.config }, age, year: state.config.birthYear + age, stats, people, history: [...state.history, resolved], turn: state.turn + 1, ended: options.mortality !== 'external' && (age >= 90 || stats.health <= 0), worldMessages: [...state.worldMessages] }
  if (next.ended) next.ending = makeEnding(next)
  next.currentEvent = makeEvent(next)
  if (options.world !== 'external') {
    next = evolveWorld(next)
    next.currentEvent = worldThreadEvent(next) ?? next.currentEvent
  }
  next.worldMessages = [...next.worldMessages, ...worldDialogue(next)].slice(-40)
  return next
}

export function interact(state: GameState, personId: string, message: string, reply?: string): GameState {
  const target = state.people.find(item => item.id === personId)
  if (!target) throw new Error('这位人物已经不在当前时间线里。')
  if (!isPresent(target)) throw new Error('这段对话已经成为回忆。你仍可以翻看共同的记忆。')
  if (state.ended) throw new Error('这一生的对话已经珍藏。')
  const text = clean(message, '', 1200)
  if (!text) throw new Error('写下一句话，再开始对话。')
  const random = randomFor(state.config.seed, `chat-${personId}-${state.turn}-${target.messages.at(-1)?.id ?? ''}-${text}`)
  const harsh = /笨蛋|滚开|闭嘴|废物|去死|\bidiot\b|\bstupid\b/i.test(text)
  const lines = target.age < 13 ? ['我也想和你说这件事！下次我们一起试试吧。', '我还没想好，不过你愿意听我说，我很开心。', '那我们慢慢来！你还记得上次一起玩的时候吗？'] : [
    `听到你说这些，我想起我们一起经历过的事。${target.memories.length ? '那些小事我一直记着。' : '也许可以先从一件小事开始，不用一次想清所有答案。'}`,
    '我想先听听你的感受。你最在意的那一部分是什么？只要你愿意，我们可以慢慢聊。',
    '谢谢你愿意把这件事告诉我。我不一定有现成的答案，不过我们可以一起想，也可以先出去走走。',
    state.focus === 'career' ? '你最近很努力。我希望你在向前走的时候，也给自己留一点喘息的空间。' : '最近我也在调整自己的节奏。能这样坐下来聊聊，对我来说就很重要。',
  ]
  const response = clean(reply, harsh ? '这句话让我有些难受。我愿意继续聊，也希望我们可以好好说话。' : lines[Math.floor(random() * lines.length)]!, 2000)
  const token = hash(`${target.messages.at(-1)?.id ?? state.id}-${personId}-${text}-${response}-${state.year}`).toString(36)
  const updated: Person = {
    ...target, closeness: clamp(target.closeness + (harsh ? -3 : 2)), trust: clamp(target.trust + (harsh ? -4 : 2)), mood: harsh ? '需要一点空间' : '愿意继续聊聊',
    memories: [...target.memories, `${state.year}年，你和我聊起「${text.slice(0, 100)}」。${harsh ? '有些话伤到了彼此，需要重新建立信任。' : ''}`].slice(-12),
    messages: [...target.messages, { id: `chat-${token}-u`, role: 'user' as const, text, year: state.year }, { id: `chat-${token}-a`, role: 'assistant' as const, text: response, year: state.year }].slice(-40),
  }
  return evolveWorld({ ...state, worldUpdatedYear: state.year, stats: { ...state.stats, happiness: clamp(state.stats.happiness + (harsh ? -1 : 1)) }, people: state.people.map(item => item.id === personId ? updated : item) })
}

export function setFocus(state: GameState, focus: Focus): GameState {
  if (!FOCUSES.includes(focus)) throw new Error('请选择有效的生活重心。')
  return { ...state, focus }
}

export function setIntelligence(state: GameState, value: number): GameState {
  return { ...state, config: { ...state.config, intelligence: integer(value, state.config.intelligence, 0, 100) } }
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }

export function applyGeneratedEvent(state: GameState, event: LifeEvent, worldMessages: WorldMessage[] = []): GameState {
  if (state.ended || !record(event)) return state
  if (state.currentEvent.choices.length === 0 && state.currentEvent.description.includes('\n你选择了：')) return state
  const incoming = event as unknown as Record<string, unknown>
  const romanticText = /恋爱|伴侣|结婚|求婚|性关系|约会|表达好感/
  const incomingText = [incoming.title, incoming.description, ...(Array.isArray(incoming.choices) ? incoming.choices.flatMap(choice => record(choice) ? [choice.label, choice.hint] : []) : [])].filter(value => typeof value === 'string').join(' ')
  if (state.age < 18 && romanticText.test(incomingText)) return state
  const seen = new Set<string>()
  const choices: Choice[] = Array.isArray(incoming.choices) ? incoming.choices.slice(0, 6).flatMap((item: unknown, index: number): Choice[] => {
    if (!record(item)) return []
    const label = clean(item.label, '', 100)
    if (!label || seen.has(label)) return []
    seen.add(label)
    const effects: Partial<Stats> = {}
    if (record(item.effects)) for (const key of STAT_KEYS) if (typeof item.effects[key] === 'number' && Number.isFinite(item.effects[key])) effects[key] = Math.round(clamp(item.effects[key], -25, 25))
    const related = typeof item.personId === 'string' && state.people.some(person => person.id === item.personId && isPresent(person) && (!romanticText.test(incomingText) || person.age >= 18)) ? item.personId : undefined
    return [{ id: state.currentEvent.choices[index]?.id ?? `${state.currentEvent.id}-choice-${index + 1}`, label, hint: clean(item.hint, '每个选择都会留下不同的回响', 160), effects, ...(related ? { personId: related, relationshipDelta: integer(item.relationshipDelta, 0, -15, 15) } : {}) }]
  }) : []
  // The model can enrich a milestone's prose; explicit relationship decisions remain engine-owned.
  const protectedChoices = state.currentEvent.choices.some(choice => relationshipAction(choice) || choice.id.startsWith('sim:') || choice.id.startsWith('world:'))
  const currentEvent: LifeEvent = { ...state.currentEvent, title: clean(incoming.title, state.currentEvent.title, 140), description: clean(incoming.description, state.currentEvent.description, 3000), choices: !protectedChoices && choices.length >= 2 ? choices : state.currentEvent.choices, source: 'deepseek' }
  const messages: WorldMessage[] = Array.isArray(worldMessages) ? worldMessages.slice(0, 7).flatMap((item: unknown, index: number): WorldMessage[] => {
    if (!record(item)) return []
    const speaker = state.people.find(person => isPresent(person) && (person.name === item.speaker || person.id === item.speaker))
    const target = state.people.find(person => isPresent(person) && (person.name === item.target || person.id === item.target))
    const targetName = target?.name ?? (item.target === state.config.name || item.target === state.id || item.target === 'protagonist' ? state.config.name : undefined)
    const text = clean(item.text, '', 1000)
    if (!speaker || !text || (item.target !== undefined && (!targetName || targetName === speaker.name))) return []
    return [{ id: `${state.id}-generated-world-${state.turn}-${index}`, speaker: speaker.name, ...(targetName ? { target: targetName } : {}), text, year: state.year }]
  }) : []
  const ids = new Set(messages.map(item => item.id))
  return { ...state, currentEvent, worldMessages: [...state.worldMessages.filter(item => !ids.has(item.id)), ...messages].slice(-40) }
}

const boundedString = (value: unknown, max: number, allowEmpty = false): value is string => typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0)
const boundedNumber = (value: unknown, min: number, max: number, whole = false): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!whole || Number.isInteger(value))
const uniqueIds = (values: { id: string }[]) => new Set(values.map(item => item.id)).size === values.length

/** Validate storage imports before any nested value reaches rendering or engine code. */
export function isGameState(value: unknown): value is GameState {
  try {
    if (!record(value) || value.version !== 1 || !boundedString(value.id, 160) || !record(value.config)) return false
    const config = value.config
    if (!boundedString(config.name, 40) || !boundedString(config.location, 60) || !boundedNumber(config.birthYear, 1900, 2100, true) || !boundedNumber(config.startAge, 0, 90, true) || !boundedNumber(config.intelligence, 0, 100, true) || !boundedNumber(config.seed, 0, 4294967295, true)) return false
    if (!boundedNumber(value.age, config.startAge, 110, true) || value.year !== config.birthYear + value.age || !boundedNumber(value.turn, 0, 110, true) || value.turn !== value.age - config.startAge || !FOCUSES.includes(value.focus as Focus)) return false
    if (!record(value.stats) || typeof value.ended !== 'boolean') return false
    const stats = value.stats
    if (!STAT_KEYS.every(key => boundedNumber(stats[key], 0, 100))) return false
    if (value.ended ? !boundedString(value.ending, 2000) : value.ending !== undefined) return false
    if (!Array.isArray(value.people) || value.people.length < 1 || value.people.length > 12 || !Array.isArray(value.history) || value.history.length !== value.turn || !Array.isArray(value.worldMessages) || value.worldMessages.length > 40) return false
    const peopleValid = value.people.every((person: unknown) => {
      if (!record(person) || !boundedString(person.id, 160) || !boundedString(person.name, 60) || !boundedString(person.role, 60) || !boundedNumber(person.age, 0, 125, true) || !boundedString(person.personality, 180) || !boundedNumber(person.closeness, 0, 100) || !boundedNumber(person.trust, 0, 100) || !boundedString(person.mood, 80) || !boundedNumber(person.avatar, 0, 20, true) || !Array.isArray(person.memories) || person.memories.length > 12 || !person.memories.every(memory => boundedString(memory, 240)) || !Array.isArray(person.messages) || person.messages.length > 40) return false
      if (person.role.includes('伴侣') && ((value.age as number) < 18 || person.age < 18)) return false
      return person.messages.every((message: unknown) => record(message) && boundedString(message.id, 180) && (message.role === 'user' || message.role === 'assistant') && boundedString(message.text, 2000) && boundedNumber(message.year, config.birthYear as number, value.year as number, true)) && uniqueIds(person.messages as { id: string }[])
    })
    if (!peopleValid || !uniqueIds(value.people as { id: string }[])) return false
    if (!validateWorldThreads(value.worldThreads, value.year as number, new Set((value.people as Person[]).map(person => person.id)))) return false
    if (value.worldUpdatedYear !== undefined && !boundedNumber(value.worldUpdatedYear, config.birthYear + config.startAge, value.year as number, true)) return false
    if (Array.isArray(value.worldThreads) && value.worldThreads.some(thread => thread.startedYear < (config.birthYear as number) + (config.startAge as number))) return false
    const peopleIds = new Set((value.people as Person[]).filter(isPresent).map(person => person.id))
    const validEvent = (event: unknown, historical: boolean): boolean => {
      if (!record(event) || !boundedString(event.id, 180) || !boundedNumber(event.age, config.startAge as number, value.age as number, true) || event.year !== (config.birthYear as number) + event.age || !['life', 'choice', 'relationship', 'world'].includes(event.kind as string) || !boundedString(event.title, 140) || !boundedString(event.description, historical ? 3400 : 3000) || !['local', 'deepseek'].includes(event.source as string) || !Array.isArray(event.choices) || event.choices.length > 6 || (historical && event.choices.length !== 0)) return false
      return event.choices.every((choice: unknown) => {
        if (!record(choice) || !boundedString(choice.id, 180) || !boundedString(choice.label, 100) || !boundedString(choice.hint, 160) || !record(choice.effects)) return false
        const effects = choice.effects
        if (Object.keys(effects).some(key => !STAT_KEYS.includes(key as StatKey) || !boundedNumber(effects[key], -25, 25))) return false
        return (choice.personId === undefined || typeof choice.personId === 'string' && peopleIds.has(choice.personId)) && (choice.relationshipDelta === undefined || choice.personId !== undefined && boundedNumber(choice.relationshipDelta, -15, 15))
      }) && uniqueIds(event.choices as { id: string }[])
    }
    if (!validEvent(value.currentEvent, false)) return false
    const current = value.currentEvent as LifeEvent
    if (current.age !== value.age || current.year !== value.year || (value.ended && current.choices.length !== 0)) return false
    if (!value.history.every((event: unknown, index: number) => validEvent(event, true) && (event as LifeEvent).age === (config.startAge as number) + index) || !uniqueIds([...value.history as LifeEvent[], current])) return false
    return value.worldMessages.every((message: unknown) => record(message) && boundedString(message.id, 180) && boundedString(message.speaker, 60) && (message.target === undefined || boundedString(message.target, 60)) && boundedString(message.text, 1000) && boundedNumber(message.year, config.birthYear as number, value.year as number, true)) && uniqueIds(value.worldMessages as { id: string }[])
  } catch {
    return false
  }
}
