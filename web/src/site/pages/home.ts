import { LANGS, type Lang } from '../../shared/curiosity';
import { I } from '../art';
import { getLang, LANG_NAMES, setLang, t } from '../i18n';
import { blip } from '../sfx';
import { $, $$, esc } from '../ui';

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

type Doodle = 'wave' | 'sun' | 'surfboard' | 'fish' | 'sand' | 'wind';
const WONDER = (): Record<Doodle, { label: string; a: string; qs: string[] }> => ({
  wave: { a: t('site.wb.wave.a', 'a wave'), label: t('site.wb.wave', 'Wave'), qs: [t('site.wb.wave.1', 'Why do waves crash?'), t('site.wb.wave.2', 'Where does a wave get its energy?'), t('site.wb.wave.3', 'Why are some waves bigger?')] },
  sun: { a: t('site.wb.sun.a', 'the sun'), label: t('site.wb.sun', 'Sun'), qs: [t('site.wb.sun.1', 'Why is the sand hot but the sea cool?'), t('site.wb.sun.2', 'Why does the sun make wind?'), t('site.wb.sun.3', 'Why is the sea blue?')] },
  surfboard: { a: t('site.wb.surfboard.a', 'a surfboard'), label: t('site.wb.surfboard', 'Surfboard'), qs: [t('site.wb.surfboard.1', 'Why does a surfboard float?'), t('site.wb.surfboard.2', 'Would a stone board float?'), t('site.wb.surfboard.3', 'Why are boards long and flat?')] },
  fish: { a: t('site.wb.fish.a', 'a fish'), label: t('site.wb.fish', 'Fish'), qs: [t('site.wb.fish.1', 'How do fish breathe underwater?'), t('site.wb.fish.2', 'Why don\'t fish sink?'), t('site.wb.fish.3', 'Why do fish swim in groups?')] },
  sand: { a: t('site.wb.sand.a', 'sand'), label: t('site.wb.sand', 'Sand'), qs: [t('site.wb.sand.1', 'Where does sand come from?'), t('site.wb.sand.2', 'Why is wet sand darker?'), t('site.wb.sand.3', 'Why do sandcastles need water?')] },
  wind: { a: t('site.wb.wind.a', 'wind'), label: t('site.wb.wind', 'Wind'), qs: [t('site.wb.wind.1', 'Where does wind come from?'), t('site.wb.wind.2', 'Why is it windier at the beach?'), t('site.wb.wind.3', 'How does wind make waves?')] },
});

const LAB = () => [
  { id: 'stone', name: t('site.lab.stone', 'Stone board'), verdict: t('site.lab.stone.v', 'Sank!'), line: t('site.lab.stone.l', 'Glub glub. Stone is heavier than the water it pushes away. A crab is using it as a sofa now.') },
  { id: 'wood', name: t('site.lab.wood', 'Wood board'), verdict: t('site.lab.wood.v', 'Floats, just'), line: t('site.lab.wood.l', 'It floats, but low and wobbly. Wood is lighter than water, but not by much.') },
  { id: 'foam', name: t('site.lab.foam', 'Foam board'), verdict: t('site.lab.foam.v', 'Floats high!'), line: t('site.lab.foam.l', 'Foam is mostly trapped air, so it sits right on top. Surf\'s up!') },
];

export function renderHome(main: HTMLElement, rerender: () => void): () => void {
  main.className = 'home cc2';
  const lang = getLang();
  const play = `${PLAY_URL}${lang !== 'en' ? `&lang=${lang}` : ''}`;
  const wonder = WONDER();
  const lab = LAB();
  main.innerHTML = `
  <section class="h2-hero" aria-labelledby="hook">
    <img class="h2-key" src="${ART}/keyart.webp" alt="" width="1536" height="1024" fetchpriority="high" decoding="async"/>
    <div class="h2-shade" aria-hidden="true"></div>
    <div class="h2-inner">
      <div class="h2-copy">
        <h1 id="hook" class="h2-hook">
          <span class="vx vx-gold">${t('site.hook.ask', 'Ask why.')}</span>
          <span class="vx vx-pink">${t('site.hook.fail', 'Fail freely.')}</span>
          <span class="vx vx-sky">${t('site.hook.teach', 'Learn by teaching.')}</span>
        </h1>
        <p class="h2-lede">${t('site.lede2', 'A blocky beach where kids win points for asking, not for being right. Surfer Sam answers every question and always asks one back.')}</p>
        <div class="h2-ctas">
          <a class="vbtn vbtn-gold" href="${play}">${I.play}<span>${t('site.cta.start', 'Start exploring')}</span></a>
          <a class="vbtn vbtn-white" href="#parents">${t('site.cta.parents', 'What parents see')}</a>
        </div>
      </div>

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
        <p>${t('site.wb.sub', 'In the game, kids draw what they wonder about. Try it: doodle something from the beach, or tap a picture.')}</p>
      </header>
      <div class="wb-grid">
        <div class="wb-board">
          <canvas id="wb-canvas" width="640" height="400" aria-label="${t('site.wb.canvas', 'Drawing board')}" role="img"></canvas>
          <p class="wb-hint" id="wb-hint">${t('site.wb.hint', 'Draw here')}</p>
          <button class="vbtn vbtn-white vbtn-sm wb-clear" id="wb-clear" type="button">${t('site.wb.clear', 'Clear')}</button>
        </div>
        <div class="wb-side">
          <div class="chips6" role="group" aria-label="${t('site.wb.chips', 'Pick something to wonder about')}">
            ${(Object.keys(wonder) as Doodle[]).map((k) => `<button type="button" class="chip6" data-k="${k}"><img src="${ART}/icons/${k}.webp" alt="" width="56" height="56" loading="lazy"/><span>${esc(wonder[k].label)}</span></button>`).join('')}
          </div>
          <div class="sam-asks" id="sam-asks" aria-live="polite">
            <img src="${ART}/sam-think.webp" alt="" width="64" height="64" loading="lazy"/>
            <p>${t('site.wb.waiting', 'Draw something and Sam will wonder with you.')}</p>
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

  <section class="strip parents" id="parents" aria-labelledby="par-h">
    <div class="strip-in par-grid">
      <header class="strip-head">
        <h2 id="par-h" class="h2-title">${t('site.parents.title', 'What parents see')}</h2>
        <p>${t('site.parents.sub2', 'A short report after every session. Each number comes from what happened in the game: how much they asked, how deep they went, what they tried and what stuck.')}</p>
        <a class="vbtn vbtn-gold" href="${play}">${I.play}<span>${t('site.cta.start', 'Start exploring')}</span></a>
      </header>
      <article class="mini-report" aria-label="${t('site.mr.aria', 'Example report')}">
        <span class="example-tag">${t('site.mr.example', 'Example')}</span>
        <h3>${t('site.mr.title', 'Maya\'s 12 minutes at Sunny Surf Beach')}</h3>
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
        <li><b>${t('site.safe.facts', 'Answers from a fact sheet')}</b><span>${t('site.safe.facts.s', 'Sam only answers from checked beach facts.')}</span></li>
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

  // ---------------- Wonder Board: doodle -> a playful guess -> Sam's questions
  const canvas = $<HTMLCanvasElement>('#wb-canvas', main)!;
  const ctx = canvas.getContext('2d')!;
  const asks = $('#sam-asks', main)!;
  const hint = $('#wb-hint', main)!;
  let pts: [number, number][] = [];
  let drawing = false;
  const pos = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = '#1d6fe0';
  const colors = ['#1d6fe0', '#ff4f8b', '#11a86a', '#ff8a00'];
  let stroke = 0;
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true; canvas.setPointerCapture(e.pointerId); hint.hidden = true;
    ctx.strokeStyle = colors[stroke++ % colors.length];
    const [x, y] = pos(e); pts.push([x, y]); ctx.beginPath(); ctx.moveTo(x, y);
  });
  canvas.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); pts.push([x, y]); ctx.lineTo(x, y); ctx.stroke(); });
  const endStroke = () => { if (!drawing) return; drawing = false; if (pts.length > 6) show(guess(pts), true); };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  $('#wb-clear', main)!.addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); pts = []; hint.hidden = false; asks.innerHTML = `<img src="${ART}/sam-think.webp" alt="" width="64" height="64"/><p>${t('site.wb.waiting', 'Draw something and Sam will wonder with you.')}</p>`; });

  function guess(p: [number, number][]): Doodle {
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
  function show(k: Doodle, fromDoodle: boolean) {
    const w = wonder[k];
    blip(780);
    $$<HTMLButtonElement>('.chip6', main).forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    asks.innerHTML = `<img src="${ART}/sam-happy.webp" alt="" width="64" height="64"/>
      <div><p class="guess">${fromDoodle ? t('site.wb.guess2', 'Is it {thing}? Then Sam would ask:', { thing: esc(w.a) }) : t('site.wb.asks', 'Sam would ask:')}</p>
      <ol>${w.qs.map((q) => `<li>${esc(q)}</li>`).join('')}</ol></div>`;
    asks.classList.remove('pop'); void asks.offsetWidth; asks.classList.add('pop');
  }
  $$<HTMLButtonElement>('.chip6', main).forEach((b) => b.addEventListener('click', () => show(b.dataset.k as Doodle, false)));

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

  return () => { timers.forEach(clearTimeout); };
}
