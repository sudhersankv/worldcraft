import '../shared/brand.css';
import '@fontsource/lilita-one';
import './site.css';
import { goatSVG, I } from './art';
import { mountWorld, type Diorama } from './diorama';
import { setSfxMuted, sfxMuted } from './sfx';
import { $ } from './ui';
import { renderHome } from './pages/home';
import { renderLab } from './pages/lab';
import { renderLibrary } from './pages/library';
import { renderReport } from './pages/report';

type Cleanup = void | (() => void);
const main = $('#main')!;
let cleanup: Cleanup;

const NAV = [
  { href: '#lab', label: 'Start a lesson', key: 'lab' },
  { href: '#library', label: 'Worlds', key: 'library' },
  { href: '#report', label: 'Grown-ups', key: 'report' },
];

// ------------------------------------------------------------- the living world behind every page
const stage = document.createElement('div');
stage.className = 'stage';
stage.setAttribute('aria-hidden', 'true');
stage.innerHTML = `<canvas id="world"></canvas><div class="tilt tilt-top"></div><div class="tilt tilt-bot"></div><div class="vignette"></div><div class="painted"></div>`;
document.body.prepend(stage);
let world: Diorama | null = null;
try { world = mountWorld($<HTMLCanvasElement>('#world')!); } catch { world = null; }
if (!world) document.body.classList.add('no-gl');

function header(active: string) {
  $('#topbar')!.innerHTML = `
    <a class="brand" href="#/" aria-label="CuriosityCraft home"><span class="l1">Curiosity</span><span class="l2">Craft</span></a>
    <nav class="pills top-pills" aria-label="Main">
      ${NAV.map((n) => `<a href="${n.href}" ${n.key === active ? 'aria-current="page"' : ''}>${n.label}</a>`).join('')}
    </nav>
    <button class="icon-btn" id="mute" aria-pressed="${sfxMuted()}" aria-label="Menu sounds">${sfxMuted() ? `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>` : `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 0 1 0 8M19.5 5.5a9 9 0 0 1 0 13"/></svg>`}</button>`;
  $('#mute')!.addEventListener('click', () => { setSfxMuted(!sfxMuted()); header(active); $<HTMLButtonElement>('#mute')!.focus(); });
}

function footer() {
  $('#foot')!.innerHTML = `
    <div class="foot-in panel-dark">
      <p class="foot-privacy">${I.mic} No accounts. Voice is processed live and never stored.</p>
      <p class="foot-links"><a href="/ASSETS.md">Credits</a><a href="#report">Session reports</a><a href="#library">All worlds</a></p>
      <p class="foot-small">CuriosityCraft turns a lesson into a small world to study in. Reports show evidence from one play session, not a grade.</p>
    </div>`;
}

// ------------------------------------------------------------- Exa the goat, the site guide
const TIPS: Record<string, string[]> = {
  home: ['I\'m Exa. Use the arrow keys to pick from the menu.', 'Grown-ups: Start a lesson takes about a minute.', 'In the game, ask me anything the lesson doesn\'t cover. I\'ll go find a clue.'],
  lab: ['Drop a PDF, paste some text, or pick a sample to begin.', 'Every goal shows the sentence it came from. Click one to edit it.', 'Study cards are what kids read. Check them before you share.'],
  library: ['These are the worlds built so far. Pick one and play.', 'Review opens the world in the Lesson Lab so you can check the answers.'],
  report: ['This shows what a child did in one session, goal by goal.', 'It\'s evidence from one play, not a test score.'],
};
let tipIdx = 0, tipKey = 'home', tipTimer = 0;
function exaSay(open?: boolean) {
  const bubble = $('#exa-bubble')!;
  const btn = $<HTMLButtonElement>('#exa-btn')!;
  const tips = TIPS[tipKey] ?? TIPS.home;
  bubble.textContent = tips[tipIdx % tips.length];
  const show = open ?? bubble.hidden;
  bubble.hidden = !show;
  btn.setAttribute('aria-expanded', String(show));
  clearTimeout(tipTimer);
  if (show) tipTimer = window.setTimeout(() => { bubble.hidden = true; btn.setAttribute('aria-expanded', 'false'); }, 7000);
}
function exaInit() {
  const dock = $('#exa')!;
  dock.innerHTML = `<p id="exa-bubble" class="exa-bubble" role="status" hidden></p>
    <button id="exa-btn" class="exa-btn" aria-expanded="false" aria-controls="exa-bubble" aria-label="Exa the goat: show a tip">${goatSVG()}</button>`;
  $('#exa-btn')!.addEventListener('click', () => { const b = $('#exa-bubble')!; if (!b.hidden) tipIdx++; exaSay(true); });
}

// ------------------------------------------------------------- soften the world once you scroll past the title
const onScroll = () => {
  const soft = document.body.dataset.page !== 'home' || scrollY > innerHeight * .55;
  document.body.classList.toggle('soft', soft);
  world?.setSoft(soft);
};
addEventListener('scroll', onScroll, { passive: true });

// ------------------------------------------------------------- router
const PAGES = new Set(['', 'lab', 'library', 'report', 'parents']);
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, ...rest] = h.split('/');
  if (!PAGES.has(page)) return; // in-page anchor, not a route
  const arg = rest.join('/') ? decodeURIComponent(rest.join('/')) : undefined;
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  main.className = '';
  let key = 'home';
  document.body.dataset.page = page === 'parents' ? 'report' : page || 'home';
  if (page === 'lab') { key = 'lab'; cleanup = renderLab(main, arg); }
  else if (page === 'library') { key = 'library'; cleanup = renderLibrary(main); }
  else if (page === 'report' || page === 'parents') { key = 'report'; cleanup = renderReport(main, arg); }
  else { cleanup = renderHome(main); }
  header(key);
  if (tipKey !== key) { tipKey = key; tipIdx = 0; if (!$('#exa-bubble')!.hidden) exaSay(true); }
  const titles: Record<string, string> = { home: 'CuriosityCraft: study inside a world you can explore', lab: 'Lesson Lab · CuriosityCraft', library: 'Worlds · CuriosityCraft', report: 'Grown-ups · CuriosityCraft' };
  document.title = titles[key];
  scrollTo({ top: 0 });
  if (h) main.focus({ preventScroll: true });
  onScroll();
}

footer();
exaInit();
addEventListener('hashchange', route);
route();
