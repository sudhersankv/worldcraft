/**
 * CURIOSITY CRAFT — contract for the 4 PM demo (see docs/CURIOSITY_CRAFT_BRIEF.md).
 * Loop: random spawn world (beach for the demo) → 30 s roam (?demo=1 skips) → Wonder Board (draw / say / type)
 *   → 3 questions + destination world → NPC (Surfer Sam) answers + "why?" hook → Why Ladder (2-3 levels)
 *   → Try-it challenge (Surfboard Lab float test) → Curiosity Journal → parent report.
 * Curiosity is the score: XP for asking why, never for being right. Failure is funny + a hint.
 * Safety: Sam answers ONLY from the world's fact sheet. The ENGINE (not the LLM) awards Why Ladder levels / XP.
 */
export type Lang = 'en' | 'es' | 'zh' | 'fr' | 'pt' | 'nl' | 'hi' | 'ta';
export const LANGS: Lang[] = ['en', 'es', 'zh', 'fr', 'pt', 'nl', 'hi', 'ta'];
export const SPEECH_LOCALE: Record<Lang, string> = {
  en: 'en-US', es: 'es-ES', zh: 'zh-CN', fr: 'fr-FR', pt: 'pt-BR', nl: 'nl-NL', hi: 'hi-IN', ta: 'ta-IN',
};

export type WorldTag = 'beach' | 'ice' | 'volcano' | 'jungle' | 'space' | 'forest' | 'ocean' | 'sky';

export interface Concept { id: string; name: string; plain: string }          // plain = parent-friendly one-liner

export interface CuriosityWorld {
  id: WorldTag;
  name: string;                               // "Sunny Surf Beach"
  npc: { id: string; name: string; persona: string; voice: string; greeting: string };
  facts: { id: string; text: string; conceptIds: string[] }[];   // the ONLY source Sam may answer from
  concepts: Concept[];
  starters: { id: string; label: string; icon: string; questions: string[] }[]; // Wonder Board fallback buttons (6)
  recall: { prompt: string; choices: string[]; answerIndex: number; conceptId: string }; // asked at start AND end
  challenges: string[];                       // e.g. ['surfboard-lab', 'wave-maker']
  tryAtHome: string;                          // "Float a cork, a coin and an apple in a bowl…"
  realWorld: { book: string; job: string; person: string };
}

// ---- Wonder Board
export interface WonderRequest { image?: string /* data:image/png;base64 */; text?: string; lang: Lang; worldId: WorldTag }
export interface WonderResponse {
  guess: string; confidence: number;         // 0..1
  guesses: string[];                          // 3 alternatives for "Is it a…?" when confidence < 0.5
  questions: string[];                        // 3 kid-friendly questions, ≤ 10 words
  worldTag: WorldTag;                         // destination biome on the island (beach / volcano / ice / jungle)
  npc?: string; area?: string;                // e.g. "Rocky the Lava Golem", "Ember Peak"
  source: 'llm' | 'local';
}

// ---- Why Ladder (one call per turn)
export interface AskRequest {
  worldId: WorldTag; lang: Lang; sessionId?: string;
  question: string;                           // what the kid asked (spoken / typed / chosen)
  level: number;                              // current why-level (0 = first question)
  history: { role: 'kid' | 'npc'; text: string }[];
}
export interface AskResponse {
  answer: string;                             // ≤ 2 sentences, from the fact sheet only
  whyHook: string;                            // always ends with a "why?" question that goes one level deeper
  conceptIds: string[];                       // concepts actually used (must exist in the fact sheet)
  grounded: boolean;                          // false → "I'm not sure, let's test it!"
  suggestChallenge?: string;                  // e.g. 'surfboard-lab'
  source: 'llm' | 'local';
}

// ---- Try-it challenges (pure client sim; results logged as events)
export type Material = 'stone' | 'wood' | 'foam' | 'fiberglass-foam';
export const DENSITY: Record<Material, number> = { stone: 2.6, wood: 0.6, foam: 0.05, 'fiberglass-foam': 0.15 }; // g/cm³, water = 1.0

// ---- Telemetry → report (numbers computed from events ONLY)
export type CCEventName =
  | 'session_start' | 'spawn' | 'roam_end' | 'wonder_submit' | 'wonder_guess' | 'question_pick'
  | 'question_asked' | 'why_level' | 'concept' | 'challenge_attempt' | 'recall_before' | 'recall_after'
  | 'journal_card' | 'report_view' | 'lang';
export interface CCEvent { sessionId: string; name: CCEventName; data: Record<string, unknown>; ts: string }

export interface CuriosityReport {
  sessionId: string; lang: Lang; worldId: WorldTag; startedAt: string; minutes: number;
  questionsAsked: number;
  deepestWhyLevel: number;
  concepts: Concept[];                        // touched, with plain-language explanation
  challengeAttempts: { challenge: string; choice: string; result: string }[];
  recall: { before: boolean | null; after: boolean | null; prompt: string };
  journal: { question: string; level: number; kidWords?: string }[];
  tryAtHome: string;
  realWorld: CuriosityWorld['realWorld'];
}
