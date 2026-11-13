import { openSiteWonder } from '../wonderSite';
import { LANGS, type Lang } from '../../shared/curiosity';
import { ART_CC } from '../../shared/art';
import { I } from '../art';
import { getLang, LANG_NAMES, setLang, t } from '../i18n';
import { blip } from '../sfx';
import { $, $$, esc } from '../ui';
import { areaSVG, type Area } from '../voxel';

export const PLAY_URL = '/play.html?world=beach';
const ART = '/art/cc';

type Turn = { who: 'kid' | 'sam'; text: string; hook?: string; face?: string; level?: number };

const SCRIPT = (): Turn[] => [
  { who: 'kid', text: t('site.chat.k1', 'Why do waves crash on the beach?') },
  { who: 'sam', face: 'think', level: 1, text: t('site.chat.s1', 'Wind pushes the sea into bumps that roll toward the shore.'), hook: t('site.chat.h1', 'But why do they tip over at the end?') },
  { who: 'kid', text: t('site.chat.k2', 'Why?') },
  { who: 'sam', face: 'happy', level: 2, text: t('site.chat.s2', 'Near the beach the water gets shallow, so the bottom of the wave drags on the sand.'), hook: t('site.chat.h2', 'But why does the top keep going?') },
  { who: 'kid', text: t('site.chat.k3', 'Why??') },
  { who: 'sam', face: 'laugh', level: 3, text: t('site.chat.s3', 'Nothing slows the top, so it runs ahead and topples. Crash!'), hook: t('site.chat.h3', 'Want to test it in the Wave Maker?') },
];

export const AREAS = (): { k: Area; name: string; guide: string; about: string }[] => [
  { k: 'beach', name: t('area.beach', 'Sunny Surf Beach'), guide: t('area.beach.g', 'Surfer Sam'), about: t('area.beach.d', 'Waves, wind, and what floats.') },
  { k: 'volcano', name: t('area.volcano', 'Ember Peak'), guide: t('area.volcano.g', 'Rocky the Lava Golem'), about: t('area.volcano.d', 'Lava, rocks, and the heat inside the Earth.') },
  { k: 'ice', name: t('area.ice', 'Frostbite Cave'), guide: t('area.ice.g', 'Penny the Penguin'), about: t('area.ice.d', 'Ice, cold, and animals that keep warm.') },
  { k: 'jungle', name: t('area.jungle', 'Whispering Jungle'), guide: t('area.jungle.g', 'Fern the Tree Frog'), about: t('area.jungle.d', 'Plants, rain, and creatures of the canopy.') },
];

const PENS = ['#1d6fe0', '#ff3d7f', '#14b86a', '#ff8a00', '#8a4dff', '#1d1a3a'];

type Doodle = 'wave' | 'sun' | 'surfboard' | 'fish' | 'sand' | 'wind';
const WONDER = (): Record<Doodle, { label: string; a: string; qs: string[] }> => ({
  wave: { a: t('site.wb.wave.a', 'a wave'), label: t('site.wb.wave', 'Wave'), qs: [t('site.wb.wave.1', 'Why do waves crash?'), t('site.wb.wave.2', 'Where does a wave get its energy?'), t('site.wb.wave.3', 'Why are some waves bigger?')] },
  sun: { a: t('site.wb.sun.a', 'the sun'), label: t('site.wb.sun', 'Sun'), qs: [t('site.wb.sun.1', 'Why is the sand hot but the sea cool?'), t('site.wb.sun.2', 'Why does the sun make wind?'), t('site.wb.sun.3', 'Why is the sea blue?')] },
  surfboard: { a: t('site.wb.surfboard.a', 'a surfboard'), label: t('site.wb.surfboard', 'Surfboard'), qs: [t('site.wb.surfboard.1', 'Why does a surfboard float?'), t('site.wb.surfboard.2', 'Would a stone board float?'), t('site.wb.surfboard.3', 'Why are boards long and flat?')] },
  fish: { a: t('site.wb.fish.a', 'a fish'), label: t('site.wb.fish', 'Fish'), qs: [t('site.wb.fish.1', 'How do fish breathe underwater?'), t('site.wb.fish.2b', 'Why don’t fish sink?'), t('site.wb.fish.3', 'Why do fish swim in groups?')] },
  sand: { a: t('site.wb.sand.a', 'sand'), label: t('site.wb.sand', 'Sand'), qs: [t('site.wb.sand.1', 'Where does sand come from?'), t('site.wb.sand.2', 'Why is wet sand darker?'), t('site.wb.sand.3', 'Why do sandcastles need water?')] },
  wind: { a: t('site.wb.wind.a', 'wind'), label: t('site.wb.wind', 'Wind'), qs: [t('site.wb.wind.1', 'Where does wind come from?'), t('site.wb.wind.2', 'Why is it windier at the beach?'), t('site.wb.wind.3', 'How does wind make waves?')] },
});

const LAB = () => [
  { id: 'stone', name: t('site.lab.stone', 'Stone board'), verdict: t('site.lab.stone.v', 'Sank!'), line: t('site.lab.stone.l', 'Glub glub. Stone is heavier than the water it pushes away. A crab is using it as a sofa now.') },
  { id: 'wood', name: t('site.lab.wood', 'Wood board'), verdict: t('site.lab.wood.v', 'Floats, just'), line: t('site.lab.wood.l', 'It floats, but low and wobbly. Wood is lighter than water, but not by much.') },
  { id: 'foam', name: t('site.lab.foam', 'Foam board'), verdict: t('site.lab.foam.v', 'Floats high!'), line: t('site.lab.foam.l2', 'Foam is mostly trapped air, so it sits right on top. Surf’s up!') },
];

export function renderHome(main: HTMLElement, rerender: () => void): () => void {
  main.className = 'home cc2';
  const lang = getLang();
  const play = `${PLAY_URL}${lang !== 'en' ? `&lang=${lang}` : ''}`;
  const wonder = WONDER();
  const lab = LAB();
  main.innerHTML = `
  <section class="hero3" aria-labelledby="hero-h">
    <img class="h3-key" src="${ART}/keyart.webp" alt="" width="1536" height="1024" fetchpriority="high" decoding="async"/>
    <div class="h3-shade" aria-hidden="true"></div>
    <div class="h3-blocks" aria-hidden="true">
      ${[[8, 22, 1.1, 0], [86, 18, .8, 1.2], [78, 64, 1.3, .6], [16, 70, .7, 1.8], [52, 12, .6, 2.4]].map(([x, y, sc, d]) => `<span class="qcube" style="--x:${x}%;--y:${y}%;--s:${sc};--d:${d}s" data-depth="${sc}"><i>?</i></span>`).join('')}
    </div>
    <div class="h3-inner">
      <h1 id="hero-h" class="h3-logo"><img id="logo-img" alt="Curiosity Craft" hidden/><span class="wordmark" id="wordmark"><span class="wm1">Curiosity</span><span class="wm2">Craft</span></span></h1>
      <p class="h3-tag">${t('site.hook.all', 'Ask why. Fail freely. Learn by teaching.')}</p>
      <p class="h3-sub">${t('site.hero.sub', 'An island where kids win points for asking, not for being right.')}</p>
      <div class="h3-ctas">
        <a class="vbtn vbtn-gold vbtn-huge" href="${play}">${I.play}<span>${t('site.cta.playnow', 'Play now')}</span></a>
        <a class="vbtn vbtn-white" href="#parents">${t('site.cta.forparents', 'For parents')}</a>
      </div>
    </div>
    <button class="h3-cue" type="button" id="cue">${t('site.hero.cue', 'See how it works')}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </section>

  <section class="strip island" id="island" aria-labelledby="isl-h">
    <div class="strip-in">
      <header class="strip-head">
        <h2 id="isl-h" class="h2-title">${t('site.island.title', 'Curiosity Island')}</h2>
        <p>${t('site.island.sub', 'Wonder about anything. The Wonder Board sends you to the right corner of the island, and its guide answers your whys.')}</p>
      </header>
      <ul class="areas">${AREAS().map((x) => `<li class="area a-${x.k}">${areaSVG(x.k)}${x.k === 'beach' ? `<img class="area-guide" src="${ART}/sam-happy.webp" alt="" width="96" height="96" loading="lazy"/>` : ''}<h3>${x.name}</h3><p class="area-who"><b>${x.guide}</b></p><p>${x.about}</p></li>`).join('')}</ul>
    </div>
  </section>

  <section class="strip whys" aria-labelledby="whys-h">
    <div class="strip-in whys-grid">
      <header class="strip-head">
        <h2 id="whys-h" class="h2-title">${t('site.whys.title', 'Every answer ends with a why')}</h2>
        <p>${t('site.whys.sub', 'Guides answer in a sentence or two, then ask one back. Each follow-up climbs the Why Ladder and earns curiosity points.')}</p>
      </header>
      <div class="chatbox" aria-label="${t('site.chat.aria', 'Example: Surfer Sam answering why, three levels deep')}">
        <div class="chat-top">
          <img class="sam-face" id="sam-face" src="${ART}/sam-think.webp" alt="Surfer Sam" width="72" height="72"/>
          <div><b>Surfer Sam</b><small>${t('site.chat.sub', 'Sunny Surf Beach')}</small></div>
          <span class="xp" id="xp" aria-live="polite"></span>
        </div>
        <div class="chat-body">
          <ol class="chat-log" id="chat-log" aria-live="polite"></ol>
          <div class="ladder2" aria-hidden="true">
            <span class="l2-star">★</span>
            <span class="l2-rung" data-l="3">3</span><span class="l2-rung" data-l="2">2</span><span class="l2-rung" data-l="1">1</span>
            <small>${t('site.chat.ladder', 'Why Ladder')}</small>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="strip wonder" aria-labelledby="wb-h">
    <div class="strip-in">
      <header class="strip-head">
        <h2 id="wb-h" class="h2-title">${t('site.wb.title', 'The Wonder Board')}</h2>
        <p>${t('site.wb.sub3', 'Draw anything you wonder about. A dinosaur, a rocket, your cat…')}</p>
        <p class="wb-small">${t('site.wb.small', 'The island’s guides help with whatever they can. Parents decide what’s on the island.')}</p>
        <p><button type="button" class="btn btn-gold btn-xl" id="wb-open">✏️ ${t('site.wb.open', 'Open the Wonder Board')}</button></p>
      </header>
      <style>.strip.wonder .wb-grid{display:none}</style>
      <div class="wb-grid">
        <div class="wb-left">
          <div class="wb-board">
            <canvas id="wb-canvas" width="720" height="450" aria-label="${t('site.wb.canvas', 'Drawing board')}" role="img"></canvas>
            <p class="wb-hint" id="wb-hint">${t('site.wb.hint', 'Draw here')}</p>
          </div>
          <div class="wb-tools">
            <div class="swatches" role="radiogroup" aria-label="${t('site.wb.colour', 'Pen colour')}">
              ${PENS.map((c, i) => `<button type="button" class="sw" role="radio" aria-checked="${i === 0}" style="--c:${c}" data-c="${c}" aria-label="${t('site.wb.colour', 'Pen colour')} ${i + 1}"></button>`).join('')}
            </div>
            <button type="button" class="vbtn vbtn-white vbtn-sm" id="wb-undo">${t('site.wb.undo', 'Undo')}</button>
            <button type="button" class="vbtn vbtn-white vbtn-sm" id="wb-clear">${t('site.wb.clear', 'Clear')}</button>
          </div>
          <form class="wb-ask" id="wb-ask">
            <label class="sr-only" for="wb-text">${t('site.wb.typeit', 'Or type what you wonder about')}</label>
            <input id="wb-text" maxlength="120" placeholder="${t('site.wb.typeit.ph', 'Or type it: a volcano, penguins, rain…')}" autocomplete="off"/>
            <button class="vbtn vbtn-gold" type="submit" id="wb-go">${t('site.wb.go', 'I wonder!')}</button>
          </form>
        </div>
        <div class="wb-side">
          <div class="chips6" id="chips" role="group" aria-label="${t('site.wb.chips', 'Pick something to wonder about')}"></div>
          <div class="sam-asks" id="sam-asks" aria-live="polite">
            <img src="${ART}/sam-think.webp" alt="" width="64" height="64" loading="lazy"/>
            <p>${t('site.wb.waiting2', 'Draw or type something, then press “I wonder!”')}</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="strip fail" aria-labelledby="ff-h">
    <div class="strip-in">
      <header class="strip-head">
        <h2 id="ff-h" class="h2-title">${t('site.ff.title', 'Fail freely')}</h2>
        <p>${t('site.ff.sub', 'In the Surfboard Lab, kids build a board and drop it in. Sinking is funny, and it always comes with a hint. Tap a board.')}</p>
      </header>
      <div class="tank">
        ${lab.map((b) => `<button type="button" class="board b-${b.id}" data-b="${b.id}" aria-pressed="false">
          <img src="${ART}/lab/${b.id}.webp" alt="" width="200" height="200" loading="lazy"/>
          <span class="b-name">${esc(b.name)}</span>
          <span class="b-verdict">${esc(b.verdict)}</span>
          <span class="b-line">${esc(b.line)}</span>
        </button>`).join('')}
      </div>
      <p class="lab-line" id="lab-line" aria-live="polite"></p>
    </div>
  </section>

  <section class="strip parents" id="parents-see" aria-labelledby="par-h">
    <div class="strip-in par-grid">
      <header class="strip-head">
        <h2 id="par-h" class="h2-title">${t('site.parents.title', 'What parents see')}</h2>
        <p>${t('site.parents.sub2', 'A short report after every session. Each number comes from what happened in the game: how much they asked, how deep they went, what they tried and what stuck.')}</p>
        <a class="vbtn vbtn-gold" href="${play}">${I.play}<span>${t('site.cta.start', 'Start exploring')}</span></a>
      </header>
      <article class="mini-report" aria-label="${t('site.mr.aria', 'Example report')}">
        <span class="example-tag">${t('site.mr.example', 'Example')}</span>
        <h3>${t('site.mr.title2', 'Maya, 12 minutes on Curiosity Island')}</h3>
        <div class="mr-stats">
          <div class="mr-stat"><b>9</b><span>${t('site.mr.q', 'questions asked')}</span></div>
          <div class="mr-stat mr-why"><img src="${ART}/why-ladder.webp" alt="" width="80" height="120" loading="lazy"/><div><b>3</b><span>${t('site.mr.why', 'deepest why-level')}</span></div></div>
        </div>
        <div class="mr-row">
          <h4>${t('site.mr.recall', 'Why does a foam board float?')}</h4>
          <p class="mr-recall"><span class="rc-x">✗</span><small>${t('site.mr.before', 'start')}</small><span class="rc-arrow">${I.arrow}</span><span class="rc-v">✓</span><small>${t('site.mr.after', 'end')}</small></p>
        </div>
        <div class="mr-row"><h4>${t('site.mr.concepts', 'Ideas touched')}</h4>
          <p class="mr-chips"><span>${t('site.mr.c1', 'Buoyancy')}</span><span>${t('site.mr.c2', 'Density')}</span><span>${t('site.mr.c3', 'Waves carry energy')}</span></p></div>
        <div class="mr-row"><h4>${t('site.mr.attempts', 'What she tried')}</h4>
          <p class="mr-tries"><span class="t-sank">${t('site.mr.t1', 'stone: sank')}</span><span class="t-low">${t('site.mr.t2', 'wood: floated low')}</span><span class="t-ok">${t('site.mr.t3', 'foam: floated')}</span></p></div>
      </article>
    </div>
  </section>

  <section class="strip safe" aria-labelledby="safe-h">
    <div class="strip-in">
      <h2 id="safe-h" class="h2-title">${t('site.safe.title', 'Safe by design')}</h2>
      <ul class="safe3">
        <li><b>${t('site.safe.web', 'No open web')}</b><span>${t('site.safe.web.s', 'No search results, no links out.')}</span></li>
        <li><b>${t('site.safe.data', 'No kid data')}</b><span>${t('site.safe.data.s', 'No accounts or names. Voice is never stored.')}</span></li>
        <li><b>${t('site.safe.syl', 'Parents set the syllabus')}</b><span>${t('site.safe.syl.s', 'Guides only answer from the syllabus parents and teachers write. Drop in a PDF to add a lesson.')}</span></li>
      </ul>
    </div>
  </section>

  <section class="strip langs8" aria-labelledby="lang-h">
    <div class="strip-in">
      <h2 id="lang-h" class="h2-title">${t('site.langs.lucky', '8 languages, because 8 is lucky')}</h2>
      <div class="lang8" role="group" aria-label="${t('site.lang', 'Language')}">
        ${LANGS.map((l) => `<button type="button" class="l8 ${l === lang ? 'on' : ''}" data-lang="${l}" lang="${l}" aria-pressed="${l === lang}">${LANG_NAMES[l]}</button>`).join('')}
      </div>
    </div>
  </section>`;

  const timers = new Set<number>();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const later = (fn: () => void, ms: number) => { const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  // ---------------- logo: use the generated wordmark when it exists, else the text wordmark stays
  const logoUrl = (ART_CC as unknown as { logo?: string }).logo ?? `${ART}/logo.webp`;
  const li = $<HTMLImageElement>('#logo-img', main)!;
  li.onload = () => { if (li.naturalWidth > 1) { li.hidden = false; $('#wordmark', main)!.classList.add('sr-only'); } };
  li.src = logoUrl;
  $('#cue', main)!.addEventListener('click', () => $('#island', main)!.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }));
  // gentle pointer parallax on the floating ? blocks (one rAF per move, desktop only)
  const cubes = $$('.qcube', main);
  let praf = 0;
  const onMove = (e: PointerEvent) => {
    if (reduced || e.pointerType !== 'mouse') return;
    cancelAnimationFrame(praf);
    praf = requestAnimationFrame(() => {
      const dx = e.clientX / innerWidth - .5, dy = e.clientY / innerHeight - .5;
      cubes.forEach((c) => { const k = Number(c.dataset.depth) * 18; c.style.translate = `${(-dx * k).toFixed(1)}px ${(-dy * k).toFixed(1)}px`; });
    });
  };
  addEventListener('pointermove', onMove, { passive: true });

  // ---------------- hero chat: Sam goes three whys deep, the ladder climbs, then it loops
  const log = $('#chat-log', main)!;
  const face = $<HTMLImageElement>('#sam-face', main)!;
  const xp = $('#xp', main)!;
  const rungs = $$('.l2-rung', main);
  const star = $('.l2-star', main)!;
  const setLevel = (n: number) => {
    rungs.forEach((r) => r.classList.toggle('on', Number(r.dataset.l) <= n));
    star.classList.toggle('on', n >= 3);
  };
  const script = SCRIPT();
  const typeInto = (el: HTMLElement, text: string, done: () => void) => {
    if (reduced) { el.textContent = text; done(); return; }
    let i = 0;
    const step = () => { i += 2; el.textContent = text.slice(0, i); if (i < text.length) later(step, 22); else done(); };
    step();
  };
  const playTurn = (k: number) => {
    if (k >= script.length) { later(() => { log.innerHTML = ''; setLevel(0); xp.textContent = ''; playTurn(0); }, reduced ? 9000 : 4200); return; }
    const turn = script[k];
    const li = document.createElement('li');
    li.className = `msg ${turn.who}`;
    if (turn.who === 'kid') {
      li.textContent = turn.text; log.append(li);
      later(() => playTurn(k + 1), reduced ? 200 : 900);
    } else {
      if (turn.face) face.src = `${ART}/sam-${turn.face}.webp`;
      const p = document.createElement('span'); const h = document.createElement('b');
      li.append(p, h); log.append(li);
      typeInto(p, turn.text, () => {
        h.textContent = turn.hook ?? '';
        setLevel(turn.level ?? 0);
        xp.textContent = `+10 ${t('site.chat.xp', 'curiosity')}`; xp.classList.remove('pop'); void xp.offsetWidth; xp.classList.add('pop');
        later(() => playTurn(k + 1), reduced ? 400 : 1700);
      });
    }
    while (log.children.length > 4) log.firstElementChild?.remove();
  };
  // preload faces so swapping doesn't flash
  ['happy', 'laugh'].forEach((f) => { const i = new Image(); i.src = `${ART}/sam-${f}.webp`; });
  later(() => playTurn(0), 500);

  // Same Wonder Board as the game
  $('#wb-open', main)?.addEventListener('click', () => { openSiteWonder(); });
  // ---------------- (legacy inline board, hidden) draw anything -> /api/cc/wonder -> guess, 3 questions and the right guide
  const canvas = $<HTMLCanvasElement>('#wb-canvas', main)!;
  const ctx = canvas.getContext('2d')!;
  const asks = $('#sam-asks', main)!;
  const hint = $('#wb-hint', main)!;
  const goBtn = $<HTMLButtonElement>('#wb-go', main)!;
  const textIn = $<HTMLInputElement>('#wb-text', main)!;
  type Stroke = { c: string; pts: [number, number][] };
  const strokes: Stroke[] = [];
  let cur: Stroke | null = null;
  let pen = PENS[0];
  const pos = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
  const path = (pts: [number, number][], dx = 0, dy = 0) => {
    ctx.beginPath(); ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
    if (pts.length === 1) ctx.lineTo(pts[0][0] + dx + .1, pts[0][1] + dy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
  };
  /** Gel pen: soft drop shadow, the colour, then a glossy highlight along the top edge. */
  const drawStroke = (s: Stroke) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(s.pts, 2, 3); ctx.strokeStyle = 'rgba(29,26,58,.18)'; ctx.lineWidth = 16; ctx.stroke();
    path(s.pts); ctx.strokeStyle = s.c; ctx.lineWidth = 16; ctx.stroke();
    path(s.pts, -2, -3); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 4; ctx.stroke();
  };
  const redraw = () => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    strokes.forEach(drawStroke);
    hint.hidden = strokes.length > 0;
  };
  redraw();
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); cur = { c: pen, pts: [pos(e)] }; strokes.push(cur); redraw(); });
  canvas.addEventListener('pointermove', (e) => { if (!cur) return; cur.pts.push(pos(e)); redraw(); });
  const endStroke = () => { cur = null; };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  $('#wb-undo', main)!.addEventListener('click', () => { strokes.pop(); redraw(); blip(440); });
  $('#wb-clear', main)!.addEventListener('click', () => { strokes.length = 0; redraw(); textIn.value = ''; blip(330); });
  $$<HTMLButtonElement>('.sw', main).forEach((b) => b.addEventListener('click', () => {
    pen = b.dataset.c!; $$('.sw', main).forEach((x) => x.setAttribute('aria-checked', String(x === b))); blip(700);
  }));

  /** Rough local guess from the stroke shape, only used when the API can't answer. */
  function localGuess(): Doodle {
    const p = strokes.flatMap((s) => s.pts);
    if (p.length < 4) return 'wave';
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    let turns = 0;
    for (let i = 2; i < p.length; i++) { const d1 = p[i - 1][1] - p[i - 2][1], d2 = p[i][1] - p[i - 1][1]; if (d1 * d2 < 0) turns++; }
    const closed = Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < Math.max(w, h) * .3;
    if (w > h * 1.6 && turns >= 3) return 'wave';
    if (closed && Math.abs(w - h) < Math.max(w, h) * .35) return 'sun';
    if (h > w * 1.6) return 'surfboard';
    if (closed) return 'fish';
    if (w > h * 2.5) return 'wind';
    return 'sand';
  }

  const guideFor = (area: string, npc?: string, areaName?: string) => {
    const a = AREAS().find((x) => x.k === (area === 'ice' ? 'ice' : area)) ?? AREAS()[0];
    return `<p class="guide-line"><span class="abadge ab-${a.k}">${esc(areaName || a.name)}</span>${t('site.wb.guide', '{npc} can help with this.', { npc: esc(npc || a.guide) })}</p>`;
  };
  const playLink = () => `/play.html?world=beach&lang=${getLang()}`;
  const qCards = (qs: string[]) => `<ol class="qcards">${qs.slice(0, 3).map((q) => `<li><a href="${playLink()}"><span>${esc(q)}</span><small>${t('site.wb.askgame', 'Ask in the game')} ${I.arrow}</small></a></li>`).join('')}</ol>`;
  const samImg = (f: string) => `<img src="${ART}/sam-${f}.webp" alt="" width="64" height="64"/>`;
  const pop = () => { asks.classList.remove('pop'); void asks.offsetWidth; asks.classList.add('pop'); };

  interface WonderRes { guess: string; confidence: number; guesses: string[]; questions: string[]; worldTag: string; npc?: string; area?: string; source: string }
  function showResult(r: WonderRes) {
    const unsure = !r.guess || r.confidence < .5;
    asks.innerHTML = `${samImg(unsure ? 'think' : 'happy')}<div class="ask-body">
      ${unsure && r.guesses?.length
        ? `<p class="guess">${t('site.wb.isit', 'Is it a…?')}</p><div class="isit">${r.guesses.slice(0, 3).map((g) => `<button type="button" class="isit-chip">${esc(g)}</button>`).join('')}</div>`
        : `<p class="guess">${t('site.wb.looks', 'Looks like {thing}!', { thing: esc(r.guess) })}</p>`}
      ${qCards(r.questions)}${guideFor(r.worldTag, r.npc, r.area)}</div>`;
    $$<HTMLButtonElement>('.isit-chip', asks).forEach((b) => b.addEventListener('click', () => {
      $$('.isit-chip', asks).forEach((x) => x.classList.toggle('on', x === b));
      asks.querySelector('.guess')!.textContent = t('site.wb.looks', 'Looks like {thing}!', { thing: b.textContent ?? '' });
      blip(820);
    }));
    pop(); blip(880, .1);
  }

  let busy = false, lastSubmit = 0;
  $<HTMLFormElement>('#wb-ask', main)!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = textIn.value.trim();
    if (busy || Date.now() - lastSubmit < 1500) return;          // debounce
    if (!strokes.length && !text) { textIn.focus(); asks.innerHTML = `${samImg('think')}<p>${t('site.wb.empty', 'Draw something first, or type what you wonder about.')}</p>`; pop(); return; }
    busy = true; lastSubmit = Date.now(); goBtn.disabled = true;
    asks.innerHTML = `${samImg('think')}<div class="thinking"><span class="spin-q" aria-hidden="true">?</span><p>${t('site.wb.thinking', 'Hmm, let me look…')}</p></div>`;
    pop(); blip(600);
    const started = Date.now();
    let res: WonderRes | null = null;
    try {
      const r = await fetch('/api/cc/wonder', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ image: strokes.length ? canvas.toDataURL('image/png') : undefined, text: text || undefined, lang: getLang(), worldId: 'beach' }),
      });
      if (r.ok) res = await r.json();
    } catch { /* timeout or offline: local guess below */ }
    if (!res || !res.questions?.length) {
      const k = text ? 'wave' : localGuess();
      res = { guess: text || wonder[k].a, confidence: text ? .9 : .6, guesses: [], questions: wonder[k].qs, worldTag: 'beach', source: 'local' };
    }
    const wait = Math.max(0, (reduced ? 0 : 1800) - (Date.now() - started)); // let the thinking moment land
    later(() => { if (res) showResult(res); busy = false; goBtn.disabled = false; }, wait);
  });

  // ---------------- quick chips: fresh starters from the API, local beach chips as fallback
  const chipsBox = $('#chips', main)!;
  const isEmoji = (s?: string) => !!s && /\p{Extended_Pictographic}/u.test(s);
  type Starter = { id: string; label: string; emoji?: string; questions: string[]; area: string };
  const localStarters = (): Starter[] => (Object.keys(wonder) as Doodle[]).map((k) => ({ id: k, label: wonder[k].label, questions: wonder[k].qs, area: 'beach' }));
  const renderChips = (list: Starter[]) => {
    chipsBox.innerHTML = list.slice(0, 6).map((s, i) => {
      const icon = isEmoji(s.emoji) ? `<span class="chip-emoji" aria-hidden="true">${s.emoji}</span>`
        : `<img src="${ART}/icons/${(Object.keys(wonder) as string[]).includes(s.id) ? s.id : 'wave'}.webp" alt="" width="56" height="56" loading="lazy"/>`;
      return `<button type="button" class="chip6 ca-${esc(s.area)}" data-i="${i}">${icon}<span>${esc(s.label)}</span></button>`;
    }).join('');
    $$<HTMLButtonElement>('.chip6', chipsBox).forEach((b) => b.addEventListener('click', () => {
      const s = list[Number(b.dataset.i)];
      $$('.chip6', chipsBox).forEach((x) => x.classList.toggle('on', x === b));
      asks.innerHTML = `${samImg('happy')}<div class="ask-body"><p class="guess">${esc(s.label)}</p>${qCards(s.questions)}${guideFor(s.area)}</div>`;
      pop(); blip(780);
    }));
  };
  renderChips(localStarters());
  const loadStarters = () => fetch(`/api/cc/starters?lang=${getLang()}`, { signal: AbortSignal.timeout(6000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((list: Starter[]) => { if (Array.isArray(list) && list.length && !chipsBox.querySelector('.chip6.on')) renderChips(list); })
    .catch(() => { /* keep local chips */ });
  loadStarters();
  const starterTimer = window.setInterval(loadStarters, 60000);
  timers.add(starterTimer);

  // ---------------- Fail freely: tap a board to drop it in the water
  $$<HTMLButtonElement>('.board', main).forEach((b) => b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    $('#lab-line', main)!.textContent = on ? (lab.find((x) => x.id === b.dataset.b)?.line ?? '') : '';
    blip(b.dataset.b === 'stone' ? 220 : b.dataset.b === 'wood' ? 440 : 880, .12);
  }));

  // ---------------- languages
  $$<HTMLButtonElement>('.l8', main).forEach((b) => b.addEventListener('click', async () => {
    blip(700);
    await setLang(b.dataset.lang as Lang);
    rerender();
    $<HTMLButtonElement>(`.l8[data-lang="${b.dataset.lang}"]`, main)?.focus();
  }));

  return () => { timers.forEach(clearTimeout); removeEventListener('pointermove', onMove); cancelAnimationFrame(praf); };
}
