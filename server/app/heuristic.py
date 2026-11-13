"""No-key generator: a real lesson-grounded LessonSpec + WorldSpec built from the extracted text.

Also home of `assemble_world`, the deterministic builder that turns authored/generated *content*
(zones, npcs, study cards, puzzles...) into a complete WorldSpec with the quest mastery loop:
per objective  study -> talk -> explain -> puzzle ;  final  visit goal -> recall memory.
"""
from __future__ import annotations

import hashlib
import math
import random
import re
import uuid
from collections import Counter

from .schemas import LessonSpec, Material, WorldSpec

# ------------------------------------------------------------------ themes
THEMES: dict[str, dict] = {
    'forest': dict(hub='Enchanted Glade', goal=('The Great Bloom', 'tree'), kits=['tower', 'well', 'tree'],
                   archetypes=['sunflower', 'water-spirit', 'tree'], names=[('Sunny', 'the Sunflower'), ('Wally', 'the Water Guardian'), ('Oakley', 'the Ancient Tree')],
                   companion='Sprout', token=('Dew Drop', 'drop'), fx=['bloom', 'bloom', 'bloom', 'restore'],
                   place=['Sunlit Tower', 'Whispering Well', 'Elder Grove'], world='Forest'),
    'space': dict(hub='Docking Bay', goal=('Navigation Console', 'console'), kits=['tower', 'obelisk', 'console'],
                  archetypes=['astronaut', 'robot', 'alien'], names=[('Captain Nova', 'the Astronaut'), ('Orbit', 'the Robot'), ('Zig', 'the Friendly Alien')],
                  companion='Beep', token=('Star Shard', 'star'), fx=['power', 'power', 'light', 'restore'],
                  place=['Beacon Tower', 'Gravity Pylon', 'Star Console'], world='Space Station'),
    'math': dict(hub='Castle Courtyard', goal=('The Number Gate', 'gate'), kits=['tower', 'statue', 'fountain'],
                 archetypes=['wizard', 'knight', 'merchant'], names=[('Merla', 'the Number Wizard'), ('Sir Digit', 'the Knight'), ('Penny', 'the Merchant')],
                 companion='Pip', token=('Number Gem', 'gem'), fx=['bridge', 'light', 'bridge', 'restore'],
                 place=["Wizard's Tower", 'Knight Statue', 'Market Fountain'], world='Number Kingdom'),
    'egypt': dict(hub='Oasis Camp', goal=('The Great Pyramid', 'obelisk'), kits=['shrine', 'statue', 'obelisk'],
                  archetypes=['scribe', 'builder', 'explorer'], names=[('Neferi', 'the Scribe'), ('Bako', 'the Builder'), ('Dr. Dune', 'the Explorer')],
                  companion='Scarab', token=('Golden Scarab', 'scarab'), fx=['light', 'restore', 'light', 'restore'],
                  place=['Scroll Shrine', 'Sphinx Statue', 'Sun Obelisk'], world='Desert of Pharaohs'),
    'ocean': dict(hub='Lagoon Dock', goal=('The Heart Reef', 'reef'), kits=['reef', 'shrine', 'fountain'],
                  archetypes=['turtle', 'coral', 'fish'], names=[('Shelly', 'the Sea Turtle'), ('Coralie', 'the Coral Keeper'), ('Finn', 'the Clownfish')],
                  companion='Bubbles', token=('Pearl', 'pearl'), fx=['bloom', 'light', 'bloom', 'restore'],
                  place=['Coral Garden', 'Kelp Shrine', 'Bubble Fountain'], world='Ocean Reef'),
    'lab': dict(hub='Main Lab', goal=('The Big Experiment', 'console'), kits=['console', 'tower', 'fountain'],
                archetypes=['scientist', 'robot', 'kid'], names=[('Dr. Ada', 'the Scientist'), ('Bolt', 'the Lab Robot'), ('Max', 'the Junior Scientist')],
                companion='Fizz', token=('Energy Cell', 'battery'), fx=['power', 'power', 'light', 'restore'],
                place=['Test Station', 'Tesla Tower', 'Bubbling Fountain'], world='Science Lab'),
}
VOICES = ['aura-2-thalia-en', 'aura-2-apollo-en', 'aura-2-athena-en', 'aura-2-zeus-en',
          'aura-2-orpheus-en', 'aura-2-helena-en', 'aura-2-arcas-en']
PERSONA = {
    'sunflower': 'Cheerful and bright, always turning toward the sun. Speaks warmly with sunny jokes.',
    'water-spirit': 'Calm and flowing, a gentle guardian. Speaks softly and patiently.',
    'tree': 'Very old and wise, slow and kind. Speaks like a gentle grandparent.',
    'astronaut': 'Brave and upbeat mission captain. Speaks in short, confident sentences with space slang like "Roger that".',
    'robot': 'Friendly, precise robot who loves facts and lists. Occasionally says "beep-boop".',
    'alien': 'Curious alien visitor amazed by everything. Asks playful questions.',
    'wizard': 'Playful wizard who treats numbers like magic spells.',
    'knight': 'Honourable, encouraging knight who loves fair play.',
    'merchant': 'Chatty market trader who explains with everyday shopping examples.',
    'scribe': 'Careful, proud scribe who loves writing and stories.',
    'builder': 'Strong, hard-working builder who explains things step by step.',
    'explorer': 'Excited explorer who loves discoveries and clues.',
    'turtle': 'Old, patient sea turtle who has swum every ocean. Speaks slowly and warmly.',
    'coral': 'Colourful, caring reef keeper who loves her tiny neighbours.',
    'fish': 'Zippy, excitable little fish who talks fast and loves friends.',
    'scientist': 'Enthusiastic scientist who loves experiments and asking "what do you predict?".',
    'kid': 'Curious young helper who learns alongside the player.',
}

STOP = set('''a about above after again against all also am an and any are as at be because been before being below between
both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if
in into is it its itself just let like made make makes many me more most much must my no nor not now of off on once only or other our
ours out over own same she should so some such than that the their them then there these they this those through to too under until
up very was we were what when where which while who whom why will with would you your yours one two three four five six seven eight
nine ten first next last called means every almost each often may might use uses used get gets got way ways thing things lot lots
really even still yet tells tell told says said show shows size sizes around another back well new old big small little much part parts kind help helps helped need needs needed'''.split())

BLANK = '_____'


def _rng(*keys) -> random.Random:
    h = hashlib.sha1('|'.join(map(str, keys)).encode()).hexdigest()
    return random.Random(int(h[:12], 16))


def sentences(text: str) -> list[str]:
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z"\'])', re.sub(r'\s+', ' ', text).strip())
    return [p.strip() for p in parts if 20 <= len(p.strip()) <= 260 and re.search(r'[a-z]', p)]


def words(text: str) -> list[str]:
    return re.findall(r"[a-z][a-z'-]*[a-z]|[a-z]", text.lower())


def shorten(s: str, n: int = 160) -> str:
    s = re.sub(r'\s*\([^)]*\)', '', s).strip()
    if len(s) <= n:
        return s
    cut = s[:n]
    for sep in ['; ', ', and ', ', but ', ', so ', ', ']:
        i = cut.rfind(sep)
        if i > n * 0.5:
            return cut[:i].rstrip(',;') + '.'
    return cut[: cut.rfind(' ')].rstrip(',;') + '...'


def has_word(text: str, term: str) -> bool:
    return re.search(r'(?<![a-z])' + re.escape(term.lower()) + r'(?:s|es)?(?![a-z])', text.lower()) is not None


def blank_out(sentence: str, term: str) -> str:
    return re.sub(r'(?i)(?<![a-z])' + re.escape(term) + r'(?:s|es)?(?![a-z])', BLANK, sentence, count=1)


def slug(s: str, n: int = 24) -> str:
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:n].strip('-') or 'world'


# ------------------------------------------------------------------ term mining
def mine_terms(sections) -> dict[str, float]:
    """Global term weights: unigrams + repeated bigrams, penalising ubiquitous words."""
    tf, df = Counter(), Counter()
    for s in sections:
        ws = [w for w in words(s.text + ' ' + s.heading) if len(w) >= 4 and w not in STOP]
        tf.update(ws)
        df.update(set(ws))
        toks = words(s.text)
        bi = [f'{a} {b}' for a, b in zip(toks, toks[1:]) if a not in STOP and b not in STOP and len(a) > 2 and len(b) > 2]
        for b, c in Counter(bi).items():
            if c >= 2 or any(b in words_join for words_join in [s.heading.lower()]):
                tf[b] += c * 1.6
                df[b] += 1
    n = max(1, len(sections))
    out = {}
    for t, c in tf.items():
        idf = math.log(1 + n / df[t]) if df[t] else 1
        out[t] = c * (0.6 + idf)
    # a bigram subsumes its parts when it is about as frequent
    for t in list(out):
        if ' ' in t:
            for part in t.split():
                if part in out and tf[part] <= tf[t] / 1.6 + 1:
                    out[part] *= 0.5
    return out


def section_terms(sec, weights: dict[str, float], k: int = 6) -> list[str]:
    text = sec.text.lower()
    scored = [(w * (1 + text.count(t)), t) for t, w in weights.items() if has_word(text, t)]
    scored.sort(reverse=True)
    out: list[str] = []
    for _, t in scored:
        if any(t in o or o in t for o in out):
            continue
        out.append(t)
        if len(out) >= k:
            break
    return out


def score_sentence(s: str, weights: dict[str, float]) -> float:
    ws = [w for w in words(s) if w not in STOP]
    base = sum(weights.get(w, 0) for w in ws) / math.sqrt(len(ws) + 1)
    if re.search(r'\b(is|are|means|called|because|so|makes?|needs?)\b', s.lower()):
        base *= 1.3
    if s.endswith('?'):
        base *= 0.3
    return base


def definition_for(term: str, sections, weights) -> tuple[str, str] | None:
    best = None
    for sec in sections:
        for s in sentences(sec.text):
            if not has_word(s, term) or s.endswith('?'):
                continue
            low = s.lower()
            sc = 1.0
            if re.search(re.escape(term) + r's?\s+(is|are|means)\b', low):
                sc += 3
            if re.search(r'called\s+' + re.escape(term), low):
                sc += 3
            sc -= len(s) / 400
            if best is None or sc > best[0]:
                best = (sc, s, sec.id)
    return (shorten(best[1], 150), best[2]) if best else None


def cap(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


# ------------------------------------------------------------------ questions
def accept_for(term: str) -> list[str]:
    t = term.lower()
    acc = {t, t + 's'} if not t.endswith('s') else {t, t[:-1]}
    return sorted(acc)


def cloze(qid: str, sentence: str, term: str, pool: list[str], heading: str, seed) -> dict | None:
    if not has_word(sentence, term):
        return None
    prompt = blank_out(shorten(sentence, 200), term)
    if BLANK not in prompt:
        return None
    rng = _rng(seed, qid)
    distract = [p for p in pool if p.lower() != term.lower() and not has_word(sentence, p) and p not in term and term not in p]
    rng.shuffle(distract)
    distract = distract[:3]
    if not distract:
        return None
    choices = distract + [term]
    rng.shuffle(choices)
    return dict(id=qid, prompt=f'Fill the gap: {prompt}', choices=choices, answerIndex=choices.index(term),
                accept=accept_for(term), explain=shorten(sentence, 220),
                hints=[f'Think back to the part called "{heading}".',
                       f'It is one of the key words in this lesson. It starts with "{term[0].upper()}".',
                       f'The missing word begins "{term[:max(2, len(term) // 2)]}..."'])


# ------------------------------------------------------------------ lesson
def pick_template(text: str) -> str:
    low = text.lower()
    keys = {
        'forest': ['plant', 'leaf', 'leaves', 'tree', 'forest', 'flower', 'seed', 'photosynthesis', 'soil', 'insect'],
        'space': ['planet', 'star', 'orbit', 'moon', 'space', 'solar', 'galaxy', 'astronaut', 'gravity', 'sun '],
        'math': ['fraction', 'number', 'multiply', 'divide', 'equation', 'math', 'shape', 'angle', 'denominator', 'sum'],
        'egypt': ['egypt', 'pyramid', 'pharaoh', 'ancient', 'nile', 'tomb', 'roman', 'history', 'empire', 'king'],
        'ocean': ['ocean', 'sea', 'fish', 'coral', 'reef', 'whale', 'water cycle', 'tide', 'shark', 'marine'],
        'lab': ['matter', 'experiment', 'energy', 'chemical', 'force', 'electric', 'magnet', 'atom', 'liquid', 'heat'],
    }
    scores = {t: sum(low.count(k) for k in ks) for t, ks in keys.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else 'lab'


def _lower_heading(h: str, text: str) -> str:
    """Lower-case heading words unless they are proper nouns in the text (capitalised mid-sentence)."""
    out = []
    for w in h.split():
        bare = re.sub(r'[^A-Za-z]', '', w)
        proper = bare and re.search(r'[a-z,] ' + re.escape(bare) + r'', text) and not re.search(r'' + re.escape(bare.lower()) + r'', text)
        out.append(w if proper else w.lower())
    return ' '.join(out)


def _objective_text(heading: str, terms: list[str], text: str = '') -> str:
    h = _lower_heading(heading.strip().rstrip('.').rstrip('?'), text)
    if h.endswith('...') or not h:
        return f'Explain what the lesson says about {terms[0] if terms else "this topic"}'
    first = h.split()[0].lower()
    if first in ('what', 'how', 'why', 'where', 'when', 'who', 'which'):
        return 'Explain ' + h
    extra = [t for t in terms if t.lower() not in h.lower() and t.rstrip('s') not in h.lower()]
    if extra:
        return f'Explain {h}, including {extra[0]}'
    return f'Explain {h}'


def heuristic_lesson(material: Material, age_band: str = '7-9') -> LessonSpec:
    secs = [s for s in material.sections if sentences(s.text)]
    if not secs:
        raise ValueError('no usable sentences')
    weights = mine_terms(secs)
    # rank sections by information content, keep document order
    def info(s):
        recap = 0.4 if re.search(r'recap|summary|review|quiz|questions|vocabulary', s.heading, re.I) else 1.0
        return recap * sum(score_sentence(x, weights) for x in sentences(s.text)[:6])
    ranked = sorted(secs, key=lambda s: -info(s))
    chosen = sorted(ranked[:3], key=lambda s: secs.index(s))
    while len(chosen) < 3:
        chosen.append(chosen[len(chosen) % len(chosen)])
    concepts, objectives, used_terms, used_sents = [], [], set(), set()
    for i, sec in enumerate(chosen, 1):
        terms = [t for t in section_terms(sec, weights, 8) if t not in used_terms] or section_terms(sec, weights, 3)
        sents = sorted([s for s in sentences(sec.text) if s not in used_sents], key=lambda s: -score_sentence(s, weights)) \
            or sentences(sec.text)
        key = sents[0]
        used_sents.add(key)
        main = terms[:3]
        used_terms.update(main[:1])
        cid = f'c-{i}'
        concepts.append(dict(id=cid, name=cap(main[0]) if main else sec.heading, description=shorten(key, 200),
                             prerequisites=[f'c-{i - 1}'] if i > 1 else []))
        evidence = [dict(sectionId=sec.id, quote=key)]
        if len(sents) > 1:
            evidence.append(dict(sectionId=sec.id, quote=sents[1]))
        objectives.append(dict(
            id=f'obj-{i}', text=_objective_text(sec.heading, main, sec.text), conceptIds=[cid], evidence=evidence,
            rubric=dict(criteria=[f'Mentions {t}' for t in main[:3]] + [f'Gets the main idea: {shorten(key, 120)}'],
                        passingRule='Covers at least two of the criteria in their own words')))
    first = sentences(secs[0].text)
    summary = ' '.join(shorten(s, 160) for s in first[:2])
    lesson = dict(schemaVersion='1', lessonId=f'l-{uuid.uuid4().hex[:10]}', title=material.title, summary=summary,
                  ageBand=age_band, sourceId=material.material_id, sections=[s.wire() for s in material.sections],
                  concepts=concepts, objectives=objectives,
                  suggestedTemplate=pick_template(' '.join(s.text for s in secs)))
    return LessonSpec.model_validate(lesson)


# ------------------------------------------------------------------ world assembly
def assemble_world(p: dict) -> dict:
    """Build a complete WorldSpec dict (camelCase) from content parts.

    p keys: worldId lessonId templateId title subject seed story companion hub goal landmarks npcs
            objectiveIds study puzzles recall collectible rewards sideQuests glossary reviewQuestions source
    """
    t = p['templateId']
    th = THEMES[t]
    objs = p['objectiveIds']
    lms = p['landmarks']
    zones = [dict(id='hub', name=p['hub']['name'], kind='hub', landmark=p['hub'].get('landmark', 'fountain'),
                  description=p['hub']['description'])]
    for i, lm in enumerate(lms):
        zones.append(dict(id=lm['id'], name=lm['name'], kind='landmark', landmark=lm['landmark'],
                          objectiveId=objs[i], description=lm['description']))
    zones.append(dict(id='goal', name=p['goal']['name'], kind='goal', landmark=p['goal']['landmark'],
                      description=p['goal']['description']))
    npcs = []
    for i, n in enumerate(p['npcs']):
        npcs.append(dict(id=n.get('id', f'npc-{i + 1}'), name=n['name'], title=n['title'], archetype=n['archetype'],
                         persona=n['persona'], voice=n['voice'], zoneId=lms[i]['id'], objectiveId=objs[i],
                         greeting=n['greeting'], teach=n['teach'], knowledge=n['knowledge'], check=n['check']))
    col = p['collectible']
    collectibles = [dict(id=col.get('id', 'token'), name=col['name'], zoneId=lms[col.get('zone', 0)]['id'],
                         count=col.get('count', 3), icon=col['icon'])]
    study = []
    for i, cards in enumerate(p['study']):
        for card in cards:
            study.append({**card, 'objectiveId': objs[i], 'zoneId': lms[i]['id']})
    puzzles = []
    for i, plist in enumerate(p['puzzles']):
        for pz in plist:
            puzzles.append({**pz, 'objectiveId': objs[i], 'zoneId': lms[i]['id']})
    fx_kinds = th['fx']
    rewards = []
    for i in range(len(lms)):
        rewards.append(dict(id=f'fx-{i + 1}', kind=fx_kinds[i], zoneId=lms[i]['id'], text=p['rewards'][i]))
    rewards.append(dict(id='fx-final', kind=fx_kinds[3], zoneId='goal', text=p['rewards'][3]))
    quests = []
    for i, lm in enumerate(lms):
        n = npcs[i]
        steps = []
        for card in [c for c in study if c['objectiveId'] == objs[i]]:
            steps.append(dict(kind='study', targetId=card['id'], text=f'Study "{card["title"]}" at the {lm["name"]}'))
        steps.append(dict(kind='talk', targetId=n['id'], text=f'Talk to {n["name"]} at the {lm["name"]}'))
        steps.append(dict(kind='explain', targetId=n['id'], text=f'Explain it to {n["name"]} in your own words'))
        if i == col.get('zone', 0):
            steps.append(dict(kind='collect', targetId=collectibles[0]['id'], count=collectibles[0]['count'],
                              text=f'Collect {collectibles[0]["count"]} {col["name"]}s around the {lm["name"]}'))
        for pz in [z for z in puzzles if z['objectiveId'] == objs[i]]:
            steps.append(dict(kind='puzzle', targetId=pz['id'], text=f'Solve "{pz["title"]}"'))
        for k, s in enumerate(steps, 1):
            s['id'] = f'q{i + 1}-s{k}'
        quests.append(dict(id=f'q{i + 1}', title=p.get('questTitles', [None] * 3)[i] or f'{n["name"]}\'s Lesson',
                           objectiveId=objs[i], prerequisiteIds=[f'q{i}'] if i else [], steps=steps,
                           rewardEffectId=f'fx-{i + 1}'))
    quests.append(dict(id='q-final', title=p.get('finalQuestTitle') or f'Wake the {p["goal"]["name"]}',
                       objectiveId=objs[-1], prerequisiteIds=[f'q{len(lms)}'], rewardEffectId='fx-final',
                       steps=[dict(id='qf-s1', kind='visit', targetId='goal', text=f'Go to {p["goal"]["name"]}'),
                              dict(id='qf-s2', kind='recall', targetId='memory',
                                   text='Memory walk: visit each landmark and remember what you learned there')]))
    memory = [dict(zoneId=lms[i]['id'], objectiveId=objs[i], question=q) for i, q in enumerate(p['recall'])]
    return dict(schemaVersion='1', worldId=p['worldId'], lessonId=p['lessonId'], templateId=t, title=p['title'],
                subject=p['subject'], seed=p.get('seed', 1), story=p['story'], companion=p['companion'],
                zones=zones, npcs=npcs, collectibles=collectibles, puzzles=puzzles, quests=quests,
                memoryLandmarks=memory, rewardEffects=rewards, study=study, sideQuests=p.get('sideQuests', []),
                glossary=p.get('glossary', []), reviewQuestions=p.get('reviewQuestions', []),
                source=p.get('source', 'heuristic'))


def _figure(text: str) -> str:
    low = text.lower()
    if re.search(r'\b(first|next|then|last|finally|step)\b', low):
        return 'ordered-list'
    if re.search(r'\b(but|while|whereas|unlike|both)\b', low):
        return 'compare'
    if re.search(r'\b(into|makes?|turns?|produces?|out of)\b', low):
        return 'arrow-in-out'
    return 'none'


def heuristic_world(lesson: LessonSpec, template_id: str | None = None) -> WorldSpec:
    t = template_id or lesson.suggested_template or 'forest'
    th = THEMES[t]
    seed = int(hashlib.sha1(lesson.lesson_id.encode()).hexdigest()[:6], 16)
    sec_by_id = {s.id: s for s in lesson.sections}
    sections = [s for s in lesson.sections if sentences(s.text)]
    weights = mine_terms(sections)
    objs = lesson.objectives[:5]
    while len(objs) < 3:
        objs = objs + objs[:1]
    objs = objs[:3]
    obj_ids = [o.id for o in objs]
    # sections per objective
    obj_secs = []
    for o in objs:
        ids = [e.section_id for e in o.evidence if e.section_id in sec_by_id]
        obj_secs.append([sec_by_id[i] for i in dict.fromkeys(ids)] or sections[:1])
    # glossary
    gloss, seen = [], set()
    term_pool: list[str] = []
    for secs in obj_secs:
        for sec in secs:
            for term in section_terms(sec, weights, 5):
                if term in seen:
                    continue
                d = definition_for(term, [sec], weights)
                if d:
                    seen.add(term)
                    gloss.append(dict(term=term, meaning=d[0], sectionId=d[1]))
                    term_pool.append(term)
    for term, _ in sorted(weights.items(), key=lambda kv: -kv[1])[:20]:
        if term not in seen and len(term_pool) < 24:
            term_pool.append(term)
    gloss = gloss[:10]
    used_q_sents: set[str] = set()
    qcount = [0]

    def question(prefix: str, secs, prefer_terms=None, avoid_used=True) -> dict | None:
        cand_terms = (prefer_terms or []) + [x for s in secs for x in section_terms(s, weights, 8)]
        for sec in secs:
            sents = sorted(sentences(sec.text), key=lambda s: -score_sentence(s, weights))
            for s in sents:
                if avoid_used and s in used_q_sents:
                    continue
                for term in cand_terms:
                    qcount[0] += 1
                    q = cloze(f'{prefix}', s, term, term_pool, sec.heading, seed)
                    if q:
                        used_q_sents.add(s)
                        return q
        if avoid_used:
            return question(prefix, secs, prefer_terms, avoid_used=False)
        return None

    def must(q, prefix, sec):
        if q:
            return q
        s = sentences(sec.text)[0]
        return dict(id=prefix, prompt=f'True or false: {shorten(s, 180)}', choices=['True', 'False'], answerIndex=0,
                    accept=['true', 'yes'], explain=shorten(s, 200),
                    hints=[f'Look back at "{sec.heading}".', 'The lesson says this.', 'It is true!'])

    names = th['names']
    landmarks, npcs, study, puzzles, recall = [], [], [], [], []
    rng = _rng(seed, 'voices')
    voices = VOICES[:]
    rng.shuffle(voices)
    for i, (o, secs) in enumerate(zip(objs, obj_secs)):
        sec = secs[0]
        head = sec.heading.rstrip('.').rstrip('?')
        terms = section_terms(sec, weights, 6)
        place = th['place'][i]
        lm_id = f'z-{slug(place, 12)}'
        landmarks.append(dict(id=lm_id, name=place, landmark=th['kits'][i],
                              description=f'A place to learn about {head.lower() if not head.endswith("...") else terms[0] if terms else "the lesson"}.'))
        sents = sentences(' '.join(s.text for s in secs))
        name, title = names[i]
        arche = th['archetypes'][i]
        npcs.append(dict(
            name=name, title=title, archetype=arche,
            persona=f'{PERSONA.get(arche, PERSONA["kid"])} Teaches "{head}" from the lesson "{lesson.title}".',
            voice=voices[i],
            greeting=f'Hello there! I\'m {name}. Want to learn about {(terms[0] if terms else head.lower())} with me?',
            teach=[shorten(s, 150) for s in sorted(sents[:5], key=lambda s: -score_sentence(s, weights))[:3]],
            knowledge=[shorten(s, 240) for s in sents[:8]],
            check=must(question(f'check-{i + 1}', secs, terms[:2]), f'check-{i + 1}', sec)))
        # study cards: split the section's sentences in two halves
        halves = [sents[: max(1, (len(sents) + 1) // 2)], sents[(len(sents) + 1) // 2:]]
        cards = []
        for h, part in enumerate(halves):
            if not part:
                continue
            body = [shorten(s, 170) for s in part[:4]]
            body = [' '.join(body[k:k + 2]) for k in range(0, len(body), 2)] if len(body) > 3 else body
            card_text = ' '.join(part)
            kts = [dict(term=g['term'], meaning=g['meaning']) for g in gloss if has_word(card_text, g['term'])][:3]
            ex = next((shorten(s, 160) for s in part if re.search(r'\b(like|for example|such as|imagine)\b', s.lower())), None)
            cid = f'study-{i + 1}{"ab"[h]}'
            cq = None
            for s in part:
                for term in [k['term'] for k in kts] + section_terms(sec, weights, 8):
                    cq = cloze(f'{cid}-q1', s, term, term_pool, sec.heading, seed)
                    if cq:
                        break
                if cq:
                    break
            card = dict(id=cid, title=head if h == 0 else f'{head}: part 2', body=body, keyTerms=kts,
                        figure=_figure(card_text), sourceSectionIds=[s.id for s in secs],
                        checks=[cq] if cq else [])
            if ex:
                card['example'] = ex
            cards.append(card)
        study.append(cards)
        recall.append(must(question(f'recall-{i + 1}', secs, terms[:3]), f'recall-{i + 1}', sec))
        # puzzles
        plist = []
        pid = f'pz-{i + 1}'
        if i == 0:
            gl = [g for g in gloss if any(g['sectionId'] == s.id for s in secs)] or gloss
            pairs = []
            for g in gl[:4]:
                right = blank_out(g['meaning'], g['term']).replace(BLANK, 'it')
                if len(right) > 110:
                    right = shorten(right, 110)
                pairs.append(dict(left=cap(g['term']), right=right))
            if len(pairs) >= 3:
                plist.append(dict(id=pid, kind='match', title='Match the Words',
                                  prompt='Match each word to what it means.', pairs=pairs,
                                  hints=['Read each meaning slowly.', 'Start with the word you are surest about.',
                                         f'{pairs[0]["left"]} goes with: "{shorten(pairs[0]["right"], 50)}"'],
                                  success='Perfect match! Those words are yours now.', evidenceSectionIds=[s.id for s in secs]))
        if i == 1 and not plist:
            items = []
            for s in sents:
                sh = shorten(s, 90)
                if sh not in items:
                    items.append(sh)
            if len(items) >= 3:
                plist.append(dict(id=pid, kind='sequence', title='Put It in Order',
                                  prompt='Put these ideas in the same order as the lesson.', items=items[:4],
                                  hints=['Which idea starts the story?', 'Each idea leads to the next one.',
                                         f'The first one is: "{shorten(items[0], 60)}"'],
                                  success='Great ordering! You followed the whole idea.', evidenceSectionIds=[s.id for s in secs]))
        if not plist:
            qs = [q for q in (question(f'{pid}-q{k}', secs + sections, terms) for k in (1, 2)) if q]
            if not qs:
                qs = [must(None, f'{pid}-q1', sec)]
            plist.append(dict(id=pid, kind='choice', title='Quick Quiz', prompt='Answer the quiz to light the way!',
                              questions=qs, hints=['Think about what you studied here.', 'Look for the key word.',
                                                   'Ask the companion for help if you are stuck.'],
                              success='Quiz complete! Brilliant thinking.', evidenceSectionIds=[s.id for s in secs]))
        puzzles.append(plist)
    review = [q for q in (question(f'review-{k + 1}', obj_secs[k % 3]) for k in range(4)) if q]
    side = [
        dict(id='side-1', title=f'{npcs[2]["name"]}\'s Challenge', giverNpcId='npc-3', zoneId=landmarks[2]['id'],
             objectiveId=obj_ids[0], kind='explain',
             prompt=f'Can you teach me this in your own words? {objs[0].text}.',
             rubric=objs[0].rubric.criteria[:3], reward='a shiny Teacher badge'),
    ]
    extra = [q for q in (question(f'side-2-q{k}', obj_secs[1]) for k in (1, 2)) if q]
    if extra:
        side.append(dict(id='side-2', title=f'{npcs[1]["name"]}\'s Bonus Quiz', giverNpcId='npc-2', zoneId=landmarks[1]['id'],
                         objectiveId=obj_ids[1], kind='quiz', prompt='Try my bonus questions!', questions=extra,
                         reward='a Gold Star'))
    tok, icon = th['token']
    subject = lesson.title.split(':')[0].strip()[:60] or 'Lesson'
    comp = th['companion']
    p = dict(
        worldId=f'{t}-{slug(lesson.title, 20)}-{uuid.uuid4().hex[:4]}', lessonId=lesson.lesson_id, templateId=t,
        title=f'The {th["world"]} of {subject}'[:80], subject=subject, seed=seed,
        story=dict(intro=[f'Welcome to the {th["world"]}! Something has gone dim here.',
                          f'To fix it, we need to really learn about {subject}.',
                          'Study at each place, talk to my friends, and explain what you learn!'],
                   goal=f'Learn the three big ideas of {subject} to wake {th["goal"][0]}.',
                   finale=f'You remembered it all! {th["goal"][0]} shines again thanks to you.'),
        companion=dict(name=comp, greeting=f'Hi, I\'m {comp}! I\'ll help you if you get stuck. Let\'s explore!'),
        hub=dict(name=th['hub'], description='Where every adventure starts.'),
        goal=dict(name=th['goal'][0], landmark=th['goal'][1], description=f'It wakes up when you master {subject}.'),
        landmarks=landmarks, npcs=npcs, objectiveIds=obj_ids, study=study, puzzles=puzzles, recall=recall,
        collectible=dict(name=tok, icon=icon, count=3, zone=0),
        rewards=[f'The {landmarks[0]["name"]} glows brightly!', f'The {landmarks[1]["name"]} comes back to life!',
                 f'The {landmarks[2]["name"]} lights up!', f'{th["goal"][0]} is fully restored!'],
        sideQuests=side, glossary=gloss, reviewQuestions=review, source='heuristic')
    return WorldSpec.model_validate(assemble_world(p))
