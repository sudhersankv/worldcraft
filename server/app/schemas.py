"""Pydantic mirror of web/src/shared/contracts.ts (camelCase on the wire)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

TemplateId = Literal['forest', 'space', 'math', 'egypt', 'ocean', 'lab']
TEMPLATE_IDS = ['forest', 'space', 'math', 'egypt', 'ocean', 'lab']
AgeBand = Literal['7-9', '10-12']
Source = Literal['llm', 'heuristic', 'sample']


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra='ignore')

    def wire(self) -> dict:
        return self.model_dump(by_alias=True, exclude_none=True, mode='json')


# ------------------------------------------------------------------ lesson
class Section(Model):
    id: str
    heading: str
    text: str
    page: Optional[int] = None


class Material(Model):
    material_id: str
    title: str
    kind: Literal['pdf', 'text', 'sample']
    chars: int
    pages: int
    sections: list[Section]


class Evidence(Model):
    section_id: str
    quote: str


class Rubric(Model):
    criteria: list[str] = Field(default_factory=list)
    passing_rule: str = ''


class Objective(Model):
    id: str
    text: str
    concept_ids: list[str] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    rubric: Rubric = Field(default_factory=Rubric)


class Concept(Model):
    id: str
    name: str
    description: str = ''
    prerequisites: list[str] = Field(default_factory=list)


class LessonSpec(Model):
    schema_version: Literal['1'] = '1'
    lesson_id: str
    title: str
    summary: str = ''
    age_band: AgeBand = '7-9'
    source_id: str = ''
    sections: list[Section] = Field(default_factory=list)
    concepts: list[Concept] = Field(default_factory=list)
    objectives: list[Objective]
    suggested_template: TemplateId = 'forest'


# ------------------------------------------------------------------ world
class Question(Model):
    id: str
    prompt: str
    choices: list[str]
    answer_index: int
    accept: list[str] = Field(default_factory=list)
    explain: str = ''
    hints: list[str] = Field(default_factory=list)


class Zone(Model):
    id: str
    name: str
    kind: Literal['hub', 'landmark', 'goal', 'wild']
    landmark: str
    objective_id: Optional[str] = None
    description: str = ''


class NpcSpec(Model):
    id: str
    name: str
    title: str
    archetype: str
    persona: str
    voice: str
    zone_id: str
    objective_id: str
    greeting: str
    teach: list[str]
    knowledge: list[str]
    check: Question


class Pair(Model):
    left: str
    right: str


class PuzzleSpec(Model):
    id: str
    objective_id: str
    zone_id: str
    kind: Literal['sequence', 'match', 'choice']
    title: str
    prompt: str
    items: Optional[list[str]] = None
    pairs: Optional[list[Pair]] = None
    questions: Optional[list[Question]] = None
    hints: list[str] = Field(default_factory=list)
    success: str = ''
    evidence_section_ids: list[str] = Field(default_factory=list)


class KeyTerm(Model):
    term: str
    meaning: str


class StudyCard(Model):
    id: str
    objective_id: str
    zone_id: str
    title: str
    body: list[str]
    key_terms: list[KeyTerm] = Field(default_factory=list)
    example: Optional[str] = None
    figure: Optional[str] = None
    source_section_ids: list[str] = Field(default_factory=list)
    checks: list[Question] = Field(default_factory=list)


class SideQuest(Model):
    id: str
    title: str
    giver_npc_id: str
    zone_id: str
    objective_id: str
    kind: Literal['explain', 'quiz', 'find']
    prompt: str
    questions: Optional[list[Question]] = None
    target_id: Optional[str] = None
    rubric: Optional[list[str]] = None
    reward: str = ''


class GlossaryEntry(Model):
    term: str
    meaning: str
    section_id: str


QuestStepKind = Literal['study', 'talk', 'explain', 'visit', 'collect', 'puzzle', 'recall']


class QuestStep(Model):
    id: str
    kind: QuestStepKind
    target_id: str
    text: str
    count: Optional[int] = None


class Quest(Model):
    id: str
    title: str
    objective_id: str
    prerequisite_ids: list[str] = Field(default_factory=list)
    steps: list[QuestStep]
    reward_effect_id: str


class RecallSpec(Model):
    zone_id: str
    objective_id: str
    question: Question


class RewardEffect(Model):
    id: str
    kind: Literal['bloom', 'power', 'bridge', 'light', 'restore']
    zone_id: str
    text: str


class Collectible(Model):
    id: str
    name: str
    zone_id: str
    count: int
    icon: str


class Story(Model):
    intro: list[str]
    goal: str
    finale: str


class Companion(Model):
    name: str
    greeting: str


class WorldSpec(Model):
    schema_version: Literal['1'] = '1'
    world_id: str
    lesson_id: str
    template_id: TemplateId
    title: str
    subject: str
    seed: int = 1
    story: Story
    companion: Companion
    zones: list[Zone]
    npcs: list[NpcSpec]
    collectibles: list[Collectible] = Field(default_factory=list)
    puzzles: list[PuzzleSpec]
    quests: list[Quest]
    memory_landmarks: list[RecallSpec]
    reward_effects: list[RewardEffect] = Field(default_factory=list)
    study: list[StudyCard] = Field(default_factory=list)
    side_quests: list[SideQuest] = Field(default_factory=list)
    glossary: list[GlossaryEntry] = Field(default_factory=list)
    review_questions: list[Question] = Field(default_factory=list)
    source: Source = 'llm'


class GenerateWorldResponse(Model):
    world: WorldSpec
    diagnostics: list[str] = Field(default_factory=list)
    repaired: bool = False
    fallback: bool = False


class GenerateLessonResponse(Model):
    lesson: LessonSpec
    source: Source
    diagnostics: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ referee / dialogue
Intent = Literal['answer', 'doubt', 'chat', 'skip', 'off_topic']


class Verdict(Model):
    intent: Intent
    correct: bool
    power: float
    feedback: str
    source: Literal['jev', 'llm', 'local']


class GoatClue(Model):
    question: str
    text: str
    source: str
    url: Optional[str] = None


class HistoryItem(Model):
    role: Literal['child', 'npc']
    text: str


class NpcReplyRequest(Model):
    world_id: str
    npc_id: str
    session_id: Optional[str] = None
    utterance: str = ''
    history: list[HistoryItem] = Field(default_factory=list)
    question_id: Optional[str] = None
    mode: Optional[Literal['chat', 'explain', 'answer']] = None
    objective_id: Optional[str] = None


class ExplainResult(Model):
    covered: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    passed: bool = False


class NpcReplyResponse(Model):
    reply: str
    verdict: Optional[Verdict] = None
    goat: Optional[GoatClue] = None
    explain: Optional[ExplainResult] = None
    source: Literal['llm', 'local']


class ServerConfig(Model):
    llm: bool
    stt: bool
    tts: bool
    exa: bool
    referee: bool
    model: str


# ------------------------------------------------------------------ telemetry
EventType = Literal['session_start', 'npc_talk', 'utterance', 'question_answer', 'puzzle_attempt',
                    'hint', 'collect', 'visit', 'quest_complete', 'recall_attempt', 'goat', 'world_complete',
                    'study_open', 'study_check', 'explain_attempt', 'review_attempt', 'side_quest_complete']


class SessionEvent(Model):
    event_type: EventType
    session_id: str
    world_id: str
    objective_id: Optional[str] = None
    puzzle_id: Optional[str] = None
    question_id: Optional[str] = None
    attempt: Optional[int] = None
    result: Optional[Literal['correct', 'incorrect', 'skipped']] = None
    hints_used: Optional[int] = None
    detail: Optional[str] = None
    timestamp: str = ''


class ObjectiveResult(Model):
    objective_id: str
    text: str
    demonstrated: bool
    attempts: int
    correct: int
    hints_used: int
    recalled: Optional[bool] = None
    studied: bool = False
    explained: Optional[bool] = None


class SessionResults(Model):
    session_id: str
    world_id: str
    lesson_title: str
    started_at: str
    completed: bool
    objectives: list[ObjectiveResult]
    events: int
    suggested_review: list[str]

    def wire(self) -> dict:  # `recalled` must serialize as null, not be dropped
        return self.model_dump(by_alias=True, mode='json')


# ------------------------------------------------------------------ request bodies
class TextMaterialRequest(Model):
    title: str = 'My lesson'
    text: str


class SampleMaterialRequest(Model):
    sample_id: str


class GenerateLessonRequest(Model):
    material_id: str
    age_band: AgeBand = '7-9'


class GenerateWorldRequest(Model):
    lesson: LessonSpec
    template_id: Optional[TemplateId] = None


class GradeRequest(Model):
    world_id: str
    question_id: str
    utterance: str = ''


class GoatRequest(Model):
    question: str
    world_id: Optional[str] = None


class StartSessionRequest(Model):
    world_id: str
