"""Two-stage generation: curriculum (LessonSpec) -> world (WorldSpec), with validate / repair-once / fallbacks."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid

from . import config, llm, store
from .heuristic import PERSONA, THEMES, VOICES, assemble_world, heuristic_lesson, heuristic_world, slug
from .schemas import GenerateLessonResponse, GenerateWorldResponse, LessonSpec, Material, WorldSpec
from .validate import errors, validate_lesson, validate_world

log = logging.getLogger('wc.generate')
SAMPLE_BY_TEMPLATE = {'forest': 'forest-photosynthesis', 'space': 'space-solar-system', 'math': 'math-fractions',
                      'egypt': 'egypt-pyramids', 'ocean': 'ocean-coral-reefs', 'lab': 'lab-states-of-matter'}
WORLD_BUDGET = 85.0  # seconds; the client gives up at 90


def _llm_note(e: Exception) -> str:
    if isinstance(e, llm.NoCreditsError):
        return 'LLM gateway has no AI credits (403 paid_plan_required); used the offline generator. Add AI Gateway credits on the Neon Billing page.'
    return f'LLM unavailable ({str(e)[:140]}); used the offline generator.'


def _sections_text(sections, cap: int = 24000) -> str:
    out, n = [], 0
    for s in sections:
        chunk = f'[{s.id}] {s.heading}\n{s.text}\n'
        if n + len(chunk) > cap:
            break
        out.append(chunk)
        n += len(chunk)
    return '\n'.join(out)


# ------------------------------------------------------------------ lesson
LESSON_PROMPT = """You are a curriculum planner for children aged {age}. From the lesson below, write a LessonSpec as JSON.

LESSON "{title}" (sections are labelled with ids):
{sections}

Return JSON only, exactly this shape:
{{"title": str, "summary": "2 simple sentences",
  "concepts": [{{"id":"c-1","name":str,"description":str,"prerequisites":[concept ids]}}],
  "objectives": [  // exactly 3, in teaching order, each a different big idea from the lesson
    {{"id":"obj-1","text":"child-readable goal starting with a verb, e.g. Name the three things a plant needs to make food",
      "conceptIds":["c-1"],
      "evidence":[{{"sectionId":"s2","quote":"a sentence copied EXACTLY, word for word, from that section"}}],
      "rubric":{{"criteria":["3-4 short checkable ideas a good spoken explanation mentions"],"passingRule":str}}}}],
  "suggestedTemplate": one of "forest"|"space"|"math"|"egypt"|"ocean"|"lab"}}
Rules: every evidence quote MUST be an exact substring of the named section. Only use facts from the lesson. Kid-safe language."""


async def generate_lesson(material: Material, age_band: str = '7-9') -> GenerateLessonResponse:
    diags: list[str] = []
    sample_lesson = None
    if material.material_id.startswith('sample-'):
        name = material.material_id.removeprefix('sample-')
        for lid, raw in store.samples('lessons').items():
            if raw.get('sourceId') == material.material_id or lid == f'lesson-{name}':
                sample_lesson = LessonSpec.model_validate(raw)
                break

    def finish(lesson: LessonSpec, source: str) -> GenerateLessonResponse:
        lesson.age_band = age_band
        store.put('lessons', lesson.lesson_id, lesson.wire())
        return GenerateLessonResponse(lesson=lesson, source=source, diagnostics=diags)

    if config.has_llm():
        try:
            lesson = await _llm_lesson(material, age_band, diags)
            if lesson:
                return finish(lesson, 'llm')
        except Exception as e:
            diags.append(_llm_note(e))
    else:
        diags.append('No LLM key configured; used the offline generator.')
    if sample_lesson:
        diags.append('Using the hand-checked sample lesson.')
        return finish(sample_lesson, 'sample')
    try:
        lesson = heuristic_lesson(material, age_band)
        _, d = validate_lesson(lesson)
        diags += [f'heuristic: {x}' for x in d]
        return finish(lesson, 'heuristic')
    except Exception as e:
        log.exception('heuristic lesson failed')
        diags.append(f'offline generator failed: {e}')
        raise


async def _llm_lesson(material: Material, age_band: str, diags: list[str]) -> LessonSpec | None:
    prompt = LESSON_PROMPT.format(age=age_band, title=material.title, sections=_sections_text(material.sections))
    msgs = [{'role': 'user', 'content': prompt}]
    for attempt in range(2):
        text = await llm.chat(msgs, model='gen', max_tokens=2500, temperature=0.3, timeout=60)
        try:
            data = llm.extract_json(text)
        except ValueError as e:
            d = [f'could not parse JSON: {e}']
            data = None
        if data is not None:
            data.update(schemaVersion='1', lessonId=f'l-{uuid.uuid4().hex[:10]}', ageBand=age_band,
                        sourceId=material.material_id, sections=[s.wire() for s in material.sections])
            data.setdefault('title', material.title)
            if data.get('suggestedTemplate') not in THEMES:
                data['suggestedTemplate'] = 'forest'
            lesson, d = validate_lesson(data)
            if lesson and not errors(d):
                diags += [f'llm: {x}' for x in d]
                return lesson
        diags.append(f'llm lesson attempt {attempt + 1} invalid: ' + '; '.join(errors(d)[:6]))
        msgs += [{'role': 'assistant', 'content': text},
                 {'role': 'user', 'content': 'That failed validation:\n- ' + '\n- '.join(errors(d)[:12]) +
                  '\nFix every problem (copy quotes exactly from the sections) and return the full JSON only.'}]
    return None


# ------------------------------------------------------------------ world
PART_PROMPT = """You design ONE place in a 2.5D educational game world ({world}) for children aged {age}. The game is LEARNING FIRST:
the child STUDIES a short card at this place, TALKS to the character, EXPLAINS the idea back in their own words, then solves a puzzle.

Learning objective {idx} of 3: "{objective}"
Rubric: {rubric}
Lesson source text (the ONLY source of facts; never invent facts):
{sections}

The character is a {archetype} (personality hint: {persona}). Suggested name: {name} {title}.
The place's centrepiece is a "{kit}" (suggested place name: "{place}").

Return JSON only:
{{"landmark":{{"name":str,"description":"1 sentence"}},
 "npc":{{"name":str,"title":"the ...","persona":"2 sentences: personality + speaking style","greeting":"1-2 sentences, in character",
        "teach":["2-3 short lines teaching the objective, faithful to the source"],
        "knowledge":["4-7 facts copied or lightly simplified from the source text"],
        "check":QUESTION}},
 "study":[ // exactly 2 study cards that TEACH this objective step by step, ages 9-11, faithful to the source
   {{"id":"a","title":"short","body":["2-4 SHORT paragraphs, 1-2 sentences each"],"keyTerms":[{{"term":"word that appears in the source","meaning":"simple meaning"}}],
     "example":"a concrete everyday example","figure":"cycle|arrow-in-out|ordered-list|compare|none","sourceSectionIds":["s1"],"checks":[QUESTION]}}],
 "puzzle":{{"kind":"{pkind}","title":str,"prompt":str,
           // sequence: "items": 3-6 short steps in the CORRECT order; match: "pairs":[{{"left":str,"right":str}}] 3-5 pairs; choice: "questions":[QUESTION,QUESTION]
           "hints":["3 progressive hints"],"success":"1 sentence","evidenceSectionIds":["s1"]}},
 "recall":QUESTION  // asked later at this place from memory; different wording from the check
}}
QUESTION = {{"id":"q","prompt":str,"choices":[2-4 short options],"answerIndex":int,"accept":["spoken answers that count as correct, lowercase"],
            "explain":"1 sentence why","hints":["location/cue","conceptual nudge","partial worked example - never the full answer"]}}
Use "{pkind}" for the puzzle kind unless the content clearly fits another kind better. Short sentences, kid-safe, no personal questions."""

FRAME_PROMPT = """You frame a 2.5D educational game world ({world}) about the lesson "{title}" for children aged {age}.
Objectives: {objectives}
The three places are: {places}. Characters: {npcs}. The goal place is "{goal}". The helper companion is called {companion}.
Lesson source text:
{sections}

Return JSON only:
{{"title":"catchy world title (2-5 words)","subject":"1-3 words",
 "story":{{"intro":["3 short lines: something is wrong in the world, learning will fix it"],"goal":"1 sentence","finale":"1-2 sentences"}},
 "companionGreeting":"1-2 sentences from {companion}",
 "questTitles":["3 short quest titles, one per place"],
 "rewards":["3 lines, one per place, describing the place visibly coming back to life","1 line for the goal place being restored"],
 "glossary":[{{"term":"key word that appears in the source","meaning":"simple meaning","sectionId":"s1"}}],  // 6-10 terms
 "reviewQuestions":[QUESTION x3, each mixing ideas from different objectives],
 "sideQuests":[
   {{"kind":"explain","giver":3,"objective":1,"title":str,"prompt":"ask the child to explain objective 1 in their own words","rubric":["2-3 ideas"],"reward":"a fun sticker or badge"}},
   {{"kind":"quiz","giver":2,"objective":2,"title":str,"prompt":str,"questions":[QUESTION,QUESTION],"reward":str}}]}}
QUESTION = {{"id":"q","prompt":str,"choices":[2-4],"answerIndex":int,"accept":["lowercase spoken answers"],"explain":str,"hints":["cue","nudge","partial example"]}}
Only facts from the lesson. Kid-safe."""


def _q(q: dict, qid: str) -> dict:
    q = dict(q or {})
    q['id'] = qid
    q.setdefault('accept', [])
    q.setdefault('hints', [])
    q.setdefault('explain', '')
    try:
        q['answerIndex'] = int(q.get('answerIndex', 0))
    except (TypeError, ValueError):
        q['answerIndex'] = 0
    if not q['accept'] and q.get('choices') and 0 <= q['answerIndex'] < len(q['choices']):
        q['accept'] = [str(q['choices'][q['answerIndex']]).lower()]
    return q


async def _call(prompt: str, deadline: float, max_tokens: int) -> dict:
    remaining = deadline - time.monotonic()
    if remaining < 8:
        raise llm.LLMError('time budget exhausted')
    text = await llm.chat([{'role': 'user', 'content': prompt}], model='gen', max_tokens=max_tokens,
                          temperature=0.5, timeout=min(70, remaining))
    return llm.extract_json(text)


async def _llm_world(lesson: LessonSpec, t: str, deadline: float, feedback: str = '') -> dict:
    th = THEMES[t]
    secs = {s.id: s for s in lesson.sections}
    objs = lesson.objectives[:3]
    kinds = ['match', 'sequence', 'choice']
    extra = f'\n\nA previous attempt failed validation; avoid these problems:\n{feedback}' if feedback else ''
    part_prompts = []
    for i, o in enumerate(objs):
        ids = list(dict.fromkeys(e.section_id for e in o.evidence if e.section_id in secs)) or [lesson.sections[0].id]
        src = '\n'.join(f'[{sid}] {secs[sid].heading}\n{secs[sid].text}' for sid in ids)[:6000]
        name, title = th['names'][i]
        part_prompts.append(PART_PROMPT.format(
            world=th['world'], age=lesson.age_band, idx=i + 1, objective=o.text, rubric='; '.join(o.rubric.criteria),
            sections=src, archetype=th['archetypes'][i], persona=PERSONA.get(th['archetypes'][i], ''), name=name,
            title=title, kit=th['kits'][i], place=th['place'][i], pkind=kinds[i]) + extra)
    frame_prompt = FRAME_PROMPT.format(
        world=th['world'], title=lesson.title, age=lesson.age_band,
        objectives='; '.join(f'{i + 1}. {o.text}' for i, o in enumerate(objs)), places=', '.join(th['place']),
        npcs=', '.join(f'{n} {tt}' for n, tt in th['names']), goal=th['goal'][0], companion=th['companion'],
        sections=_sections_text(lesson.sections, 9000)) + extra
    results = await asyncio.gather(*[_call(p, deadline, 7000) for p in part_prompts], _call(frame_prompt, deadline, 5000))
    parts, frame = results[:3], results[3]
    for p in parts:
        if not isinstance(p, dict) or not isinstance(p.get('npc'), dict):
            raise llm.LLMError('model returned an incomplete place: keys=%s' % (list(p.keys())[:6] if isinstance(p, dict) else type(p).__name__))
    seed = int(time.time()) % 100000
    voices = VOICES[:]
    landmarks, npcs, study, puzzles, recall = [], [], [], [], []
    for i, (o, p) in enumerate(zip(objs, parts)):
        n = p['npc']
        lm = p.get('landmark') or {}
        landmarks.append(dict(id=f'z-{i + 1}', name=lm.get('name') or th['place'][i], landmark=th['kits'][i],
                              description=lm.get('description', '')))
        npcs.append(dict(name=n.get('name') or th['names'][i][0], title=n.get('title') or th['names'][i][1],
                         archetype=th['archetypes'][i], persona=n.get('persona', ''), voice=voices[(seed + i * 2) % len(voices)],
                         greeting=n.get('greeting', 'Hello!'), teach=n.get('teach') or [], knowledge=n.get('knowledge') or [],
                         check=_q(n.get('check'), f'check-{i + 1}')))
        cards = []
        for k, c in enumerate((p.get('study') or [])[:3]):
            cid = f'study-{i + 1}{"abc"[k]}'
            c = dict(c)
            c['id'] = cid
            c['checks'] = [_q(q, f'{cid}-q{j + 1}') for j, q in enumerate((c.get('checks') or [])[:2])]
            c['sourceSectionIds'] = [s for s in c.get('sourceSectionIds') or [] if s in secs] or [o.evidence[0].section_id]
            cards.append(c)
        study.append(cards)
        pz = dict(p.get('puzzle') or {})
        pz['id'] = f'pz-{i + 1}'
        if pz.get('questions'):
            pz['questions'] = [_q(q, f'pz-{i + 1}-q{j + 1}') for j, q in enumerate(pz['questions'][:4])]
        pz['evidenceSectionIds'] = [s for s in pz.get('evidenceSectionIds') or [] if s in secs] or [o.evidence[0].section_id]
        puzzles.append([pz])
        recall.append(_q(p.get('recall'), f'recall-{i + 1}'))
    side = []
    for k, sq in enumerate((frame.get('sideQuests') or [])[:4]):
        gi = max(1, min(3, int(sq.get('giver', 1) or 1))) - 1
        oi = max(1, min(3, int(sq.get('objective', 1) or 1))) - 1
        item = dict(id=f'side-{k + 1}', title=sq.get('title', 'Side quest'), giverNpcId=f'npc-{gi + 1}',
                    zoneId=landmarks[gi]['id'], objectiveId=objs[oi].id, kind=sq.get('kind', 'quiz'),
                    prompt=sq.get('prompt', ''), reward=sq.get('reward', 'a shiny sticker'))
        if sq.get('questions'):
            item['questions'] = [_q(q, f'side-{k + 1}-q{j + 1}') for j, q in enumerate(sq['questions'][:3])]
        if sq.get('rubric'):
            item['rubric'] = sq['rubric']
        if item['kind'] not in ('explain', 'quiz', 'find'):
            item['kind'] = 'quiz'
        side.append(item)
    rewards = (frame.get('rewards') or []) + [f'The {l["name"]} comes back to life!' for l in landmarks] + [f'{th["goal"][0]} is restored!']
    rewards = rewards[:3] + [frame['rewards'][3] if len(frame.get('rewards') or []) > 3 else f'{th["goal"][0]} is restored!']
    title = frame.get('title') or f'The {th["world"]} of {lesson.title}'
    return assemble_world(dict(
        worldId=f'{t}-{slug(title, 20)}-{uuid.uuid4().hex[:4]}', lessonId=lesson.lesson_id, templateId=t, title=title,
        subject=frame.get('subject') or lesson.title, seed=seed,
        story=frame.get('story') or dict(intro=[f'Welcome to the {th["world"]}!'], goal='Learn everything!', finale='You did it!'),
        companion=dict(name=th['companion'], greeting=frame.get('companionGreeting') or f'Hi, I\'m {th["companion"]}!'),
        hub=dict(name=th['hub'], description='Where every adventure starts.'),
        goal=dict(name=th['goal'][0], landmark=th['goal'][1], description=f'It wakes up when you master {lesson.title}.'),
        landmarks=landmarks, npcs=npcs, objectiveIds=[o.id for o in objs], study=study, puzzles=puzzles, recall=recall,
        collectible=dict(name=th['token'][0], icon=th['token'][1], count=3, zone=0), rewards=rewards,
        questTitles=frame.get('questTitles'), sideQuests=side,
        glossary=[g for g in frame.get('glossary') or [] if g.get('sectionId') in secs][:12],
        reviewQuestions=[_q(q, f'review-{k + 1}') for k, q in enumerate((frame.get('reviewQuestions') or [])[:4])],
        source='llm'))


def _sample_world_for(lesson: LessonSpec, t: str) -> WorldSpec | None:
    for raw in store.samples('worlds').values():
        if raw.get('lessonId') == lesson.lesson_id and raw.get('templateId') == t:
            return WorldSpec.model_validate(raw)
    return None


async def generate_world(lesson: LessonSpec, template_id: str | None = None) -> GenerateWorldResponse:
    t = template_id or lesson.suggested_template or 'forest'
    if t not in THEMES:
        t = 'forest'
    diags: list[str] = []
    repaired = False
    deadline = time.monotonic() + WORLD_BUDGET

    def done(w: WorldSpec, fallback: bool) -> GenerateWorldResponse:
        store.put('worlds', w.world_id, w.wire())
        return GenerateWorldResponse(world=w, diagnostics=diags, repaired=repaired, fallback=fallback)

    if config.has_llm():
        feedback = ''
        for attempt in range(2):
            try:
                raw = await _llm_world(lesson, t, deadline, feedback)
                w, d = validate_world(raw, lesson)
                if w and not errors(d):
                    diags += [f'llm: {x}' for x in d]
                    repaired = attempt > 0
                    return done(w, False)
                errs = errors(d)
                diags.append(f'llm world attempt {attempt + 1} invalid: ' + '; '.join(errs[:6]))
                feedback = '\n'.join(f'- {x}' for x in errs[:15])
            except Exception as e:
                diags.append(_llm_note(e) if attempt == 0 or isinstance(e, llm.NoCreditsError) else f'repair failed: {str(e)[:140]}')
                if isinstance(e, (llm.NoCreditsError,)) or 'not configured' in str(e) or 'budget' in str(e):
                    break
                feedback = feedback or f'- previous output could not be used: {str(e)[:200]}'
            if time.monotonic() > deadline - 30:
                diags.append('not enough time left for a repair pass')
                break
    else:
        diags.append('No LLM key configured; used the offline generator.')
    sample = _sample_world_for(lesson, t)
    if sample:
        diags.append('Using the hand-authored sample world for this sample lesson.')
        return done(sample, config.has_llm())
    try:
        w = heuristic_world(lesson, t)
        w2, d = validate_world(w, lesson)
        if w2 and not errors(d):
            diags += [f'heuristic: {x}' for x in d]
            return done(w2, config.has_llm())
        diags.append('heuristic world invalid: ' + '; '.join(errors(d)[:6]))
    except Exception as e:
        log.exception('heuristic world failed')
        diags.append(f'offline generator failed: {e}')
    raw = store.samples('worlds').get(SAMPLE_BY_TEMPLATE[t])
    diags.append(f'Fell back to the {t} template sample world.')
    return done(WorldSpec.model_validate(raw), True)


def save_world(world: WorldSpec) -> GenerateWorldResponse:
    """Educator-edited spec: validate; store only if valid (never overwrite the samples on disk)."""
    from .services import get_lesson, invalidate_world
    lesson = get_lesson(world.lesson_id)
    w, d = validate_world(world, lesson)
    errs = errors(d)
    if w and not errs:
        store.put('worlds', w.world_id, w.wire())
        invalidate_world(w.world_id)
        return GenerateWorldResponse(world=w, diagnostics=d, repaired=False, fallback=False)
    return GenerateWorldResponse(world=world, diagnostics=d, repaired=False, fallback=False)
