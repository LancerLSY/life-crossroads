import type { ChatReaction, GameState, LifeEvent, WorldMessage } from '../game/types.ts';
export interface ApiStatus { configured: boolean; provider: string; model: string; requiresAccessToken: boolean }
export const DEFAULT_STATUS: ApiStatus = { configured: false, provider: 'DeepSeek', model: 'deepseek-flash', requiresAccessToken: false };
export async function api<T>(path: string, body?: unknown, token = '', signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal ?? AbortSignal.timeout(35_000),
  });
  if (!response.ok) {
    const messages: Record<number, string> = { 401: '请在设置中填写站点访问口令。', 403: '请求来源验证失败，请从游戏页面重试。', 409: '请先完成当前隐藏剧情。', 429: '世界正在思考，请稍后再试。', 503: 'DeepSeek 暂未连接，本次使用本地故事。', 504: '模型响应超时，本次使用本地故事。' };
    throw new Error(messages[response.status] ?? '模型暂时无法回应，本次使用本地故事。');
  }
  return response.json() as Promise<T>;
}
export const generateTurn = (state: GameState, token: string) => api<{ event: LifeEvent; worldMessages: WorldMessage[]; source: string }>('/api/turn', { state }, token);
export const generateReply = (state: GameState, personId: string, message: string, token: string) => api<{ reply: string; source: string; reaction?: ChatReaction }>('/api/chat', { state, personId, message }, token);
