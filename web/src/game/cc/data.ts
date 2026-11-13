/** Curiosity Craft: bundled world fact sheets + local fallbacks (the game works with no server). */
import type { AskRequest, AskResponse, CuriosityWorld, Lang, WonderResponse, WorldTag } from '../../shared/curiosity';
import { LANGS } from '../../shared/curiosity';

// ------------------------------------------------------------------ i18n (uses web/src/i18n when present)
type I18nMod = { t?: (key: string, fallback?: string, vars?: Record<string, string | number>) => string; setLang?: (l: Lang) => void | Promise<void> };
const mods = import.meta.glob('../../i18n/index.ts', { eager: true }) as Record<string, I18nMod>;
const i18n: I18nMod | undefined = Object.values(mods)[0];

export function pickLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && (LANGS as string[]).includes(q)) return q as Lang;
  try { const s = localStorage.getItem('cc-lang'); if (s && (LANGS as string[]).includes(s)) return s as Lang; } catch { /* */ }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return (LANGS as string[]).includes(nav) ? (nav as Lang) : 'en';
}
export let LANG: Lang = pickLang();
export async function setLang(l: Lang) { LANG = l; try { localStorage.setItem('cc-lang', l); } catch { /* */ } try { await i18n?.setLang?.(l); } catch { /* */ } }
export function t(key: string, fallback: string, vars?: Record<string, string | number>): string {
  let s = fallback;
  try { const r = i18n?.t?.(key, fallback, vars); if (r && r !== key) s = r; } catch { /* */ }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}
export const LANG_NAMES: Record<Lang, string> = { en: 'English', es: 'Español', zh: '中文', fr: 'Français', pt: 'Português', nl: 'Nederlands', hi: 'हिन्दी', ta: 'தமிழ்' };

// ------------------------------------------------------------------ the beach fact sheet (Sam only answers from this)
interface Fact { id: string; text: string; conceptIds: string[]; hook: string; next?: string; challenge?: string; keys: string[] }

const BEACH_FACTS: Fact[] = [
  { id: 'f-wind', text: 'Waves are made by wind blowing over the sea. The wind pushes the water into bumps that roll along.', conceptIds: ['waves-wind'], hook: 'But why does the wind blow toward the beach?', next: 'f-sun', keys: ['wave', 'waves', 'wind', 'ocean', 'sea', 'make', 'come', 'from'] },
  { id: 'f-sun', text: 'The sun warms the sand faster than the sea. Warm air over the land rises, and cooler sea air rushes in. That is the sea breeze!', conceptIds: ['sun-wind'], hook: 'Why does warm air go up?', next: 'f-warm', keys: ['sun', 'hot', 'warm', 'breeze', 'heat'] },
  { id: 'f-warm', text: 'Warm air is lighter for its size than cool air, so cool air sinks under it and pushes it up, like a bubble in a bath.', conceptIds: ['density', 'sun-wind'], hook: 'Hey, is that why some things float? Why?', next: 'f-float', keys: ['air', 'rise', 'up', 'balloon'] },
  { id: 'f-big', text: 'The stronger the wind and the longer it blows across the sea, the bigger the waves grow.', conceptIds: ['waves-wind'], hook: 'Why do waves fall over when they reach the beach?', next: 'f-break', keys: ['big', 'bigger', 'huge', 'tall', 'giant', 'storm'] },
  { id: 'f-break', text: 'Near the beach the water gets shallow. The bottom of the wave drags on the sand and slows down, but the top keeps going, so it tips over and breaks!', conceptIds: ['wave-breaking'], hook: 'And why is the beach made of sand at all?', next: 'f-sand', keys: ['break', 'crash', 'curl', 'fall', 'shore', 'tube', 'barrel'] },
  { id: 'f-sand', text: 'Sand is tiny bits of rock and shells. Waves smash and rub them together for thousands of years until they are super small.', conceptIds: ['erosion'], hook: 'Why are some rocks so heavy for their size?', next: 'f-stone', keys: ['sand', 'beach', 'rock', 'shell', 'grain'] },
  { id: 'f-float', text: 'Things float when they are lighter for their size than water. Scientists call that being less dense.', conceptIds: ['density'], hook: 'So why does a surfboard float so well?', next: 'f-foam', challenge: 'surfboard-lab', keys: ['float', 'floats', 'sink', 'sinks', 'boat', 'heavy', 'light'] },
  { id: 'f-foam', text: 'Surfboards are made of foam, which is full of tiny air bubbles. That makes the board very light for its size, so it floats high.', conceptIds: ['density', 'materials'], hook: 'But what is actually pushing the board up? Why?', next: 'f-buoy', challenge: 'surfboard-lab', keys: ['surfboard', 'board', 'surf', 'foam', 'made'] },
  { id: 'f-buoy', text: 'Water pushes up on anything in it. That push is called buoyancy. The more water a thing pushes aside, the harder the water pushes back up.', conceptIds: ['buoyancy'], hook: 'Then why do long boards feel steadier than short ones?', next: 'f-long', challenge: 'surfboard-lab', keys: ['push', 'buoyancy', 'up', 'hold'] },
  { id: 'f-long', text: 'A long board spreads your weight over more water and pushes more water aside, so it gets more buoyancy and wobbles less.', conceptIds: ['buoyancy', 'materials'], hook: 'Want to test it? Why not build one and see what floats!', challenge: 'surfboard-lab', keys: ['long', 'short', 'shape', 'steady', 'wobble', 'balance', 'stand'] },
  { id: 'f-stone', text: 'Stone is about 2.6 times denser than water, so a stone board would sink like, well, a rock! Bloop!', conceptIds: ['density', 'materials'], hook: 'So what material would you pick to float? Why?', next: 'f-float', challenge: 'surfboard-lab', keys: ['stone', 'rock', 'metal', 'iron'] },
  { id: 'f-salt', text: 'Sea water has salt in it, which makes it denser than fresh water. Things float a tiny bit higher in the sea than in a lake.', conceptIds: ['density'], hook: 'Why do fish not float up to the top then?', next: 'f-fish', keys: ['salt', 'salty', 'lake', 'river', 'pool'] },
  { id: 'f-fish', text: 'Many fish have a swim bladder, a little bag of air inside. They change how much air is in it to float higher or lower.', conceptIds: ['buoyancy'], hook: 'Why does more air make you float higher?', next: 'f-float', keys: ['fish', 'swim', 'shark', 'whale', 'deep', 'dolphin'] },
];

export const BEACH: CuriosityWorld = {
  id: 'beach',
  name: 'Sunny Surf Beach',
  npc: { id: 'sam', name: 'Surfer Sam', persona: 'Laid-back surfer who loves science, says "dude" and "gnarly".', voice: 'aura-2-arcas-en', greeting: 'Hey dude! Welcome to Sunny Surf Beach. Ask me anything about the waves!' },
  facts: BEACH_FACTS.map(({ id, text, conceptIds }) => ({ id, text, conceptIds })),
  concepts: [
    { id: 'waves-wind', name: 'Wind makes waves', plain: 'Wind blowing over water pushes it into waves.' },
    { id: 'sun-wind', name: 'The sun makes wind', plain: 'Land warms faster than sea; warm air rises and sea air rushes in.' },
    { id: 'wave-breaking', name: 'Why waves break', plain: 'In shallow water the bottom of a wave slows, the top tips over.' },
    { id: 'density', name: 'Density', plain: 'How heavy something is for its size. Less dense than water floats.' },
    { id: 'buoyancy', name: 'Buoyancy', plain: 'Water pushes up on things; more water pushed aside, more push.' },
    { id: 'materials', name: 'Materials', plain: 'Foam, wood and stone have different densities.' },
    { id: 'erosion', name: 'Erosion', plain: 'Waves grind rock and shells into sand over a long time.' },
  ],
  starters: [
    { id: 'wave', label: 'Wave', icon: '🌊', questions: ['Where do waves come from?', 'Why do waves crash on the beach?', 'What makes some waves so big?'] },
    { id: 'surfboard', label: 'Surfboard', icon: '🏄', questions: ['Why does a surfboard float?', 'What are surfboards made of?', 'Why are long boards steadier?'] },
    { id: 'sun', label: 'Sun', icon: '☀️', questions: ['Why is the sand hotter than the sea?', 'How does the sun make wind?', 'Why does warm air rise?'] },
    { id: 'fish', label: 'Fish', icon: '🐟', questions: ['How do fish float in the water?', 'Why is the sea salty?', 'Why don’t fish sink?'] },
    { id: 'sand', label: 'Sand', icon: '🏖️', questions: ['What is sand made of?', 'How do waves make sand?', 'Why are rocks so heavy?'] },
    { id: 'wind', label: 'Wind', icon: '💨', questions: ['How does wind make waves?', 'Why does the wind blow to the beach?', 'Why do storms make big waves?'] },
  ],
  recall: { prompt: 'Why does a foam surfboard float?', choices: ['Foam is lighter for its size than water', 'Surfboards are flat', 'The board is yellow', 'Surfers are magic'], answerIndex: 0, conceptId: 'density' },
  challenges: ['surfboard-lab', 'wave-maker'],
  tryAtHome: 'Float a cork, a coin, an apple and a lump of play dough in a bowl of water. Guess first, then test! Can you make the play dough float by changing its shape?',
  realWorld: { book: '“Who Sank the Boat?” by Pamela Allen', job: 'Oceanographer: a scientist who studies waves and the sea', person: 'Duke Kahanamoku, the Hawaiian who shared surfing with the world' },
};

export const WORLDS: Partial<Record<WorldTag, CuriosityWorld>> = { beach: BEACH };
export function factFor(id: string) { return BEACH_FACTS.find((f) => f.id === id); }

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9À-￿ ]/g, ' ').split(/\s+/).filter(Boolean);

// ------------------------------------------------------------------ local Wonder Board
export function localWonder(text: string | undefined, hadDrawing: boolean, world: CuriosityWorld): WonderResponse {
  const w = words(text ?? '');
  let best = world.starters[0], score = 0;
  for (const s of world.starters) {
    const keys = [s.id, s.label.toLowerCase(), ...s.questions.flatMap(words)];
    const sc = w.filter((x) => keys.includes(x) || keys.includes(x.replace(/s$/, ''))).length + (w.includes(s.id) ? 3 : 0);
    if (sc > score) { score = sc; best = s; }
  }
  const confident = score >= 1;
  const guesses = confident ? [best.label, ...world.starters.filter((s) => s !== best).slice(0, 2).map((s) => s.label)] : ['Wave', 'Surfboard', 'Sun'];
  return { guess: confident ? best.label : hadDrawing ? 'Wave' : 'Wave', confidence: confident ? 0.8 : 0.3, guesses, questions: best.questions.slice(0, 3), worldTag: world.id, source: 'local' };
}
export function questionsForGuess(guess: string, world: CuriosityWorld): string[] {
  const s = world.starters.find((x) => x.label.toLowerCase() === guess.toLowerCase() || x.id === guess.toLowerCase());
  return (s ?? world.starters[0]).questions.slice(0, 3);
}

// ------------------------------------------------------------------ local Why Ladder (fact-sheet only)
export function localAsk(req: AskRequest, lastFactId: string | null): AskResponse & { factId: string } {
  const q = words(req.question);
  const isWhy = q.length <= 3 && (q.includes('why') || q.includes('porque') || q.includes('pourquoi') || q.includes('waarom') || q.includes('por') || q.includes('为什么'));
  let fact: Fact | undefined;
  if (isWhy && lastFactId) fact = factFor(factFor(lastFactId)?.next ?? '') ?? undefined;
  if (!fact) {
    let best: Fact | undefined, bs = 0;
    for (const f of BEACH_FACTS) {
      if (f.id === lastFactId) continue;
      const s = q.filter((x) => f.keys.includes(x) || f.keys.includes(x.replace(/s$/, ''))).length;
      if (s > bs) { bs = s; best = f; }
    }
    fact = best;
  }
  if (!fact) return { answer: "Whoa, I'm not sure about that one, dude! Let's test it and find out.", whyHook: 'Want to see what floats and what sinks? Why do you think?', conceptIds: [], grounded: false, suggestChallenge: 'surfboard-lab', source: 'local', factId: lastFactId ?? '' };
  return { answer: fact.text, whyHook: fact.hook, conceptIds: fact.conceptIds, grounded: true, suggestChallenge: fact.challenge, source: 'local', factId: fact.id };
}

// ------------------------------------------------------------------ wonder sparkles (curiosity Easter eggs)
export const EGGS: Record<string, { icon: string; label: string; wonder: string }> = {
  'under-pier': { icon: '🪵', label: 'Under the pier', wonder: 'I wonder why the pier posts don’t float away?' },
  'tide-pool': { icon: '⭐', label: 'Tide pool', wonder: 'I wonder why water stays in the tide pool?' },
  'behind-tower': { icon: '🚩', label: 'Lifeguard flags', wonder: 'I wonder why the flags flap toward the beach?' },
  bottle: { icon: '🍾', label: 'Message in a bottle', wonder: 'I wonder why a bottle floats but a rock sinks?' },
  'giant-shell': { icon: '🐚', label: 'Giant shell', wonder: 'I wonder why sand is made of tiny shells and rocks?' },
  crab: { icon: '🦀', label: 'Waving crab', wonder: 'I wonder why waves crash when they reach the beach?' },
  sandcastle: { icon: '🏰', label: 'Sandcastle', wonder: 'I wonder why wet sand sticks but dry sand falls?' },
  treasure: { icon: '🧭', label: 'Buried treasure', wonder: 'I wonder why heavy treasure sinks to the sea floor?' },
  'dolphin-spot': { icon: '🐬', label: 'Dolphin spot', wonder: 'I wonder how fish float without sinking?' },
  kite: { icon: '🪁', label: 'Kite in the wind', wonder: 'I wonder why the wind blows toward the beach?' },
  sunscreen: { icon: '🧴', label: 'Sunscreen', wonder: 'I wonder why the sand gets hotter than the sea?' },
  sun: { icon: '☀️', label: 'Sun spot', wonder: 'I wonder how the sun makes wind?' },
};
