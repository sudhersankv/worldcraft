import type { EventType, SessionEvent } from '../../shared/contracts';
import { api } from '../../shared/api';

export class Telemetry {
  sessionId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  log: SessionEvent[] = [];
  constructor(public worldId: string) {}
  async start() {
    try { const r = await api.startSession(this.worldId); if (r?.sessionId) this.sessionId = r.sessionId; } catch { /* offline: keep local id */ }
  }
  send(eventType: EventType, e: Partial<Omit<SessionEvent, 'eventType' | 'sessionId' | 'worldId' | 'timestamp'>> = {}) {
    const ev: SessionEvent = { eventType, sessionId: this.sessionId, worldId: this.worldId, timestamp: new Date().toISOString(), ...e };
    this.log.push(ev);
    void api.event(ev);
  }
}
