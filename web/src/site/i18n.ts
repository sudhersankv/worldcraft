/**
 * Thin bridge to the shared i18n module (web/src/i18n/index.ts, written by another agent).
 * Until it exists, t() returns the English default and the language is tracked locally.
 */
import { LANGS, type Lang } from '../shared/curiosity';

type Mod = { t?: (key: string, fallback?: string, vars?: Record<string, string | number>) => string; getLang?: () => Lang; setLang?: (l: Lang) => unknown };
const mods = import.meta.glob('../i18n/index.ts', { eager: true });
const mod = (mods['../i18n/index.ts'] ?? {}) as Mod;

export const LANG_NAMES: Record<Lang, string> = { en: 'English', es: 'Español', zh: '中文', fr: 'Français', pt: 'Português', nl: 'Nederlands', hi: 'हिन्दी', ta: 'தமிழ்' };

function detect(): Lang {
  const q = new URLSearchParams(location.search).get('lang') as Lang | null;
  if (q && LANGS.includes(q)) return q;
  try { const s = localStorage.getItem('cc-lang') as Lang | null; if (s && LANGS.includes(s)) return s; } catch { /* */ }
  const b = (navigator.language || 'en').slice(0, 2) as Lang;
  return LANGS.includes(b) ? b : 'en';
}

export function t(key: string, en: string, vars?: Record<string, string | number>): string {
  let out = en;
  try { const r = mod.t?.(key, en, vars); if (r && r !== key) out = r; } catch { /* */ }
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return out;
}
export function getLang(): Lang { try { return mod.getLang?.() ?? detect(); } catch { return detect(); } }
export async function setLang(l: Lang): Promise<void> {
  try { localStorage.setItem('cc-lang', l); } catch { /* */ }
  try { await mod.setLang?.(l); } catch { /* */ }
  document.documentElement.lang = l;
}
