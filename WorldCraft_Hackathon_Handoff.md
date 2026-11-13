# WORLDCRAFT — Hackathon Team Handoff
**Version:** November 13, 2026  
**Audience:** Onsite teammate + remote collaborator  
**Decision:** Build a multimodal *learning platform* whose student experience is a controller-playable 2.5D adventure. Do not build a generic quiz game or an unrestricted AI game generator.

> **One-line pitch:** Upload a lesson; WorldCraft turns it into an explorable 2.5D world where children learn by speaking to characters, solving grounded problems, and recalling ideas through memorable places.

## 0. The decision in 30 seconds

**Build WorldCraft, informed by Three Point Crown.** The supplied 88-page *Three Point Crown* serious-games design report is useful as an architectural and product-design reference, not as an implementation or an asset license. Its project turns teacher-uploaded exercises into contextual NPC quests, lets teachers edit generated material, measures progress, and changes the game environment based on learning. WorldCraft retains its own distinctive aspects: **arbitrary lesson-to-world transformation, six reusable themed world templates, gamepad-controlled 2.5D exploration, voice-driven NPCs and companion, and place-based recall.**

**Hackathon proof:** Upload one short photosynthesis PDF → see extracted objectives → generate a valid forest adventure → pick up a controller → talk to a sunflower by voice → solve a lesson-grounded puzzle → restore the world → demonstrate recall and view a parent/teacher report. Then upload a second, different lesson to prove data-driven generation, even if its world experience is shorter.

**Non-negotiable:** prioritize a complete working vertical slice over six feature-complete worlds. Six worlds can appear as visually polished *templates*; only one needs the complete generated lesson journey in the hackathon build.

## 1. Comparison with the supplied report

| Dimension | Three Point Crown (attached report) | WorldCraft original concept | Recommended merge |
|---|---|---|---|
| Entry point | Teacher uploads PDF exercises | Any lesson: PDF, textbook, slides, video, audio | Ship PDF now; architect pluggable media ingestion |
| Learning transformation | Existing exercises become real-life contextual quests | Concepts become locations, NPCs, narrative, puzzles | Create objectives + rubric first, then quests/world specification |
| World | Persistent city with subject districts | Lesson-specific forest/space/math/Egypt/ocean/lab worlds | Six reusable 2.5D templates; one runtime, dynamically populated |
| Interactions | Student approaches NPC and solves exercises | Voice NPCs, changing companion, exploration and puzzles | Push-to-talk NPC with text fallback; companion uses current quest context |
| Feedback | Correct answers improve district; teacher sees progress | Points and unlocks; memory palace | Visible environmental restoration AND grounded mastery evidence |
| Educator controls | Teacher previews/edits questions and story context | Teacher uploads learning material | Preview objectives, answer keys and generated quest before play |
| Technical approach | Unity/C# runtime, React/Next.js UI, AI pipeline, REST | Browser-first isometric game | Phaser + TypeScript/browser, Next.js, small FastAPI service; don't port to Unity for a one-day web demo |
| Risks | Inconsistent world state, excessive teacher work, AI accuracy | Hallucinations, broken generated quests, voice delays | Typed schema, deterministic state machine, validation, fallback demo |

### What the PDF contributes that we should explicitly use

1. **Teacher effort should be near-zero.** The report's interviews with 16 STEM teachers highlight the difficulty of linking abstract curriculum content to real-world contexts; 13 viewed story-based digital exercises as valuable. These are findings from that particular study, not proof of our target-market demand.
2. **Educator review:** AI-produced questions, answers and narrative should be previewable and editable rather than blindly published.
3. **World feedback:** Correct solutions can restore a bridge, repair a machine, bloom a flower or light a station. Prefer rewarding progress; **do not make wrong answers visibly destroy a child's world**, since it can discourage experimentation.
4. **Explicit state ownership:** NPC language models must never award points or unlock quests directly; authoritative state belongs to the game runtime/backend.
5. **Visible assessment:** Child progress should link every quest to a source-grounded learning objective. A pretty game alone is not a learning platform.
6. **Small demonstrable scope:** The report itself reduces its initial prototype to one district and a narrow set of teacher/student flows. Apply that discipline here.

### Where we intentionally differ

- Not a city-building simulation; a **2.5D isometric exploration RPG** with lesson-specific maps and landmarks.
- Not just contextualizing pre-authored questions; the platform parses lesson content and generates a **concept graph, objectives, explanations, NPC knowledge, quest sequence and assessed puzzles**.
- Not primarily high-school STEM: initial age band **7–12**, with adjustable reading level.
- Not a model-generated executable game: the **engine, mechanics and asset catalog are prebuilt**, and AI generates declarative, validated world data.
- The **memory-palace-inspired recall loop** is a product hypothesis to test, not a proven retention claim.

## 2. Experience and user stories

**Educator/parent:** Upload a short lesson PDF, see 3–5 extracted objectives and citations; choose an environment; generate; review or edit key facts/questions; launch; see results afterward.

**Child:** Pick a world, move via keyboard or connected controller, approach NPC, press a talk button and speak, view captions, receive a short response, complete an in-world action, earn a reward, revisit three distinct landmarks for recall, see completion feedback.

**Judge:** They should be able to physically control the game and directly test that a new document changes an NPC's lesson knowledge and the puzzle's correct answer. No slide-deck illusion.

## 3. Visual specification: what 2.5D means

**Camera:** fixed three-quarter isometric view using 2D tilemaps and depth-sorted sprites; no first-person perspective; no free 3D camera. **Gameplay:** 2D collision and pathfinding under the hood. **Presentation:** diamond-grid or coherent three-quarter 2.5D tiles, raised building facades, object occlusion, shadows and parallax/particles where affordable.

**Visual rules:** one consistent tileset scale (e.g., 64×32 isometric ground diamonds), logically fixed character height, crisp nearest-neighbor filtering, authored sprites/tiles, readable large dialogue panels, no generative placeholder rectangles, strong color identity per biome. Screen target: browser 16:9 desktop, gracefully resizing. Prefer a good cohesive art pack to a patchwork of incompatible styles. Prebuilt art must be original or correctly licensed for its intended use; separate third-party game-use art from assets you may redistribute standalone.

### Six reusable world templates (all in selector, one complete demo)

| World | Scene language | NPCs | Companion | Example objective → world effect |
|---|---|---|---|---|
| **Enchanted Forest** | Green canopy, winding paths, mushroom huts, sunlight tower, water well | Sunny Sunflower, Wally Water Guardian, Oakley Tree | Sprout | Explain photosynthesis inputs → Great Bloom regains color |
| **Space Station** | Navy/violet space docks, hologram planets, consoles | Captain Nova, Orbit, Zig | Beep | Order planets → navigation console powers up |
| **Math Kingdom** | Gold/blue castle town, towers, market, puzzle gates | Professor Pi, Sir Fraction, Mira Merchant | Digit | Compare fractions → bridge lifts |
| **Ancient Egypt** | Sandstone village, oasis, archaeological sites, temples | Nefru Scribe, Khepri Builder, Amina Archaeologist | Scarab | Match artifacts to uses → archive opens |
| **Ocean World** | Turquoise reefs, corals, shipwreck, caves | Tilly Turtle, Coral Guardian, Finn Fish | Bubble | Build food chain → reef lights up |
| **Science Lab** | Cyan/purple workshop, experiment stations, machines | Professor Proton, Atom, Dr. Bubbles | Sparky | Identify states of matter → lab machine restarts |

Every world uses one shared runtime, quest primitives, voice UI, assessment interface and companion interface. Keep sample content explicit and age-appropriate, especially for history and science.

## 4. Recommended technical stack

**Use the existing repository and libraries first.** If starting blank, use this default. Avoid a rewrite merely to match the table.

| Component | Choice | Why |
|---|---|---|
| Frontend shell | **Next.js + TypeScript + Tailwind** | Upload UI, world selector, results and browser deployment |
| Game scene | **Phaser 3 + TypeScript** embedded client-side | 2D/isometric sprites, keyboard/gamepad, collisions, depth sorting and web hosting |
| World authoring | **Tiled JSON** maps + asset registry | Stable playable maps and declarative placements |
| AI backend | **FastAPI + Pydantic** | PDF extraction, model calls, strong schema validation |
| PDF text | **PyMuPDF** | Lightweight extraction from text-based PDFs; scanned PDFs explicit limitation |
| LLM | **Configured structured-output model** | Generation of objectives, narrative, quests and assessment items; keys remain on server |
| Voice MVP | Browser SpeechRecognition where available, speechSynthesis/typed fallback | Working multimodality with resilient fallback; do not assume consistent browser STT |
| Voice future | LiveKit Agents + STT/LLM/TTS provider adapters | Scalable NPC voice sessions and streaming; not required for first demo |
| Persistence | Local JSON / localStorage for demo; **Neon Postgres** later | Minimal operational dependencies today; durable lesson/session data later |
| Hosting | **Vercel** frontend; **Fly.io**/compatible backend | Browser-based judge access |

**Do not introduce Unity, Unreal, Rust, Kubernetes, full live audio infrastructure or multi-GPU inference just to build today's prototype.** The cited design report chose Unity for a different deployment and timeline; browser-first Phaser is the pragmatic hackathon choice, not a universal superiority claim.

## 5. Components and information flow

```text
Upload PDF
   │
   ▼
Text extraction + section references
   │
   ▼
Curriculum Planner (3–5 objectives + prerequisite relationships)
   │
   ▼
Educator preview/optional edit
   │
   ▼
World Director (select existing biome, map seed, NPC/quest/puzzle data)
   │
   ▼
Schema + asset + reachability + quest graph validator
   │
   ├── invalid → repair once / fallback to known-safe layout
   ▼
Versioned WorldSpec JSON
   │
   ▼
Phaser Game Runtime ← asset library + Tiled map templates
   │        ├── quest state machine
   │        ├── deterministic puzzle graders
   │        ├── NPC dialogue provider (voice/text)
   │        ├── companion hint provider
   │        └── event telemetry
   ▼
Recall finale + Results report
```

**AI should NOT generate code or raw collision maps.** It selects slots and content within validated layouts. Two-stage generation is enough today: (1) curriculum specification, (2) world specification. A third agent or multi-agent supervisor is optional only if reliability warrants it; the reference report recommends supervisor-worker candidate generation, but extra agent orchestration is unnecessary for the MVP.

## 6. Interfaces and data contracts

Define strongly typed or Pydantic-validated contracts. The example is schematic; implement a complete JSON schema and documented defaults.

```ts
type Objective = {
  id: string; text: string; conceptIds: string[];
  evidence: { sectionId: string; quote?: string }[];
  rubric: { criteria: string[]; passingRule: string };
};
type LessonSpec = {
  schemaVersion: '1'; lessonId: string; title: string;
  ageBand: '7-9'|'10-12'; sourceId: string;
  concepts: { id: string; description: string; prerequisites: string[] }[];
  objectives: Objective[];
};
type WorldSpec = {
  schemaVersion: '1'; worldId: string; lessonId: string;
  templateId: 'forest'|'space'|'math'|'egypt'|'ocean'|'lab';
  mapId: string; seed: number; spawnId: string;
  npcs: {id:string; assetId:string; placementSlotId:string;
         personaId:string; objectiveIds:string[]; dialogueId:string}[];
  companionId:string;
  quests: {id:string; prerequisiteIds:string[]; objectiveId:string;
           steps: Array<{kind:'talk'|'visit'|'collect'|'puzzle'; targetId:string}>;
           rewardEffectId:string}[];
  puzzles: {id:string; templateId:string; objectiveId:string;
            prompt:string; answerKey:unknown; hints:string[]; evidenceSectionIds:string[]}[];
  memoryLandmarks: {placementSlotId:string; objectiveId:string; recallPrompt:string}[];
};
```

**Validation gates:** known asset/template/slot IDs; no duplicate IDs; lesson-grounded objectives; correct answer keys; all quest nodes reachable; no prerequisite cycles; no missing triggers; all goals can complete; age-appropriate outputs; capped NPC dialogue; safe default companion actions. Model never directly mutates state; engine receives validated intents and evaluates conditions.

### Minimal API

- `POST /api/materials` → material ID and extraction status.
- `POST /api/lessons/generate` → structured LessonSpec.
- `POST /api/worlds/generate` → WorldSpec with validation diagnostics.
- `GET /api/worlds/:id` → immutable versioned specification.
- `POST /api/sessions` → session ID.
- `POST /api/sessions/:id/events` → interaction/assessment telemetry.
- `GET /api/sessions/:id/results` → results from verified events.

MVP can collapse related endpoints if repo architecture warrants; preserve contract boundaries.

## 7. Dialogue, voice and agent design

NPCs are **characters with distinct personas**, not individually running AI infrastructure by default. One active conversation provider receives active NPC ID, lesson snippets, age band, current objective and known game state.

**Push-to-talk flow:** approach NPC → action prompt → activate voice or typed input → transcript visible in bubble → answer grounded in lesson → spoken response where supported → captions → structured intent returned. Controller West face button can initiate input; a laptop mic is sufficient. Provide typed input and clickable dialogue options to survive permission/API failure.

**NPC instruction contract:** be concise, friendly, curious; never claim a student completed a task merely because they asked; use source snippets; admit uncertainty; ask one meaningful follow-up; don't request a child's personal data. **No unrestricted web search for children.**

**Companion:** follows player, knows active quest, offers progressive hints. Step 1: location cue; Step 2: conceptual nudge; Step 3: partial worked example; never simply dump full answers before an attempt. Future retrieval restricted to age-appropriate allowlisted sources.

**Evaluator:** deterministic for multiple choice, matching, order and environmental puzzles. Use rubric-based model evaluation only for genuine open-ended responses; record result and uncertainty; fail safe to retry/teacher review instead of unearned unlocks.

## 8. Learning mechanics and demo lesson

**Canonical sample:** Public-domain/licensed or synthetic 1–2 page photosynthesis lesson, ages 9–11.

Objective 1: Identify water, carbon dioxide and sunlight as inputs/energy source.  
Objective 2: Explain in simple words how plants use light energy to make sugars.  
Objective 3: Identify oxygen as an output and recognize why photosynthesis matters.

**Quest flow:**

1. Player spawns in Enchanted Forest; Sprout introduces the failing Great Bloom.
2. Talk to **Sunny** (voice or typed). Sunny explains problem and asks which resources plants need.
3. Walk to **Water Well**; collect water token; match resource to source.
4. Visit **Sunlight Tower**; talk to Wally or another NPC, arrange a three-step concept sequence.
5. Visit **Oakley Tree**; short grounded explanation and one question.
6. Great Bloom visibly recovers after validated objectives (animated petals, brighter forest, musical reward).
7. **Memory-place finale:** revisit Water Well, Sunlight Tower, Oakley Tree; no immediate answer shown; answer recall prompts, progressive hints and retries.
8. Show session report: completed objectives, answers, retries, hints, remaining weak concepts, **without claiming proven long-term memory retention**.

For the second PDF test, use solar-system facts in Space Station. At minimum show that changing input changes extracted concepts, dialogue and puzzle content. Do not secretly swap only a hardcoded background.

## 9. Progression and analytics

Each session records a small event log:

```json
{"eventType":"puzzle_attempt","sessionId":"demo-1","worldId":"forest-1",
 "objectiveId":"obj-2","puzzleId":"seq-1","attempt":2,
 "result":"correct","hintsUsed":1,"timestamp":"2026-11-13T12:00:00-08:00"}
```

Record event-level evidence, not arbitrary 'mastery percentage.' Results UI shows objectives demonstrated, puzzle attempts, hint use and a suggested review. Make world feedback tangible: blossom opens, machinery powers on, bridge rises. Wrong answers trigger constructive hints and retry, not damage/shame.

## 10. Day-of-build scope and checkpoints

**P0 — must work before submission:**

1. Local and deployed game loads reliably.
2. One coherent 2.5D forest with player movement, collisions, camera, at least three NPCs, companion and controller/keyboard.
3. PDF upload extracts a real lesson and creates 3–5 grounded objectives.
4. Structured generation produces a validated WorldSpec for the forest.
5. At least one real voice or voice-plus-text NPC interaction; robust fallback.
6. Two distinct lesson-grounded puzzles with validation and quest effects.
7. Three-location recall finale.
8. Tiny results page and 2-minute end-to-end demo.

**P1 — if P0 is reliable:** second source document, second biome, generation preview, editable educator questions, more NPC voice personalities.

**P2 — future:** polished six full adventures, video/audio/PPTX ingestion, real-time multi-agent voices, unrestricted procedural layout (only after validation), teacher classrooms, spaced recall, analytics dashboards.

**Six worlds promise:** have six theme cards and reusable licensed assets/layouts. Only say “six playable worlds” if all are actually traversable and their quests work. Otherwise label the others “template previews.”

### Onsite / remote work split

**Onsite teammate:** run live browser/controller test, gather sponsor judging requirements, manage setup/deployment, practice two-minute pitch and backup demo; own projector, audio and network reliability.

**Remote collaborator:** world schema + curriculum pipeline + generation validation; content grounding; unit tests and code integration via GitHub branches/PRs; prepare backup sample lessons. Remote eligibility and submission attribution require organizer confirmation.

**Integration discipline:** choose one branch and one API contract, merge early; avoid last-minute engine rewrites. Store a known-good demo seed and cached generated WorldSpec for a fallback. Reveal honestly when running the cached demonstration.

## 11. Demo script (2 minutes)

**0:00–0:15:** “WorldCraft turns any lesson into a playable learning world. Not just a game: an educator can see what was learned.”

**0:15–0:35:** Upload photosynthesis PDF; show extracted goals and forest generation. If model latency is high, use a clearly labeled prepared lesson in the live build while explaining the generator.

**0:35–1:05:** Take controller; walk up to Sunny; press talk; have a natural question-and-answer grounded in the lesson.

**1:05–1:30:** Complete environmental learning puzzle; Great Bloom changes visibly. This is the “wow” moment.

**1:30–1:50:** Return to memory landmarks, solve recall prompt and display the short learning report.

**1:50–2:00:** Show different lesson generating different quest content; conclude: “One reusable engine, unlimited educator-created learning adventures.”

## 12. Build-ready acceptance tests

- Start browser with no secret keys required for game exploration.
- Open world selector; forest loads; gamepad or keyboard moves player in correct map directions.
- Player cannot walk through walls; gets behind foreground tree canopy correctly.
- Companion follows without blocking collision.
- Near Sunny, interaction indicator appears; dialogue works via voice and fallback.
- Generated dialogue references extracted photosynthesis content rather than generic preset responses.
- Puzzle correctness follows actual answer key; wrong answer does not unlock objective.
- Complete quest activates world visual change.
- Recall prompt requires an answer rather than merely walking to a place.
- Results match emitted assessment events.
- Replacing source lesson changes objectives, at least one NPC response and puzzle.
- Malformed WorldSpec fails validation and recovers to known-good content rather than crashing.
- New browser session can load known demo state and reliably replay.

## 13. Hand-off to coding harness — exact command

> Inspect the current repository and implement the WorldCraft specification in this Markdown file. Respect what is already built. Do not stop at a design doc. Prioritize **P0** as a fully playable, browser-deployed, 2.5D isometric forest lesson that genuinely transforms a supplied PDF into objectives, NPC knowledge, quests and two graded puzzles. Use TypeScript/Phaser for the runtime, Next.js for platform UI, and a small FastAPI/Pydantic generation service unless the repository offers an already-functional alternative. Make one complete vertical slice before building additional biomes. Use original or appropriately licensed art; list asset sources and redistribution rights. Run the app, test browser/controller fallbacks, fix bugs, and report exactly what works, what is stubbed, and the URL/instructions to run. Preserve modular WorldSpec and lesson-data contracts so we can add six templates and richer voice agents afterward.

## 14. References and provenance

- **User-provided:** *Deliverable_AI_edu.pdf*, Ghent University Design Project Group 03, *Three Point Crown*, dated 16 November 2025, 88-page report. Specific useful portions: design thinking/interviews pp. 16–26; game flow around pp. 39–40; technology/architecture pp. 74–80; prototype scope pp. 81 onwards. This is a research/design source, **not an implementation ready for reuse**. Do not present its reported interviews as our own research or copy its assets/designs without permission.
- **Hackathon:** Beta Fund × Epic, Multi-Modal AI for Education Hackathon, Friday November 13, 2026, Snowflake Silicon Valley AI Hub. Official event page: https://luma.com/beta-3ue5 . Confirm current submission and remote-team rules with organizers.
- **Asset release:** Record each asset’s creator, original URL, license, attribution requirements, and whether standalone redistribution is allowed. Creating or publishing a separate asset pack does not itself determine eligibility of prebuilt code in judging.
