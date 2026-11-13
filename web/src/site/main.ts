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
import { renderParents } from './pages/parents';
import { renderWorlds } from './pages/worlds';
import { renderAbout } from './pages/about';
import './platform.css';
import './hero3.css';

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
  const nav = [
    { href: playHref(), key: 'play', label: t('site.nav.play', 'Play') },
    { href: '#parents', key: 'parents', label: t('site.nav.parents', 'Parents') },
    { href: '#worlds', key: 'worlds', label: t('site.nav.worlds', 'Worlds') },
    { href: '#about', key: 'about', label: t('site.nav.about', 'About') },
  ];
  $('#topbar')!.innerHTML = `
    <a class="brand" href="#/" aria-label="Curiosity Craft home"><img src="/art/cc/logo-mark.webp" alt="" width="34" height="34" onerror="this.onerror=null;this.src='/art/cc/icons/wave.webp'"/><span class="l1">Curiosity</span> <span class="l2">Craft</span></a>
    <button class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="main-nav"><span class="mb-bars" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">${t('site.nav.menu', 'Menu')}</span></button>
    <div class="nav-wrap" id="main-nav">
      <nav class="pills top-pills" aria-label="${t('site.nav.label', 'Main')}">
        ${nav.map((n) => `<a href="${n.href}" class="${n.key === 'play' ? 'nav-play' : ''}" ${n.key === active ? 'aria-current="page"' : ''}>${n.label}</a>`).join('')}
      </nav>
      <label class="lang-pick"><span class="sr-only">${t('site.lang', 'Language')}</span>
        <select id="lang-sel">${LANGS.map((l) => `<option value="${l}" ${l === lang ? 'selected' : ''}>${LANG_NAMES[l]}</option>`).join('')}</select>
      </label>
    </div>`;
  const btn = $<HTMLButtonElement>('#menu-btn')!;
  btn.addEventListener('click', () => { const open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('menu-open', open); });
  $<HTMLSelectElement>('#lang-sel')!.addEventListener('change', async (e) => {
    await setLang((e.target as HTMLSelectElement).value as Lang);
    route(true);
    $<HTMLSelectElement>('#lang-sel')?.focus();
  });
}

function footer() {
  $('#foot')!.innerHTML = `
    <div class="foot-in">
      <div class="foot-brand"><b>Curiosity Craft</b><span>${t('site.hook.all', 'Ask why. Fail freely. Learn by teaching.')}</span></div>
      <p class="foot-privacy">${I.eye} ${t('site.footer.safe', 'No open web. No kid data. Answers only from a checked fact sheet. Voice is never stored.')}</p>
      <p class="foot-lucky">${t('site.langs.lucky', '8 languages, because 8 is lucky')}: ${LANGS.map((l) => `<span lang="${l}">${LANG_NAMES[l]}</span>`).join(' ')}</p>
      <p class="foot-links"><a href="${playHref()}">${t('site.nav.play', 'Play')}</a><a href="#parents">${t('site.nav.parents', 'Parents')}</a><a href="#worlds">${t('site.nav.worlds', 'Worlds')}</a><a href="#about">${t('site.nav.about', 'About')}</a><a href="/ASSETS.md">${t('site.footer.credits', 'Credits')}</a></p>
    </div>`;
}

// ------------------------------------------------------------- router
const PAGES = new Set(['', 'lab', 'library', 'report', 'parents', 'sessions', 'worlds', 'about']);
function route(keepScroll = false) {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, ...rest] = h.split('/');
  if (!PAGES.has(page)) return; // in-page anchor, not a route
  const arg = rest.join('/') ? decodeURIComponent(rest.join('/')) : undefined;
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  main.className = '';
  document.body.classList.remove('menu-open');
  document.documentElement.lang = getLang();
  let key = 'home';
  if (page === 'lab') { key = 'lab'; cleanup = renderLab(main, arg); }
  else if (page === 'library') { key = 'library'; cleanup = renderLibrary(main); }
  else if (page === 'sessions') { key = 'sessions'; cleanup = renderReport(main, arg); }
  else if (page === 'report') { key = 'parents'; cleanup = renderCCReport(main, arg); }
  else if (page === 'parents') { key = 'parents'; cleanup = renderParents(main); }
  else if (page === 'worlds') { key = 'worlds'; cleanup = renderWorlds(main); }
  else if (page === 'about') { key = 'about'; renderAbout(main); }
  else { cleanup = renderHome(main, () => route(true)); }
  document.body.dataset.page = key === 'parents' && page === 'report' ? 'report' : key;
  header(key);
  footer();
  const titles: Record<string, string> = {
    home: 'Curiosity Craft: ask why, fail freely, learn by teaching', parents: `${t('site.nav.parents', 'Parents')} | Curiosity Craft`,
    worlds: `${t('site.nav.worlds', 'Worlds')} | Curiosity Craft`, about: `${t('site.nav.about', 'About')} | Curiosity Craft`,
    lab: 'Lesson Lab | Curiosity Craft', library: 'World library | Curiosity Craft', sessions: 'Lesson sessions | Curiosity Craft',
  };
  document.title = page === 'report' ? `${t('report.kicker', 'Curiosity report')} | Curiosity Craft` : titles[key] ?? 'Curiosity Craft';
  if (keepScroll) return;
  scrollTo({ top: 0 });
  if (h) main.focus({ preventScroll: true });
}

addEventListener('hashchange', () => route());
route();
