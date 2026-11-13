/** CuriosityCraft game entry: load WorldSpec -> validate -> assemble 3D diorama -> title screen -> play. */
import type { TemplateId, WorldSpec } from '../shared/contracts';
import { TEMPLATE_IDS } from '../shared/contracts';
import { api } from '../shared/api';
import fallback from './fallback/demo-world.json';
import { validateWorld } from './core/validate';
import { GameState } from './core/state';
import { Telemetry } from './core/telemetry';
import { Input } from './core/input';
import { Audio } from './core/audio';
import { kitFor } from './world/kits';
import { Director } from './director';
import { World3D } from './scene/World3D';
import { h } from './ui/ui';

const params = new URLSearchParams(location.search);

async function loadWorld(): Promise<{ world: WorldSpec; offline: boolean }> {
  const id = params.get('world');
  if (id) {
    try { return { world: validateWorld(await api.world(id)), offline: false }; }
    catch (e) { console.warn('[curiositycraft] world load failed, using bundled demo', e); }
  }
  return { world: validateWorld(structuredClone(fallback)), offline: !id };
}

interface Save { facts: string[]; counts: [string, number][]; completed: string[]; discovered: string[]; found: string[]; side: string[] }

async function boot() {
  const loading = document.getElementById('loading');
  const { world } = await loadWorld();
  const tpl = params.get('template');
  if (tpl && (TEMPLATE_IDS as string[]).includes(tpl)) world.templateId = tpl as TemplateId;
  const kit = kitFor(world.templateId);
  document.title = `${world.title} · CuriosityCraft`;
  document.documentElement.style.setProperty('--w-accent', `var(--w-${kit.id})`);

  const state = new GameState(world);
  const tele = new Telemetry(world.worldId);
  void tele.start();
  const input = new Input();
  const director = new Director(world, kit, state, tele, input);
  const scene = new World3D(document.getElementById('game')!, world, kit, state, input, director);
  director.attach(scene);
  scene.setSaturation(kit.startSaturation, false);
  scene.titleMode = true;
  scene.start();
  loading?.classList.add('gone'); setTimeout(() => loading?.remove(), 600);

  // ---- save / continue
  const key = `cc-save-${world.worldId}-${world.templateId}`;
  let saved: Save | null = null;
  try { saved = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { saved = null; }
  if (params.has('fresh')) saved = null;
  let saveT = 0;
  state.on(() => {
    clearTimeout(saveT);
    saveT = window.setTimeout(() => {
      const s: Save = { facts: [...state.facts], counts: [...state.counts], completed: state.completedQuests, discovered: [...state.discovered], found: [...state.found], side: [...state.sideDone] };
      try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* */ }
    }, 400);
  });
  const restore = (s: Save) => {
    s.facts.forEach((f) => state.facts.add(f)); s.counts.forEach(([k, v]) => state.counts.set(k, v));
    state.completedQuests.push(...s.completed); s.discovered.forEach((d) => state.discovered.add(d)); s.side.forEach((d) => state.sideDone.add(d));
    for (const f of s.found) {
      const c = scene.collectibles.findIndex((x) => x.inst === f); if (c >= 0) { scene.scene.remove(scene.collectibles[c].obj); scene.collectibles.splice(c, 1); }
      if (scene.discoveries.some((d) => d.id === f)) scene.removeDiscovery(f);
      state.found.add(f);
    }
    const nonFinale = world.quests.filter((q) => !state.isFinale(q));
    const done = nonFinale.filter((q) => state.questDone(q)).length;
    scene.setSaturation(state.finished ? 0.12 : kit.startSaturation * (1 - done / Math.max(1, nonFinale.length)), false);
    state.evaluate();
  };

  // ---- title screen (live world behind the logo)
  const ui = director.ui;
  const title = h('div', { class: 'title' });
  const startGame = async (cont: boolean) => {
    Audio.init(); Audio.setVolumes(director.volume * 0.7, director.volume); Audio.play('confirm');
    ui.close(shellT);
    scene.titleMode = false;
    if (cont && saved) { restore(saved); Audio.playMusic(kit.music, world.seed); director.companionSay(`Welcome back! Let's keep going.`); }
    else { await director.intro(); director.companionSay(world.companion.greeting); }
    director.refresh();
  };
  title.append(
    h('div', { class: 'logo' }, h('span', {}, 'Curiosity'), h('b', {}, 'Craft')),
    h('div', { class: 'subtitle' }, `${world.title} · ${world.subject}`),
    h('div', { class: 'menu' },
      h('button', { class: 'mbtn', 'data-default': '1', onclick: () => void startGame(false) }, saved ? 'New adventure' : 'Start'),
      saved ? h('button', { class: 'mbtn', onclick: () => void startGame(true) }, 'Continue') : '',
      h('button', { class: 'mbtn', onclick: () => director.openBook() }, 'Study Book'),
      h('button', { class: 'mbtn', onclick: () => director.openPause() }, 'Settings')),
    h('div', { class: 'press' }, 'Keyboard, mouse, touch or gamepad'),
  );
  const shellT = ui.open(title, { veil: false });

  (window as unknown as Record<string, unknown>).__WC = {
    world, state, scene, director, tele,
    step: () => state.currentStep()?.step ?? null,
    tile: () => ({ x: Math.floor(scene.player.gx), y: Math.floor(scene.player.gy) }),
    teleport: (x: number, y: number) => scene.teleport(x + 0.5, y + 0.5),
    zone: (id: string) => scene.zoneCenter(id),
    start: () => startGame(false),
  };
}

boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.innerHTML = `Oops, the world could not load.<small>${String(e?.message ?? e)}</small>`;
});
