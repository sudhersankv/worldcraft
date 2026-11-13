/** Thin typed client for the CuriosityCraft API (same origin; Vite proxies /api in dev). */
import type {
  GenerateLessonResponse, GenerateWorldResponse, GoatClue, LessonSpec, Material, NpcReplyRequest,
  NpcReplyResponse, ServerConfig, SessionEvent, SessionResults, TemplateId, Verdict, WorldSpec,
} from './contracts';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const b = await res.json(); msg = b.detail ?? b.error ?? msg; } catch { /* */ }
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return res.json() as Promise<T>;
}
const post = <T>(url: string, body: unknown, timeoutMs = 90000) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }).then(j<T>);

export const api = {
  config: () => fetch('/api/config').then(j<ServerConfig>),
  uploadPdf(file: File): Promise<Material> {
    const fd = new FormData(); fd.append('file', file);
    return fetch('/api/materials', { method: 'POST', body: fd }).then(j<Material>);
  },
  uploadText: (title: string, text: string) => post<Material>('/api/materials/text', { title, text }),
  sample: (sampleId: string) => post<Material>('/api/materials/sample', { sampleId }),
  samples: () => fetch('/api/samples').then(j<{ id: string; title: string; templateId: TemplateId; worldId: string; pdfUrl: string }[]>),
  generateLesson: (materialId: string, ageBand: '7-9' | '10-12' = '7-9') => post<GenerateLessonResponse>('/api/lessons/generate', { materialId, ageBand }),
  generateWorld: (lesson: LessonSpec, templateId?: TemplateId) => post<GenerateWorldResponse>('/api/worlds/generate', { lesson, templateId }),
  saveWorld: (world: WorldSpec) => fetch(`/api/worlds/${encodeURIComponent(world.worldId)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(world) }).then(j<GenerateWorldResponse>),
  world: (worldId: string) => fetch(`/api/worlds/${encodeURIComponent(worldId)}`).then(j<WorldSpec>),
  worlds: () => fetch('/api/worlds').then(j<{ worldId: string; title: string; subject: string; templateId: TemplateId; source: string }[]>),
  npcReply: (req: NpcReplyRequest) => post<NpcReplyResponse>('/api/npc/reply', req, 20000),
  grade: (worldId: string, questionId: string, utterance: string) => post<Verdict>('/api/grade', { worldId, questionId, utterance }, 15000),
  goat: (question: string, worldId?: string) => post<GoatClue>('/api/goat', { question, worldId }, 15000),
  ttsUrl: (text: string, voice: string) => `/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`,
  homeworkCharacters: () => fetch('/api/homework/characters').then(j<import('./contracts').HomeworkCharacter[]>),
  startSession: (worldId: string) => post<{ sessionId: string }>('/api/sessions', { worldId }),
  event: (e: SessionEvent) => post<{ ok: true }>(`/api/sessions/${encodeURIComponent(e.sessionId)}/events`, e, 8000).catch(() => ({ ok: true as const })),
  results: (sessionId: string) => fetch(`/api/sessions/${encodeURIComponent(sessionId)}/results`).then(j<SessionResults>),
  sessions: () => fetch('/api/sessions').then(j<SessionResults[]>),
};
