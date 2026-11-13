/**
 * CURIOSITYCRAFT shared contracts â€” the ONE source of truth between
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

/**
 * CONVERSATION-FIRST TEACHING. Characters teach by talking, not by quizzes.
 * A lesson plan is a list of beats. For each beat the NPC SAYS something (spoken aloud, short, vivid, grounded),
 * then usually ASKS an open question. The child answers OUT LOUD in their own words; the server grades the
 * descriptive answer against the beat rubric (generously, on meaning) and the NPC responds conversationally:
 * praise the right part, then nudge/explain what's missing, then move on. The child may interrupt with their
 * own questions at any time (mode 'chat'). Multiple-choice options appear ONLY as a fallback after two misses.
 */
export interface TeachBeat {
  id: string;                  // "sunny-b1"
  objectiveId: string;
  say: string;                 // 1-3 short spoken sentences that TEACH (concrete, sensory, kid-level, faithful)
  ask?: string;                // an open question ("Why do you think…", "Explain to me how…", "What would happen if…")
  rubric?: string[];           // 1-3 ideas a good answer mentions (graded on meaning)
  hint?: string;               // spoken nudge after a miss (never the full answer)
  explain?: string;            // what the NPC says to wrap up the beat (fills any gap, reinforces)
  fallback?: Question;         // multiple-choice rescue after 2 misses
  show?: string;               // optional visual cue in the world: zone/object id to highlight or an effect key ('stomata-zoom','xylem-flow','sun-rays','cloud-form','rain')
}

/** The one real goal of the world. Learn from characters, then go DO it. */
export interface MissionTask {
  id: string;
  title: string;               // "Wake the sleeping stomata"
  description: string;         // what to physically do in the world
  zoneId: string;
  objectiveIds: string[];      // what knowledge it applies
  action: 'arrange' | 'place' | 'activate' | 'explain'; // arrange = order things in the world; place = carry items to spots; activate = interact in correct order; explain = convince a character by explaining
  steps?: string[];            // arrange/activate: correct order (object/zone labels)
  pairs?: { item: string; spot: string }[]; // place: which item goes where
  rubric?: string[];           // explain: ideas the explanation must contain
  success: string;             // spoken/visible result ("Mist rises from the leaves…")
  hint: string;
}
export interface Mission {
  title: string;               // "Bring the Rain Back to Verdant Hollow"
  problem: string;             // the story problem shown at the start
  why: string;                 // why solving it needs the science
  tasks: MissionTask[];        // done after (or while) learning; the final task is usually 'explain' to the guardian
  finale: string;              // what happens when it's solved
}

export interface NpcSpec {
  id: string;
  name: string;                // "Sunny"
  title: string;               // "the Sunflower"
  /** Kit key for the body: 'sunflower'|'water-spirit'|'tree'|'astronaut'|'robot'|'alien'|'wizard'|'knight'|'merchant'|'scribe'|'builder'|'explorer'|'turtle'|'fish'|'coral'|'scientist'|'kid'. Unknown â†’ 'kid'. */
  archetype: string;
  persona: string;             // personality + speaking style, for the LLM
  voice: string;               // Deepgram Aura-2 model, e.g. "aura-2-thalia-en"
  zoneId: string;
  objectiveId: string;
  greeting: string;            // first line
  teach: string[];             // 2-3 short lines, grounded in the lesson
  knowledge: string[];         // lesson snippets this NPC may use (grounding for the LLM)
  check: Question;             // the NPC's spoken check question
  lessonPlan?: TeachBeat[];    // conversation-first teaching script (preferred over teach/check when present)
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
 *   EXPLAIN (tell the NPC in your own words — graded against the objective rubric, Feynman style) ->
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
  mission?: Mission;           // the one real goal of the world (demo world has it; generated worlds may)
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
  mode?: 'chat' | 'explain' | 'answer' | 'teach' | 'homework';
  objectiveId?: string;        // for explain mode
  beatId?: string;             // teach mode: the TeachBeat whose `ask` the child is answering
  taskId?: string;             // explain-type MissionTask being attempted
}
/**
 * HOMEWORK HELP (website, voice-first). npcId may be any character id from any world ("<worldId>:<npcId>" or a plain
 * npc id with worldId set), 'companion' or 'goat'. worldId may be '' for the general helper. The helper is Socratic:
 * it breaks the problem into steps, asks the child to try each step, checks their reasoning, and never just hands over
 * a full homework answer. It may use Exa kid-safe search for facts (returned in `goat`).
 */
export interface HomeworkCharacter { id: string; worldId: string; name: string; title: string; archetype: string; voice: string; persona: string; portrait?: string }

export interface NpcReplyResponse {
  reply: string;               // <= 2 short sentences, kid-safe
  verdict?: Verdict;           // present when questionId was set and intent === 'answer'
  goat?: GoatClue;             // present when the child asked a doubt the lesson can't answer
  /** explain mode: which rubric criteria the explanation covered, and what to add. */
  explain?: { covered: string[]; missing: string[]; passed: boolean };
  /** teach mode: grading of the descriptive answer to the beat question. */
  teach?: { beatId: string; covered: string[]; missing: string[]; passed: boolean };
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
  | 'study_open' | 'study_check' | 'explain_attempt' | 'review_attempt' | 'side_quest_complete'
  | 'teach_answer' | 'child_question' | 'mission_task';

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
  mode?: 'chat' | 'explain' | 'answer' | 'teach' | 'homework';
  objectiveId?: string;
  beatId?: string;
  taskId?: string;
}
export interface VoiceEvents {
  state: (s: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error') => void;
  interim: (text: string) => void;        // live transcript while the child talks (Wispr-Flow style)
  final: (text: string) => void;          // the utterance that was sent for a turn
  reply: (r: NpcReplyResponse) => void;   // NPC answered (text + optional verdict/goat)
  level: (rms: number) => void;           // mic level 0..1 for the waveform
  error: (msg: string) => void;
}
