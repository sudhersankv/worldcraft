import { api } from '../../shared/api';
import type { ObjectiveResult, SessionResults } from '../../shared/contracts';
import { I } from '../art';
import { esc, friendly, playUrl } from '../ui';

const when = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

type Mark = 'yes' | 'no' | 'na';
const mark = (m: Mark, yes: string, no: string, na: string) =>
  `<span class="mk mk-${m}">${m === 'yes' ? I.check : m === 'no' ? I.x : I.dash}<span>${m === 'yes' ? yes : m === 'no' ? no : na}</span></span>`;

function stages(o: ObjectiveResult) {
  const checked: Mark = o.attempts === 0 ? 'na' : o.correct > 0 ? 'yes' : 'no';
  const explained: Mark = o.explained === null || o.explained === undefined ? 'na' : o.explained ? 'yes' : 'no';
  const practised: Mark = o.demonstrated ? 'yes' : o.attempts > 0 ? 'no' : 'na';
  const recalled: Mark = o.recalled === null ? 'na' : o.recalled ? 'yes' : 'no';
  return [
    ['Studied', mark(o.studied ? 'yes' : 'na', 'Read the cards', '', 'Not opened')],
    ['Checked', mark(checked, `${o.correct} of ${o.attempts} right`, `0 of ${o.attempts} right`, 'Not tried')],
    ['Explained', mark(explained, 'In own words', 'Tried, not yet', 'Not tried')],
    ['Practised', mark(practised, 'Puzzle solved', 'Still working', 'Not tried')],
    ['Recalled', mark(recalled, 'From memory', 'Not yet', 'Not reached')],
  ];
}

function one(r: SessionResults) {
  const shown = r.objectives.filter((o) => o.demonstrated).length;
  return `
  <div class="page-head report-head">
    <a class="back no-print" href="#sessions">${I.back}<span>All sessions</span></a>
    <h1 class="display h-lg">${esc(r.lessonTitle)}</h1>
    <p class="muted">Session ${esc(r.sessionId)}, started ${esc(when(r.startedAt))}. ${r.completed ? 'Finished the world.' : 'Did not finish the world yet.'} ${r.events} recorded actions.</p>
    <p class="honest">${I.eye} This is evidence from one play session: what was read, answered, explained and recalled. It is not a grade, and one session can't show long-term memory.</p>
    <div class="row-gap no-print">
      <button class="btn btn-paper btn-sm" onclick="print()">${I.print}<span>Print</span></button>
      <a class="btn btn-ghost btn-sm" href="${esc(playUrl(r.worldId))}">${I.play}<span>Open the world</span></a>
    </div>
  </div>
  <p class="tally"><b>${shown} of ${r.objectives.length}</b> goals shown in this session</p>
  <ol class="obj-report">
    ${r.objectives.map((o, i) => `<li class="${o.demonstrated ? 'ok' : ''}">
      <div class="obj-top"><span class="goal-n">${i + 1}</span><h2 class="h-sm">${esc(o.text)}</h2>${o.demonstrated ? `<span class="badge ok">${I.check} Shown</span>` : `<span class="badge plain">Not shown yet</span>`}</div>
      <dl class="stages">${stages(o).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <p class="small muted">${o.attempts} answer${o.attempts === 1 ? '' : 's'}, ${o.hintsUsed} hint${o.hintsUsed === 1 ? '' : 's'} used</p>
    </li>`).join('')}
  </ol>
  <section class="review">
    <h2 class="h-sm">${I.hint} Worth reviewing together</h2>
    ${r.suggestedReview.length ? `<ul>${r.suggestedReview.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : `<p>Nothing flagged. Try asking them to explain one goal to you tomorrow, without the cards.</p>`}
  </section>`;
}

function list(rs: SessionResults[]) {
  return `
  <div class="page-head">
    <h1 class="display h-lg">For grown-ups</h1>
    <p class="muted">After a child plays, their session shows up here. Open one to see, goal by goal, what they studied, explained and recalled.</p>
  </div>
  ${rs.length ? `<ul class="sessions">${rs.map((r) => {
    const shown = r.objectives.filter((o) => o.demonstrated).length;
    return `<li><a href="#sessions/${encodeURIComponent(r.sessionId)}">
      <span class="s-title">${esc(r.lessonTitle)}</span>
      <span class="s-meta">${esc(when(r.startedAt))}</span>
      <span class="s-dots" aria-label="${shown} of ${r.objectives.length} goals shown">${r.objectives.map((o) => `<i class="${o.demonstrated ? 'on' : ''}"></i>`).join('')}</span>
      <span class="s-state">${r.completed ? 'Finished' : 'In progress'}</span>
    </a></li>`;
  }).join('')}</ul>` : `<div class="empty"><p>No sessions yet. Share a world with a child, and their progress shows up here when they play.</p><a class="btn btn-sun" href="#library">${I.play}<span>Pick a world</span></a></div>`}`;
}

export function renderReport(main: HTMLElement, id?: string) {
  main.className = 'report';
  let alive = true;
  main.innerHTML = `<p class="muted pad">Loading…</p>`;
  const fail = (e: unknown) => {
    if (!alive) return;
    main.innerHTML = `<div class="page-head"><h1 class="display h-lg">${id ? 'Session report' : 'For grown-ups'}</h1></div>
      <div class="err" role="alert"><p>${id ? `Couldn't load session “${esc(id)}”. ` : 'Couldn\'t load sessions. '}${esc(friendly(e))}</p>${id ? `<a class="btn btn-paper btn-sm" href="#sessions">${I.back}<span>All sessions</span></a>` : ''}</div>`;
  };
  if (id) api.results(id).then((r) => { if (alive) main.innerHTML = one(r); }, fail);
  else api.sessions().then((rs) => { if (alive) main.innerHTML = list(rs); }, fail);
  return () => { alive = false; };
}
