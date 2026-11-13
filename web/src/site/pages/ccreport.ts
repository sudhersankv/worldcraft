import type { CuriosityReport } from '../../shared/curiosity';
import { I } from '../art';
import { getLang, t } from '../i18n';
import { esc, friendly, toast } from '../ui';
import { PLAY_URL } from './home';

async function fetchReport(id: string): Promise<CuriosityReport> {
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

function view(r: CuriosityReport) {
  return `
  <header class="rep-head cc-panel">
    <p class="kicker">${t('report.kicker', 'Curiosity report')}</p>
    <h1 class="cc-h1">${t('report.title', 'What your explorer wondered about')}</h1>
    <p class="sub">${t('report.meta', 'Session {id}, {when}.', { id: esc(r.sessionId), when: esc(when(r.startedAt)) })}</p>
    <p class="honest">${I.eye} ${t('report.honest', 'Every number here comes from what happened in the game. Curiosity is the score: asking counts, being right does not.')}</p>
    <div class="row-gap no-print">
      <button class="btn btn-gold btn-sm" data-act="share">${I.link}<span>${t('report.share', 'Share report')}</span></button>
      <button class="btn btn-soft btn-sm" data-act="print">${I.print}<span>${t('report.print', 'Print')}</span></button>
      <a class="btn btn-ghost btn-sm" href="${PLAY_URL}">${I.play}<span>${t('report.playAgain', 'Play again')}</span></a>
    </div>
  </header>

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
      ${r.challengeAttempts.length ? `<ol class="attempts">${r.challengeAttempts.map((a) => `<li><span class="att-choice">${esc(a.choice)}</span><span class="att-arrow" aria-hidden="true">${I.arrow}</span><span class="att-result">${esc(a.result)}</span><small>${esc(a.challenge)}</small></li>`).join('')}</ol>` : `<p class="muted">${t('report.attempts.none', 'No challenge attempts yet.')}</p>`}
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
