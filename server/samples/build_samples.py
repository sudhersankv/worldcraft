"""Regenerate sample lessons/worlds JSON + PDFs.  Run from server/:  python samples/build_samples.py"""
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from app.extract import material_from_text  # noqa: E402
from app.heuristic import assemble_world, heuristic_lesson, heuristic_world  # noqa: E402
from app.schemas import LessonSpec  # noqa: E402
from app.validate import errors, validate_lesson, validate_world  # noqa: E402

PUBLIC = HERE.parent.parent / 'web' / 'public' / 'samples'


def material(name):
    m = material_from_text('', (HERE / 'texts' / f'{name}.md').read_text(encoding='utf-8'), 'sample')
    m.material_id = f'sample-{name}'
    return m


def write(kind, name, obj):
    (HERE / kind).mkdir(exist_ok=True)
    (HERE / kind / f'{name}.json').write_text(json.dumps(obj, indent=1, ensure_ascii=False), encoding='utf-8')


def check(lesson_d, world_d, name):
    lesson, d1 = validate_lesson(lesson_d)
    world, d2 = validate_world(world_d, lesson)
    errs = errors(d1) + errors(d2)
    warns = [x for x in d1 + d2 if x not in errs]
    if errs:
        raise SystemExit(f'{name}: INVALID\n  ' + '\n  '.join(errs))
    print(f'{name}: ok ({len(warns)} warnings)', *warns[:5], sep='\n  ')


def authored(text_name, module, world_name):
    m = material(text_name)
    L = dict(module.LESSON, schemaVersion='1', ageBand='7-9', sourceId=m.material_id,
             sections=[s.wire() for s in m.sections])
    W = assemble_world(dict(module.WORLD, objectiveIds=[o['id'] for o in L['objectives']]))
    check(L, W, world_name)
    write('lessons', world_name, L)
    write('worlds', world_name, W)


PREVIEWS = [
    # text, template, worldId, title, subject, intro
    ('fractions', 'math', 'math-fractions', 'The Broken Number Bridge', 'Fractions',
     'The bridge to the Number Gate has fallen into pieces. Only fair shares can rebuild it!'),
    ('pyramids', 'egypt', 'egypt-pyramids', 'Secrets of the Sand', 'Ancient Egypt',
     'A sandstorm has buried the secrets of the pyramids. Help the scribes uncover them!'),
    ('coral-reefs', 'ocean', 'ocean-coral-reefs', 'The Fading Reef', 'Coral Reefs',
     'The Heart Reef is losing its colour. Learn how coral lives to bring it back!'),
    ('states-of-matter', 'lab', 'lab-states-of-matter', 'The Melting Mystery', 'States of Matter',
     'Something in the lab keeps melting, boiling and freezing. Solve the mystery!'),
]


def previews():
    for text, tpl, wid, title, subject, intro in PREVIEWS:
        m = material(text)
        lesson = heuristic_lesson(m, '7-9')
        lesson.lesson_id = f'lesson-{text}'
        lesson.suggested_template = tpl
        world = heuristic_world(lesson, tpl)
        W = world.wire()
        W.update(worldId=wid, title=title, subject=subject, source='sample', seed=1000 + len(text))
        W['story']['intro'][0] = intro
        L = lesson.wire()
        check(L, W, wid)
        write('lessons', wid, L)
        write('worlds', wid, W)


def pdf(text_name, out_name):
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz
    md = (HERE / 'texts' / f'{text_name}.md').read_text(encoding='utf-8')
    html = []
    for line in md.splitlines():
        line = line.strip()
        if not line:
            continue
        esc = line.replace('&', '&amp;').replace('<', '&lt;')
        if line.startswith('## '):
            html.append(f'<h2>{esc[3:]}</h2>')
        elif line.startswith('# '):
            html.append(f'<h1>{esc[2:]}</h1>')
        else:
            html.append(f'<p>{esc}</p>')
    css = ('body{font-family:sans-serif;} h1{font-size:22pt;color:#1d5c2e;margin-bottom:10pt;} '
           'h2{font-size:15pt;color:#225588;margin-top:12pt;margin-bottom:4pt;} p{font-size:11.5pt;line-height:1.45;}')
    story = fitz.Story(html='<body>' + ''.join(html) + '</body>', user_css=css)
    out = HERE / 'pdfs' / out_name
    out.parent.mkdir(exist_ok=True)
    writer = fitz.DocumentWriter(str(out))
    rect = fitz.paper_rect('letter')
    where = rect + (54, 54, -54, -54)
    more = 1
    while more:
        dev = writer.begin_page(rect)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
    writer.close()
    doc = fitz.open(str(out))
    doc.set_metadata({'title': md.splitlines()[0].lstrip('# ').strip(), 'author': 'CuriosityCraft sample lesson'})
    doc.saveIncr()
    doc.close()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    shutil.copy(out, PUBLIC / out_name)
    print('pdf', out_name)


if __name__ == '__main__':
    import content_forest
    import content_space
    authored('photosynthesis', content_forest, 'forest-photosynthesis')
    authored('solar-system', content_space, 'space-solar-system')
    previews()
    pdf('photosynthesis', 'photosynthesis.pdf')
    pdf('solar-system', 'solar-system.pdf')
