/** The website uses the SAME Wonder Board component as the game (web/src/game/cc/wonderboard.ts). */
import { openWonderBoard, type WonderStarter } from '../game/cc/wonderboard';
import { getLang, t } from './i18n';

type Res = { guess: string; confidence: number; guesses: string[]; questions: string[]; worldTag: string; npc?: string; area?: string };

const isEmoji = (s?: string) => !!s && /\p{Extended_Pictographic}/u.test(s);

export function openSiteWonder(opts: { root?: HTMLElement; onPick?: (q: { question: string; area: string }) => void; onClose?: () => void } = {}) {
  const root = opts.root ?? document.body;
  return openWonderBoard({
    root,
    t: (k, fb) => t(k, fb),
    async starters(): Promise<WonderStarter[]> {
      const r = await fetch(`/api/cc/starters?lang=${getLang()}`, { signal: AbortSignal.timeout(4000) });
      const arr = r.ok ? await r.json() : [];
      return (Array.isArray(arr) ? arr : []).map((x: { id: string; label: string; emoji?: string; questions: string[]; area?: string }) => ({
        id: x.id, label: x.label, emoji: isEmoji(x.emoji) ? x.emoji : undefined, questions: x.questions, area: x.area ?? 'beach',
      }));
    },
    async submit({ image, text }): Promise<Res> {
      const r = await fetch('/api/cc/wonder', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image, text, lang: getLang(), worldId: 'beach' }), signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    listen: speechListen(),
    onPick: (q) => {
      if (opts.onPick) return opts.onPick(q);
      location.href = `/play.html?world=beach&lang=${getLang()}`;
    },
    onClose: () => opts.onClose?.(),
  });
}

/** Browser speech-to-text for the "Say it" button (resolves with the final words, or '' on error). */
function speechListen(): ((onText: (s: string) => void) => Promise<string>) | undefined {
  const W = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) return undefined;
  const loc: Record<string, string> = { en: 'en-US', es: 'es-ES', zh: 'zh-CN', fr: 'fr-FR', pt: 'pt-BR', nl: 'nl-NL', hi: 'hi-IN', ta: 'ta-IN' };
  return (onText) => new Promise<string>((resolve) => {
    try {
      const r = new Ctor(); let txt = '';
      r.lang = loc[getLang()] ?? 'en-US'; r.interimResults = true; r.continuous = false;
      r.onresult = (e: any) => { txt = Array.from(e.results).map((x: any) => x[0].transcript).join(''); onText(txt); };
      r.onerror = () => resolve(txt);
      r.onend = () => resolve(txt);
      r.start();
    } catch { resolve(''); }
  });
}
