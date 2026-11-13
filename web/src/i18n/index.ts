/**
 * Curiosity Craft i18n: 8 languages (lucky 8). Usage:
 *   import { t, getLang, setLang, onLang } from '../i18n';
 *   t('roam.countdown', undefined, { s: 30 })  ->  "Wonder Board in 30s"
 *   t('npc.whyLevel', 'Why level {n}', { n: 2 })
 * Lookup order: current language -> English -> fallbackEnglish -> the key itself.
 * Language order: ?lang= -> localStorage 'cc.lang' -> navigator.language -> 'en'.
 */
import { LANGS, SPEECH_LOCALE, type Lang } from '../shared/curiosity';
import en from './en.json';
import es from './es.json';
import zh from './zh.json';
import fr from './fr.json';
import pt from './pt.json';
import nl from './nl.json';
import hi from './hi.json';
import ta from './ta.json';

type Dict = Record<string, string>;
const DICTS: Record<Lang, Dict> = { en, es, zh, fr, pt, nl, hi, ta };

/** Each language's own name, for the switcher. */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English', es: 'Español', zh: '中文', fr: 'Français', pt: 'Português', nl: 'Nederlands', hi: 'हिन्दी', ta: 'தமிழ்',
};
export { LANGS, SPEECH_LOCALE };
export type { Lang };

const STORE_KEY = 'cc.lang';
const isLang = (x: unknown): x is Lang => typeof x === 'string' && (LANGS as string[]).includes(x);

function detect(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && isLang(q.toLowerCase())) return q.toLowerCase() as Lang;
  } catch { /* no location */ }
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (isLang(s)) return s;
  } catch { /* storage blocked */ }
  try {
    for (const l of navigator.languages ?? [navigator.language]) {
      const base = (l || '').toLowerCase().split('-')[0];
      if (isLang(base)) return base;
    }
  } catch { /* no navigator */ }
  return 'en';
}

let current: Lang = detect();
const listeners = new Set<(l: Lang) => void>();
applyDocument(current);

function applyDocument(l: Lang) {
  try {
    document.documentElement.lang = SPEECH_LOCALE[l] ?? l;
  } catch { /* no document */ }
}

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (!isLang(l) || l === current) return;
  current = l;
  try { localStorage.setItem(STORE_KEY, l); } catch { /* ignore */ }
  applyDocument(l);
  listeners.forEach((fn) => { try { fn(l); } catch (e) { console.error(e); } });
}

/** Subscribe to language changes. Returns an unsubscribe function. */
export function onLang(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate `key`; `{name}` placeholders are filled from `vars`. */
export function t(key: string, fallbackEnglish?: string, vars?: Record<string, string | number>): string {
  const s = DICTS[current]?.[key] ?? DICTS.en[key] ?? fallbackEnglish ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** True if the key exists in the current language (not just via English fallback). */
export function has(key: string): boolean {
  return key in (DICTS[current] ?? {});
}

/** BCP-47 locale for speech recognition / TTS in the current language. */
export function speechLocale(l: Lang = current): string {
  return SPEECH_LOCALE[l];
}
