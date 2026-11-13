import type { Lang } from '../../shared/curiosity';
import { I } from '../art';
import { getLang, LANG_NAMES, t } from '../i18n';
import { esc, friendly } from '../ui';

export interface SessionRow {
  sessionId: string; label: string; startedAt: string; minutes: number; lang: Lang;
  questionsAsked: number; deepestWhyLevel: number; style: string; conceptsExplored: number; worldName: string;
}

export const STYLE_CLASS: Record<string, string> = { 'Deep Diver': 'st-deep', Explorer: 'st-explore', Experimenter: 'st-exp', 'Getting Started': 'st-start' };
export const styleName = (s: string) => t(`style.${s.toLowerCase().replace(/\s+/g, '')}`, s);
const when = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleString(getLang(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };

export function miniLadder(level: number, max = 3) {
  return `<span class="mladder" role="img" aria-label="${t('report.ladder.aria', 'Why Ladder: reached level {n} of {max}', { n: level, max })}">${Array.from({ length: max }, (_, i) => max - i).map((n) => `<i class="${n <= level ? 'on' : ''}"></i>`).join('')}</span>`;
}

function deviceIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem('cc.sessions') ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => typeof x === 'string' ? x : x?.sessionId ?? x?.id).filter((x): x is string => typeof x === 'string');
  } catch { return []; }
}

function card(r: SessionRow, mine: boolean) {
  return `<li><a class="scard" href="#report/${encodeURIComponent(r.sessionId)}">
    <span class="sc-top"><b class="sc-label">${esc(r.label)}</b>${mine ? `<span class="sc-mine">${t('parents.thisDevice', 'This device')}</span>` : ''}<span class="sbadge ${STYLE_CLASS[r.style] ?? ''}">${esc(styleName(r.style))}</span></span>
    <span class="sc-when">${esc(when(r.startedAt))}, ${Math.round(r.minutes)} ${t('parents.min', 'min')}, <span lang="${r.lang}">${esc(LANG_NAMES[r.lang] ?? r.lang)}</span></span>
    <span class="sc-nums">
      <span><b>${r.questionsAsked}</b> ${t('parents.questions', 'questions')}</span>
      <span class="sc-why">${miniLadder(r.deepestWhyLevel)}<b>${r.deepestWhyLevel}</b> ${t('parents.whyDeep', 'whys deep')}</span>
      <span><b>${r.conceptsExplored}</b> ${t('parents.ideas', 'ideas')}</span>
    </span>
    <span class="sc-open">${t('parents.open', 'Open report')} ${I.arrow}</span>
  </a></li>`;
}

export function renderParents(main: HTMLElement) {
  main.className = 'pf-page parents-page';
  let alive = true;
  main.innerHTML = `
    <header class="pf-head">
      <h1 class="pf-h1">${t('parents.title', 'Parents')}</h1>
      <p>${t('parents.sub', 'Every play session gets a report: what your child wondered about, how deep they dug, what they tried. Numbers come straight from the game.')}</p>
    </header>
    <div id="pd" aria-busy="true"><p class="pf-loading">${t('parents.loading', 'Loading sessions…')}</p></div>
    <section class="pf-card find-card" aria-labelledby="find-h">
      <h2 id="find-h" class="pf-h2">${t('parents.find', 'Find a report by code')}</h2>
      <p>${t('parents.find.sub', 'The game shows a session code at the end. Type it here.')}</p>
      <form id="find" class="find-row"><label class="sr-only" for="code">${t('report.code', 'Session code')}</label><input id="code" placeholder="cc-5476bf824d" autocomplete="off" required/><button class="vbtn vbtn-gold vbtn-sm" type="submit">${t('report.open', 'Open report')}</button></form>
    </section>`;
  main.querySelector<HTMLFormElement>('#find')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = main.querySelector<HTMLInputElement>('#code')!.value.trim();
    if (v) location.hash = `#report/${encodeURIComponent(v)}`;
  });

  const box = main.querySelector<HTMLElement>('#pd')!;
  fetch('/api/cc/reports', { signal: AbortSignal.timeout(12000) }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<SessionRow[]>; }).then((rows) => {
    if (!alive) return;
    box.removeAttribute('aria-busy');
    rows.sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
    const mineIds = new Set(deviceIds());
    const total = rows.length;
    const q = rows.reduce((s, r) => s + r.questionsAsked, 0);
    const avg = total ? rows.reduce((s, r) => s + r.deepestWhyLevel, 0) / total : 0;
    const counts = new Map<string, number>(); rows.forEach((r) => counts.set(r.style, (counts.get(r.style) ?? 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const mine = rows.filter((r) => mineIds.has(r.sessionId));
    const unknownMine = [...mineIds].filter((id) => !rows.some((r) => r.sessionId === id));
    box.innerHTML = `
      <section class="tiles" aria-label="${t('parents.summary', 'Summary')}">
        <div class="tile t-a"><b>${total}</b><span>${t('parents.tiles.sessions', 'sessions played')}</span></div>
        <div class="tile t-b"><b>${q}</b><span>${t('parents.tiles.questions', 'questions asked')}</span></div>
        <div class="tile t-c"><b>${avg.toFixed(1)}</b><span>${t('parents.tiles.avgWhy', 'average why-depth')}</span>${miniLadder(Math.round(avg))}</div>
        <div class="tile t-d"><b class="tile-word">${top ? esc(styleName(top)) : '–'}</b><span>${t('parents.tiles.style', 'most common curiosity style')}</span></div>
      </section>
      ${mine.length || unknownMine.length ? `<section aria-labelledby="mine-h"><h2 id="mine-h" class="pf-h2 on-sky">${t('parents.mine', 'Played on this device')}</h2>
        <ul class="scards">${mine.map((r) => card(r, true)).join('')}${unknownMine.map((id) => `<li><a class="scard sc-pending" href="#report/${encodeURIComponent(id)}"><b class="sc-label">${esc(id)}</b><span class="sc-when">${t('parents.pending', 'Report not ready yet. Open to check.')}</span></a></li>`).join('')}</ul></section>` : ''}
      <section aria-labelledby="all-h"><h2 id="all-h" class="pf-h2 on-sky">${t('parents.all', 'All sessions')}</h2>
        ${rows.length ? `<ul class="scards">${rows.map((r) => card(r, mineIds.has(r.sessionId))).join('')}</ul>` : `<div class="pf-card"><p>${t('parents.empty', 'No sessions yet. Play once and the report appears here.')}</p></div>`}
      </section>`;
  }, (e) => {
    if (!alive) return;
    box.removeAttribute('aria-busy');
    box.innerHTML = `<div class="pf-card pf-err" role="alert"><p>${t('parents.error', 'Couldn’t load sessions.')} ${esc(friendly(e))}</p></div>`;
  });
  return () => { alive = false; };
}
