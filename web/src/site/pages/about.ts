import { I } from '../art';
import { t } from '../i18n';

/** About = the pitch: why curiosity, what it is, how it is multi-modal, how learning is measured, why families can trust it. */
export function renderAbout(main: HTMLElement) {
  main.className = 'pf-page about-page';
  const loop: [string, string][] = [
    [t('about.l1', 'Wonder'), t('about.l1.d', 'Draw, say or type anything on the Wonder Board. AI vision reads the drawing and turns it into three real questions.')],
    [t('about.l2', 'Ask why'), t('about.l2.d', 'Talk out loud to a guide. Every answer ends with a new “but why?”, so each follow-up climbs one rung deeper.')],
    [t('about.l3', 'Try it'), t('about.l3.d', 'Test the idea with your hands: drop a stone, wood or foam board in the water and see what floats. Predict first.')],
    [t('about.l4', 'Remember'), t('about.l4.d', 'Every question becomes a Journal card, and the same recall question is asked before and after.')],
  ];
  const modes: [string, string, string][] = [
    [I.eye, t('about.m1', 'Sees drawings'), t('about.m1.d', 'A child’s scribble is input. Vision AI guesses what it is (kindly) and finds the questions inside it.')],
    [I.book, t('about.m2', 'Hears and speaks'), t('about.m2.d', 'Kids ask out loud; guides answer in a real voice with captions. No reading or typing needed to start.')],
    [I.check, t('about.m3', 'Hands-on play'), t('about.m3.d', 'A 3D world to explore and physics experiments to run. Learning by doing, not by scrolling.')],
    [I.x, t('about.m4', '8 home languages'), t('about.m4.d', 'English, Spanish, Chinese, French, Portuguese, Dutch, Hindi and Tamil, voice and text. 8 is lucky.')],
  ];
  const measures: [string, string][] = [
    [t('about.e1', 'Questions asked'), t('about.e1.d', 'How often the child chooses to wonder.')],
    [t('about.e2', 'Deepest why-level'), t('about.e2.d', 'How far they push past the first answer.')],
    [t('about.e3', 'Ideas explored'), t('about.e3.d', 'Which concepts came up, explained in plain words for parents.')],
    [t('about.e4', 'Try-again after a fail'), t('about.e4.d', 'Persistence: the stone sank, so they tried foam.')],
    [t('about.e5', 'Before → after recall'), t('about.e5.d', 'The same question at the start and the end of the session.')],
    [t('about.e6', 'A conversation starter'), t('about.e6.d', 'One thing to talk about tonight, plus a try-at-home experiment.')],
  ];
  main.innerHTML = `
    <header class="pf-head about-hero">
      <h1 class="h2-hook about-hook"><span class="vx vx-gold">${t('site.hook.ask', 'Ask why.')}</span><span class="vx vx-pink">${t('site.hook.fail', 'Fail freely.')}</span><span class="vx vx-sky">${t('site.hook.teach', 'Learn by teaching.')}</span></h1>
      <p>${t('about.p.lede', 'Kids ask hundreds of questions a day, until school teaches them that the right answer matters more than the question. Curiosity Craft flips that: it is a world where a child scores by asking “why?”, not by being right.')}</p>
    </header>

    <section class="pf-card" aria-labelledby="why-h">
      <h2 id="why-h" class="pf-h2">${t('about.why.h', 'Why curiosity?')}</h2>
      <p>${t('about.why.p1', 'Curiosity is the engine of learning. When a child asks their own question, they are ready to remember the answer. Handing them every answer skips that moment.')}</p>
      <p>${t('about.why.p2', 'Most learning apps reward correct answers. That trains kids to avoid risk. We reward the question, the follow-up and the brave guess, and we make failure funny, so trying again feels like play.')}</p>
    </section>

    <section aria-labelledby="loop-h">
      <h2 id="loop-h" class="pf-h2 on-sky">${t('about.loop.h', 'How a session works')}</h2>
      <ol class="ideas8">${loop.map(([h, d]) => `<li><b>${h}</b><span>${d}</span></li>`).join('')}</ol>
    </section>

    <section class="pf-card" aria-labelledby="mm-h">
      <h2 id="mm-h" class="pf-h2">${t('about.mm.h', 'Learning was never text-only')}</h2>
      <p>${t('about.mm.p', 'Kids scribble, point, talk and build. Curiosity Craft listens to all of it.')}</p>
      <ul class="safe-list">${modes.map(([ic, h, d]) => `<li>${ic}<span><b>${h}</b> ${d}</span></li>`).join('')}</ul>
    </section>

    <section class="pf-card" aria-labelledby="meas-h">
      <h2 id="meas-h" class="pf-h2">${t('about.meas.h', 'Learning you can measure')}</h2>
      <p>${t('about.meas.p', 'Every number in the parent report comes from what the child actually did in the game, recorded as events. Not from an AI’s opinion, and not a grade.')}</p>
      <ol class="ideas8">${measures.map(([h, d]) => `<li><b>${h}</b><span>${d}</span></li>`).join('')}</ol>
      <p><a class="btn btn-gold" href="#parents">${t('about.meas.cta', 'See the parent dashboard')}</a></p>
    </section>

    <section class="pf-card" aria-labelledby="trust-h">
      <h2 id="trust-h" class="pf-h2">${t('about.trust.h', 'Built for families and teachers to trust')}</h2>
      <ul class="safe-list">
        <li>${I.book}<span>${t('about.t1', 'Parents and teachers write the syllabus. Guides answer only from it; anything else gets “that’s not in our island notes yet”.')}</span></li>
        <li>${I.eye}<span>${t('about.t2', 'No open web, no search results, no links out for kids.')}</span></li>
        <li>${I.x}<span>${t('about.t3', 'No accounts and no names. Voice is turned into text live and never stored.')}</span></li>
        <li>${I.check}<span>${t('about.t4', 'The game, not the AI, decides when a child climbs the Why Ladder or earns points.')}</span></li>
      </ul>
    </section>

    <section class="pf-card" aria-labelledby="next-h">
      <h2 id="next-h" class="pf-h2">${t('about.next.h', 'Where it goes next')}</h2>
      <p>${t('about.next.p', 'Any lesson or picture book becomes a new corner of the island: upload it, and the guides learn its syllabus. Every story a child reads can become a world they can walk into and question.')}</p>
      <p><a class="btn btn-gold btn-xl" href="/play.html?world=beach">${t('about.cta', 'Start exploring')}</a></p>
    </section>
    <p style="text-align:right;margin:8px 4px 24px"><button type="button" id="pitch-toggle" aria-expanded="false" aria-controls="pitch-notes"
      style="background:none;border:0;color:inherit;opacity:.35;font:600 12px/1 inherit;cursor:pointer;padding:6px">✦ notes</button></p>
    <section id="pitch-notes" class="pf-card pitch-notes" hidden aria-label="Pitch notes">${PITCH}</section>`;
  const btn = main.querySelector<HTMLButtonElement>('#pitch-toggle')!;
  const box = main.querySelector<HTMLElement>('#pitch-notes')!;
  const open = (on: boolean) => { box.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) box.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  btn.addEventListener('click', () => open(Boolean(box.hidden)));
  if (/pitch/.test(location.hash) || new URLSearchParams(location.search).has('pitch')) setTimeout(() => open(true), 50);
}

/** Pitch notes for the 2-minute demo (English, intentionally not translated). Hidden behind the "✦ notes" button. */
const PITCH = `
<style>
.pitch-notes h2{margin:0 0 6px}.pitch-notes h3{margin:18px 0 6px;font-size:1.05rem}
.pitch-notes ul,.pitch-notes ol{margin:0;padding-left:1.2em;display:grid;gap:4px}.pitch-notes li{line-height:1.45}
.pitch-notes .hook{font-size:1.15rem;font-weight:700}
</style>
<h2 class="pf-h2">Curiosity Craft: the pitch</h2>
<p class="hook">Ask why. Fail freely. Learn by teaching.</p>
<h3>The problem</h3>
<ul>
<li>Kids ask hundreds of questions a day, until school teaches them the right answer matters more than the question.</li>
<li>Most learning apps reward correct answers, which trains kids to avoid risk.</li>
</ul>
<h3>What it is</h3>
<ul>
<li>A blocky island where kids score by asking “why?”, not by being right.</li>
<li><b>Wonder Board:</b> draw anything (a wave, a dinosaur, a rocket). Vision AI reads the scribble and turns it into 3 real questions.</li>
<li><b>Talk to guides:</b> Surfer Sam, Rocky the Lava Golem, Penny the Penguin and Fern the Tree Frog answer out loud. Every answer ends with “but why?”, and each follow-up climbs the <b>Why Ladder</b>.</li>
<li><b>Try it:</b> drop stone, wood or foam boards in the water. Predict first. Stone sinks with a funny <i>bloop</i> and a hint, so failure becomes content.</li>
<li><b>Curiosity Journal:</b> every question becomes a card.</li>
</ul>
<h3>Multi-modal, as the brief requires</h3>
<ul>
<li><b>Drawing</b> (vision), <b>voice</b> (speech in and out), <b>text</b>, and a <b>3D world</b> you explore with your hands.</li>
<li><b>8 home languages</b> (en, es, zh, fr, pt, nl, hi, ta) in voice and text. 8 is lucky.</li>
</ul>
<h3>Learning you can measure (what parents see)</h3>
<ul>
<li>Questions asked, deepest why-level, ideas explored, try-again after a fail, and <b>the same recall question before and after</b>.</li>
<li>A Curiosity Profile per child: Deep Diver, Explorer or Experimenter.</li>
<li>A “talk about it tonight” conversation starter, plus a try-at-home experiment.</li>
<li>Every number comes from what the child actually did, not from the AI’s opinion.</li>
</ul>
<h3>Built for families and teachers to trust</h3>
<ul>
<li>Parents and teachers <b>write the syllabus</b>: drop in a PDF and the guides teach that lesson.</li>
<li>Guides answer only from it. No open web, no accounts, voice never stored.</li>
<li>The game, not the AI, awards progress.</li>
</ul>
<h3>Where it goes</h3>
<ul><li>Any lesson or picture book becomes a new corner of the island that kids can walk into and question. Epic’s 40,000 books become 40,000 worlds.</li></ul>
<h3>Demo in 2 minutes</h3>
<ol>
<li>Draw a wave, which gives you questions.</li>
<li>Ask Sam out loud and go 3 whys deep.</li>
<li>The stone sinks, the foam floats (“aha!”).</li>
<li>Open the parent report: recall goes from ✗ to ✓.</li>
</ol>
<h3>Close</h3>
<p class="hook">“More why, less because.”</p>
`;
