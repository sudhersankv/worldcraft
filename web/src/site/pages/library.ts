import { api } from '../../shared/api';
import { I } from '../art';
import { $$, esc, friendly, hydrateThumbs, playUrl, thumb, tilt, worldMeta } from '../ui';

const SRC: Record<string, string> = { llm: 'Made with AI', heuristic: 'Built offline', sample: 'Sample' };

export function renderLibrary(main: HTMLElement) {
  main.className = 'library';
  let alive = true;
  main.innerHTML = `
    <div class="page-head">
      <h1 class="display h-lg">Worlds</h1>
      <p class="muted">Every world built on this server. Play one, or open it in the Lesson Lab to check what kids will study.</p>
    </div>
    <div class="lib-grid" id="lib" aria-busy="true"><p class="muted">Looking for worlds…</p></div>`;
  const box = main.querySelector<HTMLElement>('#lib')!;
  api.worlds().then((ws) => {
    if (!alive) return;
    box.removeAttribute('aria-busy');
    if (!ws.length) {
      box.innerHTML = `<div class="empty"><p>No worlds yet. Build the first one from a lesson.</p><a class="btn btn-sun" href="#lab">${I.upload}<span>Make a world from a lesson</span></a></div>`;
      return;
    }
    box.innerHTML = ws.map((w) => {
      const m = worldMeta(w.templateId);
      return `<article class="lib-card" style="--accent:${m.accent}">
        <div class="lib-art">${thumb(w.templateId)}</div>
        <div class="lib-body">
          <p class="badges"><span class="badge plain">${esc(m.name)}</span><span class="badge src-${esc(w.source)}">${esc(SRC[w.source] ?? w.source)}</span></p>
          <h2 class="h-sm">${esc(w.title)}</h2>
          <p class="muted">${esc(w.subject)}</p>
          <div class="row-gap">
            <a class="btn btn-sun btn-sm" href="${esc(playUrl(w.worldId))}">${I.play}<span>Play</span></a>
            <a class="btn btn-paper btn-sm" href="#lab/${encodeURIComponent(w.worldId)}">${I.eye}<span>Review</span></a>
          </div>
        </div>
      </article>`;
    }).join('');
    $$('.lib-card', box).forEach((c) => tilt(c, 4));
    hydrateThumbs(box);
  }, (e) => {
    if (!alive) return;
    box.removeAttribute('aria-busy');
    box.innerHTML = `<div class="err" role="alert"><p>Couldn't load the worlds. ${esc(friendly(e))}</p><a class="btn btn-paper btn-sm" href="/play.html?world=forest-photosynthesis">${I.play}<span>Play the demo</span></a></div>`;
  });
  return () => { alive = false; };
}
