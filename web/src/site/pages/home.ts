import { LANGS, type Lang } from '../../shared/curiosity';
import { I } from '../art';
import { getLang, LANG_NAMES, setLang, t } from '../i18n';
import { blip } from '../sfx';
import { beachSVG, blockIcon } from '../voxel';
import { $, $$ } from '../ui';

export const PLAY_URL = '/play.html?world=beach';

export function renderHome(main: HTMLElement, rerender: () => void) {
  main.className = 'home cc';
  const lang = getLang();
  const play = `${PLAY_URL}${lang !== 'en' ? `&lang=${lang}` : ''}`;
  main.innerHTML = `
  <section class="cc-hero" aria-labelledby="cc-h">
    <div class="cc-hero-copy">
      <p class="kicker">${t('site.kicker', 'Sunny Surf Beach: a blocky world for curious kids, ages 6 to 12')}</p>
      <h1 id="cc-h" class="cc-hook">
        <span class="hk hk1">${t('site.hook.ask', 'Ask why.')}</span>
        <span class="hk hk2">${t('site.hook.fail', 'Fail freely.')}</span>
        <span class="hk hk3">${t('site.hook.teach', 'Learn by teaching.')}</span>
      </h1>
      <p class="lede">${t('site.lede', 'Kids roam a blocky beach, wonder about what they see, and ask Surfer Sam why. Every "why?" goes one level deeper. Curiosity is the score, not being right.')}</p>
      <div class="cta-row">
        <a class="btn btn-gold btn-xl" href="${play}">${I.play}<span>${t('site.cta.start', 'Start exploring')}</span></a>
        <a class="btn btn-soft btn-lg" href="#parents">${t('site.cta.parents', 'What parents see')}</a>
      </div>
    </div>
    <div class="cc-hero-art" aria-hidden="true">
      ${beachSVG()}
      <p class="speech"><b>Surfer Sam</b>${t('site.sam', 'Waves are energy moving through water. But why does a board float on top?')}</p>
    </div>
  </section>
  <div class="cc-ground" aria-hidden="true"></div>

  <section class="cc-band" aria-labelledby="how-h">
    <h2 id="how-h" class="cc-h2">${t('site.how.title', 'How it works')}</h2>
    <ol class="cc-steps">
      <li style="--c:#ffcf3a">${blockIcon('#ffcf3a', '1')}<h3>${t('site.how.wonder.t', 'Wonder Board')}</h3><p>${t('site.how.wonder.d', 'Draw, type or say what you wonder about. A wave? A surfboard? It becomes three questions to explore.')}</p></li>
      <li style="--c:#3ec6ff">${blockIcon('#3ec6ff', '2')}<h3>${t('site.how.ask.t', 'Ask why')}</h3><p>${t('site.how.ask.d', 'Talk to Surfer Sam. Every answer ends with a new "why?" and each follow-up climbs the Why Ladder.')}</p></li>
      <li style="--c:#ff6fa8">${blockIcon('#ff6fa8', '3')}<h3>${t('site.how.try.t', 'Try it')}</h3><p>${t('site.how.try.d', 'Build a surfboard from stone, wood or foam and see what floats. Sinking is funny, and it comes with a hint.')}</p></li>
      <li style="--c:#6ee07a">${blockIcon('#6ee07a', '4')}<h3>${t('site.how.journal.t', 'Journal')}</h3><p>${t('site.how.journal.d', 'Every question becomes a card in the Curiosity Journal, with a try-at-home experiment.')}</p></li>
    </ol>
  </section>

  <section class="cc-band cc-parents" id="parents" aria-labelledby="par-h">
    <div class="cc-panel">
      <h2 id="par-h" class="cc-h2">${t('site.parents.title', 'What parents see')}</h2>
      <p class="sub">${t('site.parents.sub', 'After each session you get a short report. Every number comes from what your child actually did in the game.')}</p>
      <ul class="cc-metrics">
        <li><span class="mi">${I.chat}</span><b>${t('site.parents.q', 'Questions asked')}</b><span>${t('site.parents.q.d', 'How often they asked, not how often they were right.')}</span></li>
        <li><span class="mi ladder-mini"><i></i><i></i><i></i></span><b>${t('site.parents.why', 'Deepest why-level')}</b><span>${t('site.parents.why.d', 'How far up the Why Ladder they climbed.')}</span></li>
        <li><span class="mi">${I.book}</span><b>${t('site.parents.concepts', 'Concepts touched')}</b><span>${t('site.parents.concepts.d', 'Each one explained in plain words for you.')}</span></li>
        <li><span class="mi">${I.hint}</span><b>${t('site.parents.attempts', 'Attempts')}</b><span>${t('site.parents.attempts.d', 'What they tried in the challenges, sinking boards included.')}</span></li>
        <li><span class="mi">${I.check}</span><b>${t('site.parents.recall', 'Before and after')}</b><span>${t('site.parents.recall.d', 'One question asked at the start and again at the end.')}</span></li>
      </ul>
    </div>
  </section>

  <section class="cc-band" aria-labelledby="safe-h">
    <h2 id="safe-h" class="cc-h2">${t('site.safe.title', 'Safe by design')}</h2>
    <ul class="cc-safe">
      <li><span class="lock">${I.eye}</span><b>${t('site.safe.web', 'No open web')}</b><span>${t('site.safe.web.d', 'Kids never see search results or links out.')}</span></li>
      <li><span class="lock">${I.x}</span><b>${t('site.safe.data', 'No kid data')}</b><span>${t('site.safe.data.d', 'No accounts, no names. Voice is processed live and never stored.')}</span></li>
      <li><span class="lock">${I.book}</span><b>${t('site.safe.facts', 'Answers from a fact sheet')}</b><span>${t('site.safe.facts.d', 'Surfer Sam only answers from a checked fact sheet about the beach. The game, not the AI, awards progress.')}</span></li>
    </ul>
  </section>

  <section class="cc-band cc-langs" aria-labelledby="lang-h">
    <h2 id="lang-h" class="cc-h2">${t('site.langs.title', 'Plays in 8 languages')}</h2>
    <p class="sub">${t('site.langs.sub', 'Kids can talk and listen in their own language.')}</p>
    <div class="lang-grid" role="group" aria-label="${t('site.langs.title', 'Plays in 8 languages')}">
      ${LANGS.map((l) => `<button class="lang ${l === lang ? 'on' : ''}" data-lang="${l}" lang="${l}" aria-pressed="${l === lang}">${LANG_NAMES[l]}</button>`).join('')}
    </div>
    <a class="btn btn-gold btn-lg" href="${play}">${I.play}<span>${t('site.cta.start', 'Start exploring')}</span></a>
  </section>`;

  $$<HTMLButtonElement>('.lang', main).forEach((b) => b.addEventListener('click', async () => {
    blip(700);
    await setLang(b.dataset.lang as Lang);
    rerender();
    $<HTMLButtonElement>(`.lang[data-lang="${b.dataset.lang}"]`, main)?.focus();
  }));
}
