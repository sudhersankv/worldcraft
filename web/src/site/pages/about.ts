import { I } from '../art';
import { t } from '../i18n';

export function renderAbout(main: HTMLElement) {
  main.className = 'pf-page about-page';
  const ideas: [string, string][] = [
    [t('about.c1', 'Curiosity is the score'), t('about.c1.d', 'Points for asking why, never for being right.')],
    [t('about.c2', 'Failure is content'), t('about.c2.d', 'A sinking stone board is funny and comes with a hint.')],
    [t('about.c3', 'The Wonder Board'), t('about.c3.d', 'Draw, type or say what you wonder about. It becomes three questions.')],
    [t('about.c4', 'Try it, don’t just hear it'), t('about.c4.d', 'Build a surfboard, test an idea, see what happens.')],
    [t('about.c5', 'A bridge to the real world'), t('about.c5.d', 'Every session ends with a try-at-home experiment and a book, job or person.')],
    [t('about.c6', 'Measurable'), t('about.c6.d', 'Questions asked, deepest why-level, ideas, attempts, and one before/after question.')],
    [t('about.c7', 'Safe by design'), t('about.c7.d', 'No open web, no kid data, answers only from a fact sheet.')],
    [t('about.c8', '8 languages'), t('about.c8.d', 'English, Spanish, Chinese, French, Portuguese, Dutch, Hindi and Tamil. 8 is lucky.')],
  ];
  main.innerHTML = `
    <header class="pf-head about-hero">
      <h1 class="h2-hook about-hook"><span class="vx vx-gold">${t('site.hook.ask', 'Ask why.')}</span><span class="vx vx-pink">${t('site.hook.fail', 'Fail freely.')}</span><span class="vx vx-sky">${t('site.hook.teach', 'Learn by teaching.')}</span></h1>
      <p>${t('about.lede', 'Curiosity Craft is Gabe’s idea: a blocky world where kids are rewarded for being curious, not for being right. When you’re a kid, you can ask why. If someone hands you every answer, you don’t learn. And failing isn’t failure.')}</p>
    </header>
    <section aria-labelledby="ideas-h">
      <h2 id="ideas-h" class="pf-h2 on-sky">${t('about.ideas', 'Eight ideas behind it')}</h2>
      <ol class="ideas8">${ideas.map(([h, d]) => `<li><b>${h}</b><span>${d}</span></li>`).join('')}</ol>
    </section>
    <section class="pf-card" aria-labelledby="safe2-h">
      <h2 id="safe2-h" class="pf-h2">${t('about.safety', 'How we keep it safe')}</h2>
      <ul class="safe-list">
        <li>${I.eye}<span>${t('about.s1', 'Kids never see the open web, search results or links out.')}</span></li>
        <li>${I.x}<span>${t('about.s2', 'No accounts and no names. Voice is turned into text live and never stored.')}</span></li>
        <li>${I.book}<span>${t('about.s3b', 'Each guide only answers from a checked fact sheet for their corner of the island. If it isn’t on the sheet, they say “let’s test it!”')}</span></li>
        <li>${I.check}<span>${t('about.s4', 'The game, not the AI, decides when a child climbs the Why Ladder or earns points.')}</span></li>
      </ul>
    </section>
    <section class="pf-card" aria-labelledby="team-h">
      <h2 id="team-h" class="pf-h2">${t('about.team', 'The team')}</h2>
      <ul class="team">
        <li><b>Gabe</b><span>${t('about.gabe', 'The idea, the pitch and getting it to families.')}</span></li>
        <li><b>KV</b><span>${t('about.kv', 'Built the game, the voice and the reports.')}</span></li>
      </ul>
      <p class="corvus">${t('about.corvus', 'Live counters and audience votes:')} <a href="https://corvus.gent" target="_blank" rel="noopener">corvus.gent</a></p>
    </section>`;
}
