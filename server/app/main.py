"""CURIOSITYCRAFT API.  Run from server/:  python -m uvicorn app.main:app --port 8000"""
from __future__ import annotations

import logging
import re
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from . import config, generate, llm, services, store
from .extract import ExtractError, material_from_pdf, material_from_text
from .goat import ask_goat
from .referee import referee
from .schemas import (GenerateLessonRequest, GenerateWorldRequest, GoatRequest, GradeRequest, Material, NpcReplyRequest,
                      SampleMaterialRequest, ServerConfig, SessionEvent, StartSessionRequest, TextMaterialRequest, WorldSpec)

log = logging.getLogger('wc.main')
app = FastAPI(title='CuriosityCraft API', version='1.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

SAMPLES = [
    dict(id='photosynthesis', title='How Plants Make Food: Photosynthesis', templateId='forest',
         worldId='forest-photosynthesis', pdfUrl='/samples/photosynthesis.pdf', text='photosynthesis'),
    dict(id='solar-system', title='Our Solar System', templateId='space',
         worldId='space-solar-system', pdfUrl='/samples/solar-system.pdf', text='solar-system'),
]
SAMPLE_TEXTS = {'fractions', 'pyramids', 'coral-reefs', 'states-of-matter'}


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    log.exception('unhandled error on %s', request.url.path)
    return JSONResponse(status_code=500, content={'detail': 'Something went wrong on the server. Please try again.'})


# ------------------------------------------------------------------ meta
@app.get('/api/health')
async def health():
    return {'ok': True}


@app.get('/api/config')
async def get_config():
    model = config.model_gen()
    if config.has_llm():
        info = await llm.list_models()
        model = llm._pick(model, info.get('enabled') or [])
        if info.get('error') == 'paid_plan_required' or llm.no_credits():
            model += ' (no credits)'
    return ServerConfig(llm=config.has_llm() and not llm.no_credits(), stt=config.has_deepgram(), tts=config.has_deepgram(),
                        exa=config.has_exa(), referee=config.has_typesafe(), model=model).wire()


@app.get('/api/samples')
async def samples():
    return [{k: s[k] for k in ('id', 'title', 'templateId', 'worldId', 'pdfUrl')} for s in SAMPLES]


# ------------------------------------------------------------------ materials
def _save_material(m: Material) -> dict:
    store.put('materials', m.material_id, m.wire())
    return m.wire()


@app.post('/api/materials')
async def upload_material(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(422, 'The uploaded file is empty.')
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, 'That file is too big (max 25 MB).')
    name = file.filename or 'lesson'
    try:
        if data[:5] == b'%PDF-' or name.lower().endswith('.pdf'):
            m = material_from_pdf(data, name)
        else:
            try:
                text = data.decode('utf-8')
            except UnicodeDecodeError:
                raise HTTPException(422, 'Please upload a PDF or a plain-text file.')
            m = material_from_text(re.sub(r'\.\w+$', '', name), text)
    except ExtractError as e:
        raise HTTPException(422, str(e))
    return _save_material(m)


@app.post('/api/materials/text')
async def text_material(body: TextMaterialRequest):
    if len(body.text.strip()) < 80:
        raise HTTPException(422, 'Please paste a bit more lesson text (at least a paragraph).')
    try:
        return _save_material(material_from_text(body.title, body.text))
    except ExtractError as e:
        raise HTTPException(422, str(e))


@app.post('/api/materials/sample')
async def sample_material(body: SampleMaterialRequest):
    sid = body.sample_id.removeprefix('sample-')
    if sid not in {s['id'] for s in SAMPLES} | SAMPLE_TEXTS:
        raise HTTPException(404, f'Unknown sample "{body.sample_id}".')
    p = config.SAMPLES_DIR / 'texts' / f'{sid}.md'
    m = material_from_text('', p.read_text(encoding='utf-8'), kind='sample')
    m.material_id = f'sample-{sid}'
    return _save_material(m)


# ------------------------------------------------------------------ generation
@app.post('/api/lessons/generate')
async def lessons_generate(body: GenerateLessonRequest):
    raw = store.get('materials', body.material_id)
    if not raw and body.material_id.startswith('sample-'):
        await sample_material(SampleMaterialRequest(sample_id=body.material_id))
        raw = store.get('materials', body.material_id)
    if not raw:
        raise HTTPException(404, 'Material not found. Please upload the lesson again.')
    try:
        res = await generate.generate_lesson(Material.model_validate(raw), body.age_band)
    except Exception as e:
        raise HTTPException(422, f'Could not build a lesson from this material: {e}')
    return res.wire()


@app.post('/api/worlds/generate')
async def worlds_generate(body: GenerateWorldRequest):
    lesson = body.lesson
    if not lesson.sections:  # client may send a trimmed lesson
        stored = services.get_lesson(lesson.lesson_id)
        if stored:
            lesson.sections = stored.sections
    store.put('lessons', lesson.lesson_id, lesson.wire())  # keep educator edits to objectives
    res = await generate.generate_world(lesson, body.template_id)
    return res.wire()


@app.get('/api/worlds')
async def worlds_list():
    seen, out = set(), []
    for w in store.all_('worlds') + list(store.samples('worlds').values()):
        if w.get('worldId') in seen:
            continue
        seen.add(w.get('worldId'))
        out.append({k: w.get(k) for k in ('worldId', 'title', 'subject', 'templateId', 'source')})
    return out


@app.get('/api/worlds/{world_id}')
async def world_get(world_id: str):
    w = services.get_world(world_id)
    if not w:
        raise HTTPException(404, 'World not found.')
    return w.wire()


@app.put('/api/worlds/{world_id}')
async def world_put(world_id: str, world: WorldSpec):
    if world.world_id != world_id:
        raise HTTPException(422, 'worldId in the URL and body do not match.')
    res = generate.save_world(world)
    from .validate import errors
    errs = errors(res.diagnostics)
    if errs:
        raise HTTPException(422, 'World is not valid: ' + '; '.join(errs[:8]))
    return res.wire()


# ------------------------------------------------------------------ dialogue
@app.post('/api/npc/reply')
async def npc_reply(req: NpcReplyRequest):
    return (await services.npc_turn(req)).wire()


@app.post('/api/grade')
async def grade(body: GradeRequest):
    world = services.get_world(body.world_id)
    if not world:
        raise HTTPException(404, 'World not found.')
    found = services.find_question(world, body.question_id)
    if not found:
        raise HTTPException(404, 'Question not found.')
    return (await referee(found[0], body.utterance)).wire()


@app.post('/api/goat')
async def goat(body: GoatRequest):
    subject = ''
    if body.world_id:
        w = services.get_world(body.world_id)
        subject = w.subject if w else ''
    return (await ask_goat(body.question, subject)).wire()


@app.get('/api/tts')
async def tts(text: str = Query(..., max_length=1200), voice: str = Query('aura-2-thalia-en')):
    key = config.env('DEEPGRAM_API_KEY')
    if not key:
        raise HTTPException(503, 'Text-to-speech is not configured.')
    if not re.fullmatch(r'aura(-2)?-[a-z]+-[a-z]{2}', voice):
        voice = 'aura-2-thalia-en'
    client = httpx.AsyncClient(timeout=20)
    try:
        req = client.build_request('POST', f'https://api.deepgram.com/v1/speak?model={voice}&encoding=mp3',
                                   json={'text': text}, headers={'Authorization': f'Token {key}'})
        r = await client.send(req, stream=True)
    except httpx.HTTPError as e:
        await client.aclose()
        raise HTTPException(502, f'TTS request failed: {type(e).__name__}')
    if r.status_code != 200:
        body = (await r.aread())[:200]
        await r.aclose()
        await client.aclose()
        log.warning('deepgram tts %s: %s', r.status_code, body)
        raise HTTPException(502, 'TTS provider error.')

    async def gen():
        try:
            async for chunk in r.aiter_bytes():
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(gen(), media_type='audio/mpeg', headers={'Cache-Control': 'public, max-age=86400'})


# ------------------------------------------------------------------ sessions
@app.post('/api/sessions')
async def session_start(body: StartSessionRequest):
    sid = services.start_session(body.world_id)
    await services.record_event(SessionEvent(event_type='session_start', session_id=sid, world_id=body.world_id,
                                             timestamp=services.now_iso()))
    return {'sessionId': sid}


@app.post('/api/sessions/{session_id}/events')
async def session_event(session_id: str, ev: SessionEvent):
    ev.session_id = session_id
    await services.record_event(ev)
    return {'ok': True}


@app.get('/api/sessions/{session_id}/results')
async def session_results(session_id: str):
    s = store.get('sessions', session_id)
    if not s:
        raise HTTPException(404, 'Session not found.')
    return services.compute_results(s).wire()


@app.get('/api/sessions')
async def sessions_list():
    out = []
    for s in store.all_('sessions'):
        try:
            out.append(services.compute_results(s).wire())
        except Exception as e:
            log.warning('bad session %s: %s', s.get('sessionId'), e)
    return out


# ------------------------------------------------------------------ realtime voice (owned by voice.py; included before the SPA catch-all)
try:
    from .voice import router as voice_router
    app.include_router(voice_router)
except Exception as e:  # voice module optional
    log.warning("voice router not loaded: %s", e)


# ------------------------------------------------------------------ static frontend
DIST = config.DIST_DIR


def _dist_file(rel: str) -> Path | None:
    if not DIST.exists():
        return None
    p = (DIST / rel).resolve()
    try:
        p.relative_to(DIST.resolve())
    except ValueError:
        return None
    return p if p.is_file() else None


@app.get('/{path:path}', include_in_schema=False)
async def spa(path: str):
    if path.startswith('api/') or path == 'api':
        raise HTTPException(404, 'Not found')
    f = _dist_file(path) if path else None
    if f:
        return FileResponse(f)
    if path.startswith('samples/') and path.endswith('.pdf'):  # dev without a build
        p = config.SAMPLES_DIR / 'pdfs' / Path(path).name
        if p.is_file():
            return FileResponse(p, media_type='application/pdf')
    if path in ('play', 'play.html', 'play/'):
        f = _dist_file('play.html')
        if f:
            return FileResponse(f)
    idx = _dist_file('index.html')
    if idx:
        return FileResponse(idx)
    if not path:
        return JSONResponse({'ok': True, 'message': 'CuriosityCraft API is running. Build the web app (npm run build) to serve it here.'})
    raise HTTPException(404, 'Not found')

