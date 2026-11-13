/** Presentation mode for the 2-minute demo (#stage). ← / → or the dots to move between slides.
 *  1 Home (key art + logo)  2 Wonder Board (live, same component as the game)  3 What parents see  4 QR code to play. */
import { openSiteWonder } from '../wonderSite';

export function renderStage(main: HTMLElement): () => void {
  main.className = 'stage-page';
  document.body.classList.add('stage-mode');
  main.innerHTML = `
  <style>
    body.stage-mode .pf-nav, body.stage-mode header.topbar, body.stage-mode footer, body.stage-mode .site-foot, body.stage-mode nav.pf-top { display: none !important; }
    .stage-page { position: fixed; inset: 0; z-index: 50; background: #170e33; color: #fff; overflow: hidden; font-family: 'Atkinson Hyperlegible', system-ui, sans-serif; }
    .slide { position: absolute; inset: 0; display: none; place-items: center; text-align: center; padding: 3vh 4vw; }
    .slide.on { display: grid; }
    .s1 { background: url(/art/cc/keyart.webp) center / cover; }
    .s1 .in { display: grid; gap: 2vh; justify-items: center; background: linear-gradient(transparent, rgba(23,14,51,.55)); padding: 3vh 4vw; border-radius: 28px; }
    .s1 img { width: min(70vw, 900px); filter: drop-shadow(0 10px 0 rgba(23,14,51,.45)); }
    .hook { font: 400 clamp(28px, 4.6vw, 64px)/1.05 'Lilita One', 'Jersey 10', system-ui; text-shadow: 0 5px 0 #170e33; }
    .hook b:nth-child(1) { color: #ffd23f } .hook b:nth-child(2) { color: #ff8fc0 } .hook b:nth-child(3) { color: #fff }
    .sub { font-size: clamp(16px, 1.8vw, 26px); opacity: .95; }
    .s2 { background: radial-gradient(circle at 50% 30%, #3a2475, #170e33); }
    .s2 .start { display: grid; gap: 3vh; justify-items: center; }
    .s2 h2, .s3 h2, .s4 h2 { font: 400 clamp(30px, 4.5vw, 64px)/1.05 'Lilita One', system-ui; margin: 0; }
    .bigbtn { font: 700 clamp(18px, 2vw, 28px) system-ui; background: #ffd23f; color: #170e33; border: 4px solid #0f0826; border-radius: 999px; padding: 16px 34px; box-shadow: 0 7px 0 #0f0826; cursor: pointer; }
    .bigbtn:active { transform: translateY(4px); box-shadow: 0 3px 0 #0f0826; }
    .s3 { background: linear-gradient(#4fb4ff, #9fdcff); color: #170e33; }
    .s3 .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2vw; max-width: 1200px; margin-top: 3vh; }
    .s3 .card { background: #fff; border: 4px solid #170e33; border-radius: 22px; box-shadow: 0 8px 0 #170e33; padding: 2.4vh 1.6vw; text-align: left; }
    .s3 .card b { display: block; font: 400 clamp(22px, 2.6vw, 40px) 'Lilita One', system-ui; }
    .s3 .card span { font-size: clamp(14px, 1.4vw, 20px); }
    .s3 .row { margin-top: 3vh; display: flex; gap: 1.5vw; justify-content: center; flex-wrap: wrap; }
    .s3 a.bigbtn { text-decoration: none; display: inline-block; }
    .s4 { background: radial-gradient(circle at 50% 40%, #2a1a52, #170e33); }
    .s4 .qr { background: #fff; padding: 2vh; border-radius: 26px; border: 6px solid #ffd23f; box-shadow: 0 10px 0 #0f0826; }
    .s4 .qr img { width: min(52vh, 70vw); height: auto; display: block; image-rendering: pixelated; }
    .s4 .url { font: 700 clamp(18px, 2.2vw, 32px) system-ui; color: #ffd23f; }
    .dots { position: fixed; bottom: 2vh; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; z-index: 60; }
    .dots button { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; background: transparent; cursor: pointer; opacity: .7; }
    .dots button.on { background: #ffd23f; border-color: #ffd23f; opacity: 1; }
    .exit-stage { position: fixed; top: 1.5vh; right: 1.5vw; z-index: 60; background: rgba(23,14,51,.6); color: #fff; border: 2px solid #fff; border-radius: 999px; padding: 6px 14px; text-decoration: none; font: 600 14px system-ui; opacity: .6; }
    @media (max-width: 760px) { .s3 .cards { grid-template-columns: 1fr; } }
  </style>
  <a class="exit-stage" href="#/">✕</a>
  <section class="slide s1 on" data-i="0">
    <div class="in">
      <img src="/art/cc/logo.webp" alt="Curiosity Craft" />
      <div class="hook"><b>Ask why.</b> <b>Fail freely.</b> <b>Learn by teaching.</b></div>
      <div class="sub">An island where kids win points for asking “why?”, not for being right.</div>
    </div>
  </section>
  <section class="slide s2" data-i="1">
    <div class="start">
      <h2>The Wonder Board</h2>
      <div class="sub">Draw anything you wonder about.</div>
      <button class="bigbtn" type="button" id="stage-wonder">✏️ Open the Wonder Board</button>
    </div>
  </section>
  <section class="slide s3" data-i="2">
    <div>
      <h2>What parents see</h2>
      <div class="cards">
        <div class="card"><b>Why Ladder</b><span>How many “why?”s deep a child goes, not right answers.</span></div>
        <div class="card"><b>Before → After</b><span>The same recall question at the start and the end. ✗ → ✓</span></div>
        <div class="card"><b>Curiosity Profile</b><span>Deep Diver, Explorer or Experimenter, plus a “talk about it tonight” idea.</span></div>
      </div>
      <div class="row"><a class="bigbtn" href="#parents" id="stage-parents">Open the parent dashboard →</a></div>
    </div>
  </section>
  <section class="slide s4" data-i="3">
    <div style="display:grid;gap:2.4vh;justify-items:center">
      <h2>Play it now</h2>
      <div class="qr"><img src="/art/cc/qr-play.png" alt="QR code to play Curiosity Craft" /></div>
      <div class="url">corvus.gent/curiosity</div>
    </div>
  </section>
  <nav class="dots" aria-label="Slides">${[0, 1, 2, 3].map((i) => `<button type="button" data-go="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</nav>`;

  const slides = Array.from(main.querySelectorAll<HTMLElement>('.slide'));
  const dots = Array.from(main.querySelectorAll<HTMLButtonElement>('.dots button'));
  let cur = 0;
  let board: { close(): void } | null = null;
  const show = (i: number) => {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => s.classList.toggle('on', k === cur));
    dots.forEach((d, k) => d.classList.toggle('on', k === cur));
    if (cur !== 1 && board) { board.close(); board = null; }
  };
  const openBoard = () => {
    board?.close();
    board = openSiteWonder({ root: document.body, onPick: () => { /* stay on stage: the cards are the show */ }, onClose: () => { board = null; } });
  };
  main.querySelector('#stage-wonder')!.addEventListener('click', openBoard);
  dots.forEach((d) => d.addEventListener('click', () => show(Number(d.dataset.go))));
  const onKey = (e: KeyboardEvent) => {
    if (board) return; // keys belong to the Wonder Board while it is open
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(cur + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(cur - 1); }
    if (e.key === 'Enter' && cur === 1) openBoard();
  };
  addEventListener('keydown', onKey);
  show(0);
  return () => { removeEventListener('keydown', onKey); board?.close(); document.body.classList.remove('stage-mode'); };
}
