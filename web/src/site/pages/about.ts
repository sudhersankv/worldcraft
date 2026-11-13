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
    </section>`;
}
