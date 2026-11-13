import type { CuriosityReport } from '../../shared/curiosity';
import { I } from '../art';
import { getLang, t } from '../i18n';
import { esc, friendly, toast } from '../ui';
import { PLAY_URL } from './home';
import { STYLE_CLASS, styleName } from './parents';

interface Profile {
  style: string; styleBlurb: string; questionsPerMinute: number; followUpRate: number; deepestWhyLevel: number;
  conceptsExplored: number; labAttempts: number; triedAgainAfterFail: boolean | number; wondersFound: number;
  favoriteTopic?: string; conversationStarter?: string;
}
type Report = CuriosityReport & { label?: string; worldName?: string; profile?: Profile };

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

/** Four curiosity dimensions, each 0..1, from the profile numbers. The note under each bar says what it is made of. */
function dims(p: Profile) {
  const retried = typeof p.triedAgainAfterFail === 'number' ? p.triedAgainAfterFail : p.triedAgainAfterFail ? 1 : 0;
  return [
    { key: 'asking', name: t('profile.asking', 'Asking'), v: clamp01(p.questionsPerMinute / 1), note: t('profile.asking.n', '{n} questions a minute', { n: p.questionsPerMinute.toFixed(1) }) },
    { key: 'deeper', name: t('profile.deeper', 'Digging deeper'), v: clamp01(p.followUpRate), note: t('profile.deeper.n', '{n}% of answers got a follow-up "why?"', { n: Math.round(p.followUpRate * 100) }) },
    { key: 'exploring', name: t('profile.exploring', 'Exploring'), v: clamp01((p.conceptsExplored + p.wondersFound) / 6), note: t('profile.exploring.n', '{c} ideas, {w} wonders found', { c: p.conceptsExplored, w: p.wondersFound }) },
    { key: 'experimenting', name: t('profile.experimenting', 'Experimenting'), v: clamp01((p.labAttempts + retried) / 4), note: retried ? t('profile.exp.n2', '{n} lab tries, {r} retries after a sink', { n: p.labAttempts, r: retried }) : t('profile.exp.n0', '{n} lab tries', { n: p.labAttempts }) },
  ];
}

function profileCard(p: Profile) {
  const d = dims(p);
  return `<section class="profile cc-panel" aria-labelledby="prof-h">
    <div class="prof-id">
      <p class="kicker">${t('profile.kicker', 'Curiosity profile')}</p>
      <h2 id="prof-h" class="prof-style ${STYLE_CLASS[p.style] ?? ''}">${esc(styleName(p.style))}</h2>
      <p class="prof-blurb">${esc(t(`style.${p.style.toLowerCase().replace(/\s+/g, '')}.blurb`, p.styleBlurb))}</p>
      ${p.favoriteTopic ? `<p class="prof-fav"><span>${t('profile.favorite', 'Favourite topic')}</span><b>${esc(p.favoriteTopic)}</b></p>` : ''}
    </div>
    <figure class="dimchart">
      <figcaption>${t('profile.chart', 'Curiosity in this session')}</figcaption>
      <ul>
        ${d.map((x) => `<li title="${esc(x.note)}"><span class="dc-name">${esc(x.name)}</span><span class="dc-track"><span class="dc-bar" style="--v:${x.v.toFixed(3)}"></span></span><span class="dc-note">${esc(x.note)}</span></li>`).join('')}
      </ul>
      <p class="dc-foot">${t('profile.chart.foot', 'Full bar = a very curious session. Not a grade.')}</p>
    </figure>
  </section>
  ${p.conversationStarter ? `<section class="tonight" aria-labelledby="ton-h"><h2 id="ton-h">${I.chat} ${t('profile.tonight', 'Talk about it tonight')}</h2><p>${esc(p.conversationStarter)}</p></section>` : ''}`;
}


async function fetchReport(id: string): Promise<Report> {
  const r = await fetch(`/api/cc/report/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) { let m = String(r.status); try { const b = await r.json(); m = b.detail ?? m; } catch { /* */ } throw new Error(m); }
  return r.json();
}

const when = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' }); };

function ladder(level: number, max = 5) {
  const top = Math.max(max, level);
  return `<div class="ladder" role="img" aria-label="${t('report.ladder.aria', 'Why Ladder: reached level {n} of {max}', { n: level, max: top })}">
    ${Array.from({ length: top }, (_, i) => top - i).map((n) => `<span class="rung ${n <= level ? 'on' : ''}"><i>${n}</i></span>`).join('')}
  </div>`;
}

const mark = (v: boolean | null) => v === null
  ? `<span class="rc rc-na">${I.dash}<span>${t('report.recall.na', 'Not asked')}</span></span>`
  : v ? `<span class="rc rc-yes">${I.check}<span>${t('report.recall.yes', 'Right')}</span></span>`
    : `<span class="rc rc-no">${I.x}<span>${t('report.recall.no', 'Not yet')}</span></span>`;

function view(r: Report) {
  return `
  <header class="rep-head cc-panel">
    <p class="kicker">${t('report.kicker', 'Curiosity report')}</p>
    <h1 class="cc-h1">${r.label ? esc(r.label) : t('report.title', 'What your explorer wondered about')}</h1>
    <p class="sub">${t('report.meta2', '{world}, {when}. Code {id}.', { world: esc(r.worldName ?? 'Sunny Surf Beach'), id: esc(r.sessionId), when: esc(when(r.startedAt)) })}</p>
    <p class="honest">${I.eye} ${t('report.honest', 'Every number here comes from what happened in the game. Curiosity is the score: asking counts, being right does not.')}</p>
    <div class="row-gap no-print">
      <button class="btn btn-gold btn-sm" data-act="share">${I.link}<span>${t('report.share', 'Share report')}</span></button>
      <button class="btn btn-soft btn-sm" data-act="print">${I.print}<span>${t('report.print', 'Print')}</span></button>
      <a class="btn btn-ghost btn-sm" href="#parents">${I.back}<span>${t('report.allSessions', 'All sessions')}</span></a><a class="btn btn-ghost btn-sm" href="${PLAY_URL}">${I.play}<span>${t('report.playAgain', 'Play again')}</span></a>
    </div>
  </header>

  ${r.profile ? profileCard(r.profile) : ''}

  <section class="big-stats" aria-label="${t('report.stats', 'Session in numbers')}">
    <div class="stat s-q"><b class="num">${r.questionsAsked}</b><span>${t('report.questions', 'questions asked')}</span></div>
    <div class="stat s-why"><div><b class="num">${r.deepestWhyLevel}</b><span>${t('report.deepest', 'Deepest why level')}</span></div>${ladder(r.deepestWhyLevel)}</div>
    <div class="stat s-min"><b class="num">${Math.round(r.minutes)}</b><span>${t('report.minutesLabel', 'minutes exploring')}</span></div>
  </section>

  <section class="cc-panel rep-sec">
    <h2 class="cc-h2s">${I.book} ${t('report.concepts', 'Ideas they touched')}</h2>
    ${r.concepts.length ? `<dl class="concepts">${r.concepts.map((c) => `<div><dt>${esc(c.name)}</dt><dd>${esc(c.plain)}</dd></div>`).join('')}</dl>` : `<p class="muted">${t('report.concepts.none', 'No ideas recorded yet in this session.')}</p>`}
  </section>

  <div class="rep-two">
    <section class="cc-panel rep-sec">
      <h2 class="cc-h2s">${I.hint} ${t('report.attempts', 'What they tried')}</h2>
      ${r.challengeAttempts.length ? `<ol class="attempts">${r.challengeAttempts.map((a) => `<li><span class="att-choice">${esc(a.choice.replace(/-/g, ' '))}</span><span class="att-arrow" aria-hidden="true">${I.arrow}</span><span class="att-result">${esc(a.result)}</span><small>${esc(a.challenge)}</small></li>`).join('')}</ol>` : `<p class="muted">${t('report.attempts.none', 'No challenge attempts yet.')}</p>`}
      <p class="small muted">${t('report.attempts.note', 'Wrong tries are part of learning. Each one came with a hint.')}</p>
    </section>
    <section class="cc-panel rep-sec">
      <h2 class="cc-h2s">${I.check} ${t('report.beforeAfter', 'Before and after')}</h2>
      <p class="recall-q">${esc(r.recall.prompt)}</p>
      <div class="recall-row"><div><small>${t('report.before', 'Before')}</small>${mark(r.recall.before)}</div><span class="att-arrow" aria-hidden="true">${I.arrow}</span><div><small>${t('report.after', 'After')}</small>${mark(r.recall.after)}</div></div>
      <p class="small muted">${t('report.recall.note', 'One question in one session. A good sign, not proof of long-term memory.')}</p>
    </section>
  </div>

  <section class="cc-panel rep-sec">
    <h2 class="cc-h2s">${I.chat} ${t('report.journal', 'Curiosity Journal')}</h2>
    ${r.journal.length ? `<ul class="journal">${r.journal.map((j) => `<li class="jcard"><span class="jlvl">${t('report.journal.level', 'Why level {n}', { n: j.level })}</span><p class="jq">${esc(j.question)}</p>${j.kidWords ? `<p class="jk">“${esc(j.kidWords)}”</p>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${t('report.journal.none', 'No journal cards yet.')}</p>`}
  </section>

  <div class="rep-two">
    <section class="cc-panel rep-sec home-try">
      <h2 class="cc-h2s">${I.pin} ${t('report.tryAtHome', 'Try at home')}</h2>
      <p>${esc(r.tryAtHome)}</p>
    </section>
    <section class="cc-panel rep-sec">
      <h2 class="cc-h2s">${I.eye} ${t('report.realWorld', 'In the real world')}</h2>
      <dl class="realworld">
        <div><dt>${t('report.book', 'A book to read')}</dt><dd>${esc(r.realWorld.book)}</dd></div>
        <div><dt>${t('report.job', 'A job that uses this')}</dt><dd>${esc(r.realWorld.job)}</dd></div>
        <div><dt>${t('report.person', 'A person to look up')}</dt><dd>${esc(r.realWorld.person)}</dd></div>
      </dl>
    </section>
  </div>`;
}

export function renderCCReport(main: HTMLElement, id?: string) {
  main.className = 'report cc-report';
  let alive = true;
  if (!id) {
    main.innerHTML = `<header class="rep-head cc-panel"><p class="kicker">${t('report.kicker', 'Curiosity report')}</p>
      <h1 class="cc-h1">${t('report.find', 'Open a report')}</h1>
      <p class="sub">${t('report.find.sub', 'At the end of a session the game shows a report link. Paste the session code from it here.')}</p>
      <form class="find" id="find"><label for="sid">${t('report.code', 'Session code')}</label><div class="row-gap"><input id="sid" required autocomplete="off"/><button class="btn btn-gold" type="submit">${t('report.open', 'Open report')}</button></div></form></header>`;
    main.querySelector<HTMLFormElement>('#find')!.addEventListener('submit', (e) => { e.preventDefault(); const v = main.querySelector<HTMLInputElement>('#sid')!.value.trim(); if (v) location.hash = `#report/${encodeURIComponent(v)}`; });
    return () => { alive = false; };
  }
  main.innerHTML = `<p class="pad">${t('report.loading', 'Loading the report…')}</p>`;
  fetchReport(id).then((r) => {
    if (!alive) return;
    main.innerHTML = view(r);
    main.querySelector('[data-act=share]')!.addEventListener('click', () => {
      const link = `${location.origin}/#report/${encodeURIComponent(r.sessionId)}`;
      navigator.clipboard?.writeText(link).then(() => toast(t('report.copied', 'Link copied')), () => toast(link, 'warn'));
    });
    main.querySelector('[data-act=print]')!.addEventListener('click', () => print());
  }, (e) => {
    if (!alive) return;
    main.innerHTML = `<header class="rep-head cc-panel"><h1 class="cc-h1">${t('report.title.short', 'Curiosity report')}</h1>
      <div class="err" role="alert"><p>${/^404$|not found/i.test(String((e as Error).message)) ? t('report.notFound', 'No report with that code yet. Finish a session in the game first.') : esc(friendly(e))}</p>
      <a class="btn btn-soft btn-sm" href="#report">${I.back}<span>${t('report.tryAnother', 'Try another code')}</span></a></div></header>`;
  });
  return () => { alive = false; };
}
