import { goatSVG, I } from '../art';
import { mountCarousel, TEMPLATES } from '../diorama';
import { blip } from '../sfx';
import { $, $$, esc, WORLDS, worldMeta } from '../ui';

const DEMO = '/play.html?world=forest-photosynthesis';

const MENU = [
  { href: '#lab', label: 'Start a lesson', sub: 'Turn a PDF or text into a world' },
  { href: DEMO, label: 'Play demo world', sub: 'The Enchanted Forest: how plants make food' },
  { href: '#library', label: 'World library', sub: 'Every world built so far' },
  { href: '#report', label: 'Grown-ups', sub: 'See what was studied and recalled' },
];

const LOOP = [
  { key: 'study', name: 'Study', icon: I.book, line: 'Read a short card at the place.', body: `
      <article class="parchment">
        <h4>What a plant needs</h4>
        <p>A plant makes its own food. It needs <mark>sunlight</mark>, <mark>water</mark> from the soil and <mark>carbon dioxide</mark> from the air.</p>
        <p class="src">From your lesson: section 2</p>
      </article>` },
  { key: 'check', name: 'Check', icon: I.check, line: 'One or two quick questions.', body: `
      <div class="mini-q"><p>Which one is NOT something a plant needs?</p>
      <ul><li>Sunlight</li><li class="right">Sand ${I.check}</li><li>Water</li></ul></div>` },
  { key: 'explain', name: 'Explain', icon: I.chat, line: 'Say it back to a character, out loud.', body: `
      <div class="talk"><p class="bub npc"><b>Oakley the Tree</b>You read the sunlight card. Can you explain how I make my food?</p>
      <p class="bub kid">You take in water and air, and the sun gives you energy to make sugar.</p>
      <p class="bub npc"><b>Oakley the Tree</b>Yes! One more thing: which gas do I let out?</p></div>` },
  { key: 'practise', name: 'Practise', icon: I.hint, line: 'Use the idea to fix something.', body: `
      <ol class="mini-seq"><li>Leaf catches sunlight</li><li>Roots bring up water</li><li>Leaf makes sugar</li><li>Oxygen goes into the air</li></ol>
      <p class="caption">Put the steps in order to light the Sunlight Tower.</p>` },
  { key: 'recall', name: 'Recall', icon: I.pin, line: 'Walk back and answer from memory.', body: `
      <div class="mini-q"><p><span class="pinlabel">${I.pin} Water Well</span> No cards now. What three things does a plant need?</p>
      <p class="caption">The place is the reminder. Hints come one at a time if they get stuck.</p></div>` },
];

export function renderHome(main: HTMLElement) {
  main.className = 'home';
  main.innerHTML = `
  <section class="title" aria-labelledby="logo">
    <div class="title-inner">
      <h1 id="logo" class="logo"><span class="l1">Curiosity</span><span class="l2">Craft</span></h1>
      <p class="tagline">Study inside a world you can explore.</p>
      <nav class="menu panel-dark" aria-label="Start menu">
        <ul>
          ${MENU.map((m, i) => `<li><a href="${m.href}" class="${i === 0 ? 'sel' : ''}" data-i="${i}">
            <span class="cursor" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4l14 8-14 8 4-8z"/></svg></span>
            <span class="m-label">${m.label}</span><span class="m-sub">${m.sub}</span></a></li>`).join('')}
        </ul>
        <p class="menu-keys" aria-hidden="true"><kbd>&uarr;</kbd><kbd>&darr;</kbd> choose <kbd>Enter</kbd> go</p>
      </nav>
    </div>
    <button class="scroll-hint" type="button">How learning works <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </section>

  <section class="band" aria-labelledby="loop-h">
    <div class="panel-dark questlog">
      <header class="ql-head">
        <h2 id="loop-h" class="disp">Quest log</h2>
        <p>Every goal in a lesson is learned the same five ways, at a real place on the island.</p>
      </header>
      <div class="ql-body">
        <div class="pills pills-col" role="tablist" aria-label="Learning steps">
          ${LOOP.map((s, i) => `<button role="tab" id="lt-${s.key}" aria-controls="lp" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-i="${i}">
            <span class="q-ico">${s.icon}</span><span class="q-txt"><b>${i + 1}. ${s.name}</b><small>${s.line}</small></span></button>`).join('')}
        </div>
        <div class="ql-detail" id="lp" role="tabpanel" aria-live="polite"></div>
      </div>
    </div>
  </section>

  <section class="band" aria-labelledby="worlds-h">
    <div class="panel-dark worlds-panel">
      <header class="ql-head"><h2 id="worlds-h" class="disp">Choose an island</h2><p>Every lesson becomes a quest on one of six islands.</p></header>
      <div class="carousel">
        <canvas id="carousel" aria-hidden="true"></canvas>
        <div class="car-fallback" aria-hidden="true"></div>
        <button class="car-arrow prev" aria-label="Previous island">${I.back}</button>
        <button class="car-arrow next" aria-label="Next island">${I.arrow}</button>
      </div>
      <div class="world-pick">
        <div class="pills pills-grid" role="tablist" aria-label="Islands">
          ${WORLDS.map((w, i) => `<button role="tab" aria-selected="${i === 0}" aria-controls="wd" tabindex="${i === 0 ? 0 : -1}" data-w="${i}" style="--accent:${w.accent}"><i></i>${esc(w.name)}</button>`).join('')}
        </div>
        <div class="world-detail" id="wd" role="tabpanel" aria-live="polite"></div>
      </div>
    </div>
  </section>

  <section class="band" aria-labelledby="voice-h">
    <div class="panel-dark voice-panel">
      <div>
        <h2 id="voice-h" class="disp">Just talk to the characters</h2>
        <p>Kids hold the talk button and explain what they learned. Characters answer only from your lesson and nudge with questions instead of giving it away. When a question goes beyond the lesson, Exa the goat fetches a clue.</p>
        <ul class="ticks"><li>${I.check} Characters only teach what is in your lesson</li><li>${I.check} Wrong answers get a hint and another try</li><li>${I.check} Typing works too, for quiet classrooms</li></ul>
      </div>
      <div class="talkcard">
        <p class="bub npc"><b>Wally the Water Guardian</b>Where does a plant get its water?</p>
        <p class="bub kid">From the soil, through its roots.</p>
        <div class="talkbar"><span class="micbtn">${I.mic}</span>
          <span class="wave" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<i style="--d:${(i * 0.07).toFixed(2)}s;--h:${0.3 + ((i * 37) % 10) / 14}"></i>`).join('')}</span>
          <span class="live">Listening</span></div>
        <div class="talk-goat">${goatSVG('sm')}</div>
      </div>
    </div>
  </section>

  <section class="band" aria-labelledby="grown-h">
    <div class="panel-dark grown">
      <header class="ql-head"><h2 id="grown-h" class="disp">For teachers and parents</h2><p>About a minute of setup. Every word kids read comes from your lesson, and you can change any of it.</p></header>
      <ol class="grid4">
        <li><span class="q-ico">${I.upload}</span><b>Upload a lesson</b><span>A PDF or pasted text. One or two pages works best.</span></li>
        <li><span class="q-ico">${I.pencil}</span><b>Review the study cards</b><span>Three goals, each tied to a sentence in your lesson. Edit cards, questions and answers.</span></li>
        <li><span class="q-ico">${I.link}</span><b>Share one link</b><span>No accounts. Kids open it and start exploring.</span></li>
        <li><span class="q-ico">${I.eye}</span><b>See progress per goal</b><span>Studied, checked, explained, practised, recalled. Evidence from one session, not a grade.</span></li>
      </ol>
      <a class="btn btn-gold btn-lg" href="#lab">${I.upload}<span>Start a lesson</span></a>
    </div>
  </section>`;

  // ---------------- title menu: hover / arrow keys move the cursor
  const items = $$<HTMLAnchorElement>('.menu a', main);
  let sel = 0;
  const select = (i: number, focus = false) => {
    if (i === sel && !focus) return;
    sel = (i + items.length) % items.length;
    items.forEach((a, k) => a.classList.toggle('sel', k === sel));
    if (focus) items[sel].focus();
    blip(520 + sel * 60);
  };
  items.forEach((a, i) => { a.addEventListener('mouseenter', () => select(i)); a.addEventListener('focus', () => select(i)); a.addEventListener('click', () => blip(880, .09)); });
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target as HTMLElement).closest('[role=tablist]')) return;
    if (scrollY > innerHeight * .6) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); select(sel + 1, true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(sel - 1, true); }
    else if (e.key === 'Enter' && document.activeElement === document.body) { items[sel].click(); }
  };
  addEventListener('keydown', onKey);

  // ---------------- tabs helper (pill tabs with arrow keys)
  const tabs = (list: HTMLElement, onPick: (i: number) => void) => {
    const btns = $$<HTMLButtonElement>('[role=tab]', list);
    const pick = (i: number, focus = false) => {
      btns.forEach((b, k) => { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
      if (focus) btns[i].focus();
      onPick(i);
    };
    btns.forEach((b, i) => {
      b.addEventListener('click', () => { pick(i); blip(660); });
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return; e.preventDefault(); pick((i + d + btns.length) % btns.length, true);
      });
    });
    return pick;
  };

  const lp = $('#lp', main)!;
  tabs($('.questlog [role=tablist]', main)!, (i) => {
    const s = LOOP[i];
    lp.setAttribute('aria-labelledby', `lt-${s.key}`);
    lp.innerHTML = `<h3 class="disp">${s.name}</h3>${s.body}`;
  })(0);

  // ---------------- worlds carousel
  const car = mountCarousel($<HTMLCanvasElement>('#carousel', main)!);
  if (!car) main.querySelector('.carousel')!.classList.add('no-gl');
  const wd = $('#wd', main)!;
  const pickWorld = tabs($('.world-pick [role=tablist]', main)!, (i) => {
    const w = worldMeta(TEMPLATES[i]);
    car?.go(i);
    main.querySelector<HTMLElement>('.car-fallback')!.style.setProperty('--accent', w.accent);
    wd.innerHTML = `<h3 class="disp">${esc(w.name)}</h3><p>${esc(w.blurb)}</p>
      <dl><div><dt>Characters</dt><dd>${esc(w.npcs)}</dd></div><div><dt>Sidekick</dt><dd>${esc(w.companion)}</dd></div></dl>
      <div class="row-gap">${w.id === 'forest' ? `<a class="btn btn-gold" href="${DEMO}">${I.play}<span>Play the demo</span></a>` : ''}
      <a class="btn ${w.id === 'forest' ? 'btn-soft' : 'btn-gold'}" href="#lab">${I.upload}<span>Use with my lesson</span></a></div>`;
  });
  let wi = 0;
  pickWorld(0);
  $('.car-arrow.prev', main)!.addEventListener('click', () => { wi = (wi + 5) % 6; pickWorld(wi); blip(600); });
  $('.car-arrow.next', main)!.addEventListener('click', () => { wi = (wi + 1) % 6; pickWorld(wi); blip(700); });
  $$<HTMLButtonElement>('.world-pick [role=tab]', main).forEach((b) => b.addEventListener('click', () => { wi = Number(b.dataset.w); }));

  $('.scroll-hint', main)!.addEventListener('click', () => $('#loop-h', main)!.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));

  return () => { removeEventListener('keydown', onKey); car?.dispose(); };
}
