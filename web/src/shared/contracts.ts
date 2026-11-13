/**
 * CURIOSITYCRAFT shared contracts — the ONE source of truth between
 *   server (FastAPI/Pydantic mirror in server/app/schemas.py),
 *   website (web/src/site), game runtime (web/src/game) and voice (web/src/voice).
 *
 * Rules:
 *  - AI produces only these declarative objects. It never produces code, maps or collision.
 *  - The game runtime owns all state (quest progress, unlocks, rewards). Models only
 *    return *verdicts/intents*; the runtime decides what happens.
 *  - Field names are camelCase on the wire (Pydantic uses alias_generator=to_camel).
 */

// ------------------------------------------------------------------ lesson
export type TemplateId = 'forest' | 'space' | 'math' | 'egypt' | 'ocean' | 'lab';
export const TEMPLATE_IDS: TemplateId[] = ['forest', 'space', 'math', 'egypt', 'ocean', 'lab'];
export type AgeBand = '7-9' | '10-12';

export interface Section { id: string; heading: string; text: string; page?: number }

export interface Material {
  materialId: string;
  title: string;
  kind: 'pdf' | 'text' | 'sample';
  chars: number;
  pages: number;
  sections: Section[];
}

export interface Evidence { sectionId: string; quote: string }

export interface Objective {
  id: string;                  // "obj-1"
  text: string;                // child-readable: "Name the three things a plant needs to make food"
  conceptIds: string[];
  evidence: Evidence[];        // >= 1, quote must be a substring of the section text
  rubric: { criteria: string[]; passingRule: string };
}

export interface Concept { id: string; name: string; description: string; prerequisites: string[] }

export interface LessonSpec {
  schemaVersion: '1';
  lessonId: string;
  title: string;
  summary: string;
  ageBand: AgeBand;
  sourceId: string;            // materialId
  sections: Section[];
  concepts: Concept[];
  objectives: Objective[];     // 3 (2..5 allowed)
  suggestedTemplate: TemplateId;
}

// ------------------------------------------------------------------ world
/** A question the runtime grades deterministically (choice) or via the referee (spoken). */
export interface Question {
  id: string;
  prompt: string;
  choices: string[];           // 2..4
  answerIndex: number;
  accept: string[];            // words/phrases accepted when spoken/typed
  explain: string;             // shown after answering
  hints: string[];             // progressive: [location/cue, conceptual nudge, partial worked example]
}

/** A place in the world. The engine assembles it from the template's component kit. */
export interface Zone {
  id: string;                  // "hub", "z-sun", "goal"
  name: string;                // "Sunlight Tower"
  kind: 'hub' | 'landmark' | 'goal' | 'wild';
  /** Kit key for the centrepiece, e.g. 'tower' | 'well' | 'tree' | 'shrine' | 'console' | 'gate' | 'statue'. Unknown keys fall back to 'shrine'. */
  landmark: string;
  objectiveId?: string;
  description: string;         // flavour text when inspected
}

export interface NpcSpec {
  id: string;
  name: string;                // "Sunny"
  title: string;               // "the Sunflower"
  /** Kit key for the body: 'sunflower'|'water-spirit'|'tree'|'astronaut'|'robot'|'alien'|'wizard'|'knight'|'merchant'|'scribe'|'builder'|'explorer'|'turtle'|'fish'|'coral'|'scientist'|'kid'. Unknown → 'kid'. */
  archetype: string;
  persona: string;             // personality + speaking style, for the LLM
  voice: string;               // Deepgram Aura-2 model, e.g. "aura-2-thalia-en"
  zoneId: string;
  objectiveId: string;
  greeting: string;            // first line
  teach: string[];             // 2-3 short lines, grounded in the lesson
  knowledge: string[];         // lesson snippets this NPC may use (grounding for the LLM)
  check: Question;             // the NPC's spoken check question
}

export interface PuzzleSpec {
  id: string;
  objectiveId: string;
  zoneId: string;
  kind: 'sequence' | 'match' | 'choice';
  title: string;
  prompt: string;
  items?: string[];            // sequence: CORRECT order (3..6)
  pairs?: { left: string; right: string }[]; // match: 3..5
  questions?: Question[];      // choice: 1..4
  hints: string[];
  success: string;
  evidenceSectionIds: string[];
}

/**
 * LEARNING FIRST. CuriosityCraft is a study tool wearing a game, not a game with quiz popups.
 * Every objective runs the same mastery loop inside the world:
 *   STUDY (read a short, faithful, kid-level study card at the place)  ->
 *   CHECK (1-2 quick questions on what was just read)                  ->
 *   EXPLAIN (tell the NPC in your own words � graded against the objective rubric, Feynman style) ->
 *   PRACTICE (puzzle)  ->  RECALL later at the memory landmark (spaced retrieval).
 * Side quests add optional extra practice; review questions resurface earlier objectives while exploring.
 */
export interface StudyCard {
  id: string;                  // "study-1a"
  objectiveId: string;
  zoneId: string;
  title: string;               // "What a leaf needs"
  body: string[];              // 2-4 short paragraphs, kid-level, FAITHFUL to the source (no invented facts)
  keyTerms: { term: string; meaning: string }[];
  example?: string;            // concrete everyday example / worked example
  figure?: string;             // optional kit key for a little diagram: 'cycle'|'arrow-in-out'|'ordered-list'|'compare'|'none'
  sourceSectionIds: string[];  // provenance; shown as "From your lesson: section s2"
  checks: Question[];          // 1-2 quick comprehension checks right after reading
}

export interface SideQuest {
  id: string;
  title: string;               // "Oakley's Riddle"
  giverNpcId: string;
  zoneId: string;
  objectiveId: string;
  kind: 'explain' | 'quiz' | 'find';   // explain = say it in your own words; quiz = extra questions; find = go find a place/item then answer
  prompt: string;
  questions?: Question[];      // quiz / find
  targetId?: string;           // find: zone or collectible id
  rubric?: string[];           // explain: what a good answer mentions
  reward: string;              // flavour: "a Golden Leaf sticker"
}

export interface GlossaryEntry { term: string; meaning: string; sectionId: string }

export type QuestStepKind = 'study' | 'talk' | 'explain' | 'visit' | 'collect' | 'puzzle' | 'recall';
/** study: targetId = StudyCard.id (read + pass its checks). explain: targetId = NpcSpec.id (explain the NPC's objective in own words, graded by rubric). */
export interface QuestStep { id: string; kind: QuestStepKind; targetId: string; text: string; count?: number }

export interface Quest {
  id: string;
  title: string;
  objectiveId: string;
  prerequisiteIds: string[];
  steps: QuestStep[];
  rewardEffectId: string;
}

export interface RecallSpec {
  zoneId: string;
  objectiveId: string;
  question: Question;          // prompt is asked at the place; answer must be recalled
}

export interface RewardEffect {
  id: string;
  kind: 'bloom' | 'power' | 'bridge' | 'light' | 'restore';
  zoneId: string;
  text: string;                // "The Sunlight Tower blazes back to life!"
}

export interface Collectible { id: string; name: string; zoneId: string; count: number; icon: string }

export interface WorldSpec {
  schemaVersion: '1';
  worldId: string;
  lessonId: string;
  templateId: TemplateId;
  title: string;               // "The Fading Bloom"
  subject: string;             // "Photosynthesis"
  seed: number;
  story: { intro: string[]; goal: string; finale: string };
  companion: { name: string; greeting: string };   // the world's helper sprite (Sprout, Beep...)
  zones: Zone[];               // 1 hub + 3 landmarks + 1 goal (+ optional wild)
  npcs: NpcSpec[];             // 3
  collectibles: Collectible[];
  puzzles: PuzzleSpec[];       // >= 2
  quests: Quest[];             // ordered; last quest ends with a recall step targeting memory
  memoryLandmarks: RecallSpec[]; // 3, one per landmark zone
  rewardEffects: RewardEffect[];
  study: StudyCard[];          // >= 1 per objective (usually 2), placed in that objective's landmark zone
  sideQuests: SideQuest[];     // 2-4 optional
  glossary: GlossaryEntry[];   // all key terms; the in-game "Study Book"
  reviewQuestions: Question[]; // spaced retrieval: resurfaced while exploring, mixing earlier objectives
  source: 'llm' | 'heuristic' | 'sample';
}

export interface GenerateWorldResponse { world: WorldSpec; diagnostics: string[]; repaired: boolean; fallback: boolean }
export interface GenerateLessonResponse { lesson: LessonSpec; source: 'llm' | 'heuristic' | 'sample'; diagnostics: string[] }

// ------------------------------------------------------------------ referee / dialogue
export type Intent = 'answer' | 'doubt' | 'chat' | 'skip' | 'off_topic';
export interface Verdict {
  intent: Intent;
  correct: boolean;
  power: number;               // 0..1 confidence/completeness
  feedback: string;
  source: 'jev' | 'llm' | 'local';
}

export interface GoatClue { question: string; text: string; source: string; url?: string }

/** Text-mode NPC turn (also what the realtime voice loop produces per utterance). */
export interface NpcReplyRequest {
  worldId: string;
  npcId: string;
  sessionId?: string;
  utterance: string;
  history: { role: 'child' | 'npc'; text: string }[];
  /** Question currently on the table (npc.check.id, study check id, puzzle question id, recall or review question id). */
  questionId?: string;
  /** chat = free talk/tutoring (Socratic: guide, don't just tell); explain = child is explaining objectiveId in own words; answer = answering questionId. */
  mode?: 'chat' | 'explain' | 'answer';
  objectiveId?: string;        // for explain mode
}
export interface NpcReplyResponse {
  reply: string;               // <= 2 short sentences, kid-safe
  verdict?: Verdict;           // present when questionId was set and intent === 'answer'
  goat?: GoatClue;             // present when the child asked a doubt the lesson can't answer
  /** explain mode: which rubric criteria the explanation covered, and what to add. */
  explain?: { covered: string[]; missing: string[]; passed: boolean };
  source: 'llm' | 'local';
}

export interface ServerConfig {
  llm: boolean; stt: boolean; tts: boolean; exa: boolean; referee: boolean;
  model: string;
}

// ------------------------------------------------------------------ telemetry
export type EventType =
  | 'session_start' | 'npc_talk' | 'utterance' | 'question_answer' | 'puzzle_attempt'
  | 'hint' | 'collect' | 'visit' | 'quest_complete' | 'recall_attempt' | 'goat' | 'world_complete'
  | 'study_open' | 'study_check' | 'explain_attempt' | 'review_attempt' | 'side_quest_complete';

export interface SessionEvent {
  eventType: EventType;
  sessionId: string;
  worldId: string;
  objectiveId?: string;
  puzzleId?: string;
  questionId?: string;
  attempt?: number;
  result?: 'correct' | 'incorrect' | 'skipped';
  hintsUsed?: number;
  detail?: string;
  timestamp: string;           // ISO
}

export interface ObjectiveResult {
  objectiveId: string;
  text: string;
  demonstrated: boolean;
  attempts: number;
  correct: number;
  hintsUsed: number;
  recalled: boolean | null;    // null = not yet reached the memory finale
  studied: boolean;            // opened its study cards
  explained: boolean | null;   // passed an explain-in-your-own-words attempt (null = not attempted)
}
export interface SessionResults {
  sessionId: string;
  worldId: string;
  lessonTitle: string;
  startedAt: string;
  completed: boolean;
  objectives: ObjectiveResult[];
  events: number;
  suggestedReview: string[];
}

// ------------------------------------------------------------------ realtime voice (client API, implemented in web/src/voice)
export type VoiceMode = 'realtime' | 'browser' | 'text';
export interface VoiceContext {
  worldId: string;
  npcId: string;               // or 'companion' / 'goat'
  sessionId?: string;
  questionId?: string;         // question currently asked by the NPC, if any
  mode?: 'chat' | 'explain' | 'answer';
  objectiveId?: string;
}
export interface VoiceEvents {
  state: (s: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error') => void;
  interim: (text: string) => void;        // live transcript while the child talks (Wispr-Flow style)
  final: (text: string) => void;          // the utterance that was sent for a turn
  reply: (r: NpcReplyResponse) => void;   // NPC answered (text + optional verdict/goat)
  level: (rms: number) => void;           // mic level 0..1 for the waveform
  error: (msg: string) => void;
}
