import '../shared/brand.css';
import '@fontsource/lilita-one';
import './site.css';
import './cc.css';
import './home.css';
import { LANGS, type Lang } from '../shared/curiosity';
import { I } from './art';
import { getLang, LANG_NAMES, setLang, t } from './i18n';
import { $ } from './ui';
import { PLAY_URL, renderHome } from './pages/home';
import { renderCCReport } from './pages/ccreport';
import { renderLab } from './pages/lab';
import { renderLibrary } from './pages/library';
import { renderReport } from './pages/report';

type Cleanup = void | (() => void);
const main = $('#main')!;
let cleanup: Cleanup;

// sky + blocky hills behind every page (CSS only)
const stage = document.createElement('div');
stage.className = 'stage';
stage.setAttribute('aria-hidden', 'true');
stage.innerHTML = `<div class="sky-hills"></div>`;
document.body.prepend(stage);

function playHref() { const l = getLang(); return `${PLAY_URL}${l !== 'en' ? `&lang=${l}` : ''}`; }

function header(active: string) {
  const lang = getLang();
  $('#topbar')!.innerHTML = `
    <a class="brand" href="#/" aria-label="Curiosity Craft"><span class="l1">Curiosity</span> <span class="l2">Craft</span></a>
    <nav class="pills top-pills" aria-label="${t('site.nav.label', 'Main')}">
      <a href="${playHref()}">${t('site.nav.play', 'Play')}</a>
      <a href="#parents" ${active === 'home-parents' ? 'aria-current="page"' : ''}>${t('site.nav.parents', 'Parents')}</a>
      <a href="#report" ${active === 'report' ? 'aria-current="page"' : ''}>${t('site.nav.report', 'Reports')}</a>
    </nav>
    <label class="lang-pick"><span class="sr-only">${t('site.lang', 'Language')}</span>
      <select id="lang-sel">${LANGS.map((l) => `<option value="${l}" ${l === lang ? 'selected' : ''}>${LANG_NAMES[l]}</option>`).join('')}</select>
    </label>`;
  $<HTMLSelectElement>('#lang-sel')!.addEventListener('change', async (e) => {
    await setLang((e.target as HTMLSelectElement).value as Lang);
    route(true);
    $<HTMLSelectElement>('#lang-sel')?.focus();
  });
}

function footer() {
  $('#foot')!.innerHTML = `
    <div class="foot-in">
      <p class="foot-privacy">${I.mic} ${t('site.footer.privacy', 'No accounts. No kid data. Voice is processed live and never stored.')}</p>
      <p class="foot-links"><a href="${playHref()}">${t('site.nav.play', 'Play')}</a><a href="#report">${t('site.nav.report', 'Reports')}</a><a href="/ASSETS.md">${t('site.footer.credits', 'Credits')}</a></p>
      <p class="foot-small">${t('site.footer.small', 'Curiosity Craft rewards asking, not being right. Reports show what happened in one session, not a grade.')}</p>
    </div>`;
}

// ------------------------------------------------------------- router
const PAGES = new Set(['', 'lab', 'library', 'report', 'parents', 'sessions']);
function route(keepScroll = false) {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, ...rest] = h.split('/');
  if (!PAGES.has(page)) return; // in-page anchor, not a route
  const arg = rest.join('/') ? decodeURIComponent(rest.join('/')) : undefined;
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  main.className = '';
  document.documentElement.lang = getLang();
  let key = 'home';
  if (page === 'lab') { key = 'lab'; cleanup = renderLab(main, arg); }
  else if (page === 'library') { key = 'library'; cleanup = renderLibrary(main); }
  else if (page === 'sessions') { key = 'sessions'; cleanup = renderReport(main, arg); }
  else if (page === 'report') { key = 'report'; cleanup = renderCCReport(main, arg); }
  else { cleanup = renderHome(main, () => route(true)); key = page === 'parents' ? 'home-parents' : 'home'; }
  document.body.dataset.page = key.startsWith('home') ? 'home' : key;
  header(key);
  footer();
  const titles: Record<string, string> = { home: 'Curiosity Craft: ask why, fail freely, learn by teaching', report: `${t('report.kicker', 'Curiosity report')} · Curiosity Craft`, lab: 'Lesson Lab · Curiosity Craft', library: 'Worlds · Curiosity Craft', sessions: 'Lesson sessions · Curiosity Craft' };
  document.title = titles[key.startsWith('home') ? 'home' : key] ?? 'Curiosity Craft';
  if (keepScroll) return;
  if (page === 'parents') { requestAnimationFrame(() => $('#parents')?.scrollIntoView()); return; }
  scrollTo({ top: 0 });
  if (h) main.focus({ preventScroll: true });
}

addEventListener('hashchange', () => route());
route();
