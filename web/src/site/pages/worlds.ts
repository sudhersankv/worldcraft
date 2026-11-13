import { api } from '../../shared/api';
import type { LessonSpec, Material } from '../../shared/contracts';
import { I } from '../art';
import { getLang, t } from '../i18n';
import { esc, friendly } from '../ui';
import { AREAS, PLAY_URL } from './home';
import { areaSVG } from '../voxel';

const MAX = 10 * 1024 * 1024;

export function renderWorlds(main: HTMLElement) {
  main.className = 'pf-page worlds-page';
  let alive = true;
  const lang = getLang();
  const play = `${PLAY_URL}${lang !== 'en' ? `&lang=${lang}` : ''}`;
  main.innerHTML = `
    <header class="pf-head"><h1 class="pf-h1">${t('worlds.title', 'Worlds')}</h1></header>
    <article class="beach-card">
      <img src="/art/cc/keyart.webp" alt="" width="1536" height="1024" loading="lazy"/>
      <div class="bc-body">
        <span class="bc-tag">${t('worlds.playable', 'Playable now')}</span>
        <h2>${t('site.island.title', 'Curiosity Island')}</h2>
        <p>${t('worlds.island.d', 'One island, four corners to explore. Kids wonder about anything on the Wonder Board and get sent to the right place and guide. Ask why, test ideas, fill the Curiosity Journal.')}</p>
        <a class="vbtn vbtn-gold" href="${play}">${I.play}<span>${t('worlds.play2', 'Play Curiosity Island')}</span></a>
      </div>
    </article>
    <ul class="areas areas-w">${AREAS().map((x) => `<li class="area a-${x.k}">${areaSVG(x.k)}<h3>${x.name}</h3><p class="area-who"><b>${x.guide}</b></p><p>${x.about}</p></li>`).join('')}</ul>

    <section class="pf-card beta" aria-labelledby="beta-h">
      <div class="beta-head">
        <h2 id="beta-h" class="pf-h2">${t('worlds.beta.title2', 'Turn your own lesson into a world like this')}</h2><span class="beta-tag">${t('worlds.beta', 'Beta, optional')}</span>
      </div>
      <p>${t('worlds.beta.sub2', 'Teachers and parents: drop in your own PDF or paste a lesson. The AI turns it into the island’s syllabus, so the guides teach YOUR lesson and kids explore it as an interactive world. You decide what is on the island.')}</p>
      <div class="beta-tabs" role="tablist" aria-label="${t('worlds.beta.how', 'How to share it')}">
        <button role="tab" aria-selected="true" aria-controls="bt-pdf" id="bt-pdf-t" data-t="pdf">${I.upload}<span>${t('worlds.beta.pdf', 'Upload a PDF')}</span></button>
        <button role="tab" aria-selected="false" aria-controls="bt-text" id="bt-text-t" data-t="text" tabindex="-1">${I.text}<span>${t('worlds.beta.text', 'Paste text')}</span></button>
      </div>
      <div role="tabpanel" id="bt-pdf" aria-labelledby="bt-pdf-t">
        <label class="drop2" id="drop2"><input type="file" id="pdf" accept="application/pdf,.pdf" class="sr-only"/>
          <span class="d2-big">${t('worlds.beta.drop', 'Drop a PDF here')}</span><span>${t('worlds.beta.drop2', 'or choose a file. PDF only, up to 10 MB.')}</span></label>
      </div>
      <div role="tabpanel" id="bt-text" aria-labelledby="bt-text-t" hidden>
        <form id="paste2" class="paste2">
          <label>${t('worlds.beta.ltitle', 'Lesson title')}<input name="title" required maxlength="120"/></label>
          <label>${t('worlds.beta.ltext', 'Lesson text')}<textarea name="text" rows="7" required minlength="200"></textarea></label>
          <button class="vbtn vbtn-gold vbtn-sm" type="submit">${t('worlds.beta.read', 'Read this lesson')}</button>
        </form>
      </div>
      <div id="beta-out" aria-live="polite"></div>
    </section>`;

  const out = main.querySelector<HTMLElement>('#beta-out')!;
  const tabs = [...main.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  const pick = (k: string) => tabs.forEach((b) => { const on = b.dataset.t === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; main.querySelector<HTMLElement>(`#bt-${b.dataset.t}`)!.hidden = !on; });
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => pick(b.dataset.t!));
    b.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + 1) % 2]; pick(n.dataset.t!); n.focus(); } });
  });

  async function run(p: Promise<Material>) {
    out.innerHTML = `<p class="beta-busy">${t('worlds.beta.reading', 'Reading your lesson and finding the learning goals…')}</p>`;
    try {
      const m = await p;
      const { lesson } = await api.generateLesson(m.materialId, '7-9');
      if (alive) show(lesson);
    } catch (e) {
      if (alive) out.innerHTML = `<div class="pf-err" role="alert"><p>${esc(friendly(e))}</p></div>`;
    }
  }
  function show(l: LessonSpec) {
    const sec = (id: string) => l.sections.find((s) => s.id === id);
    out.innerHTML = `
      <h3 class="beta-lt">${esc(l.title)}</h3>
      <p>${esc(l.summary)}</p>
      <ol class="beta-goals">${l.objectives.map((o) => `<li><b>${esc(o.text)}</b>${o.evidence.slice(0, 1).map((e) => `<blockquote>“${esc(e.quote)}”<cite>${t('worlds.beta.from', 'From')} ${esc(sec(e.sectionId)?.heading ?? e.sectionId)}</cite></blockquote>`).join('')}</li>`).join('')}</ol>
      <div class="beta-done"><span class="bd-ic">${I.check}</span><div><b>${t('worlds.beta.next', 'We’ll build this world next')}</b><p>${t('worlds.beta.next.d', 'Your lesson is on our build list. Until then, Sunny Surf Beach is ready to play.')}</p></div></div>`;
  }

  const file = main.querySelector<HTMLInputElement>('#pdf')!;
  const drop = main.querySelector<HTMLElement>('#drop2')!;
  const take = (f?: File) => {
    if (!f) return;
    if (!(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) { out.innerHTML = `<div class="pf-err" role="alert"><p>${t('worlds.beta.notpdf', 'That file isn’t a PDF. Upload a PDF or paste the text.')}</p></div>`; return; }
    if (f.size > MAX) { out.innerHTML = `<div class="pf-err" role="alert"><p>${t('worlds.beta.big', 'That PDF is over 10 MB.')}</p></div>`; return; }
    run(api.uploadPdf(f));
  };
  file.addEventListener('change', () => take(file.files?.[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); take((e as DragEvent).dataTransfer?.files?.[0]); });
  main.querySelector<HTMLFormElement>('#paste2')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    run(api.uploadText(String(fd.get('title')).trim(), String(fd.get('text')).trim()));
  });
  return () => { alive = false; };
}
