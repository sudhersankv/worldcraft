/** Server calls with timeouts and local fallbacks + telemetry (server + parent postMessage). */
import type { AskRequest, AskResponse, CCEvent, CCEventName, CuriosityWorld, WonderRequest, WonderResponse, WorldTag } from '../../shared/curiosity';

async function post<T>(url: string, body: unknown, ms: number): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<T>;
}

export let SESSION = new URLSearchParams(location.search).get('session') || `cc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export function setSession(id: string) { SESSION = id; }
export async function startSession(lang: string) {
  try { const r = await post<{ sessionId: string }>('/api/cc/sessions', { worldId: 'beach', lang }, 2500); if (r?.sessionId) SESSION = r.sessionId; } catch { /* offline: local id */ }
}

export const log: CCEvent[] = [];
export function emit(name: CCEventName, data: Record<string, unknown> = {}) {
  const ev: CCEvent = { sessionId: SESSION, name, data, ts: new Date().toISOString() };
  log.push(ev);
  try { window.parent?.postMessage({ type: 'cc_event', name, data: { ...data, sessionId: SESSION } }, '*'); } catch { /* */ }
  void post('/api/cc/events', ev, 6000).catch(() => undefined);
}

export async function fetchWorld(id: WorldTag): Promise<CuriosityWorld | null> {
  try { const r = await fetch(`/api/cc/worlds/${id}`, { signal: AbortSignal.timeout(2500) }); if (r.ok) return (await r.json()) as CuriosityWorld; } catch { /* */ }
  return null;
}
export function wonder(req: WonderRequest): Promise<WonderResponse> { return post<WonderResponse>('/api/cc/wonder', req, 15000); }
export function ask(req: AskRequest): Promise<AskResponse> { return post<AskResponse>('/api/cc/ask', req, 12000); }
