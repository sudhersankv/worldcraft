"""PDF / text -> Material with sections s1, s2, ..."""
from __future__ import annotations

import re
import uuid
from collections import Counter

from . import config
from .schemas import Material, Section


class ExtractError(ValueError):
    pass


def clean(text: str) -> str:
    text = text.replace('­', '').replace('ﬁ', 'fi').replace('ﬂ', 'fl')
    text = re.sub(r'(\w)-\n(\w)', r'\1\2', text)  # de-hyphenate line breaks
    return re.sub(r'[ \t\r\f\v]+', ' ', text).strip()


def _join(lines: list[str]) -> str:
    return re.sub(r'\s+', ' ', ' '.join(lines)).strip()


def _chunk_paragraphs(paras: list[tuple[str, int]], target: int = 900) -> list[Section]:
    """No headings found: group paragraphs into ~target-char sections."""
    secs, buf, page = [], [], None
    for text, pg in paras:
        if page is None:
            page = pg
        buf.append(text)
        if sum(len(b) for b in buf) >= target:
            secs.append((buf, page))
            buf, page = [], None
    if buf:
        if secs and sum(len(b) for b in buf) < target / 3:
            secs[-1][0].extend(buf)
        else:
            secs.append((buf, page))
    out = []
    for i, (b, pg) in enumerate(secs, 1):
        body = _join(b)
        words = re.findall(r"[A-Za-z][A-Za-z'-]*", body)[:6]
        out.append(Section(id=f's{i}', heading=(' '.join(words) or f'Part {i}') + '...', text=body, page=pg))
    return out


def _finish(title: str, sections: list[Section], kind: str, pages: int) -> Material:
    sections = [s for s in sections if len(s.text) >= 20]
    total = 0
    capped = []
    for s in sections:
        if total >= config.MAX_CHARS:
            break
        s.text = s.text[: config.MAX_CHARS - total]
        total += len(s.text)
        capped.append(s)
    for i, s in enumerate(capped, 1):
        s.id = f's{i}'
    if total < 120 or not capped:
        raise ExtractError('Not enough readable text was found. If this is a scanned PDF, please paste the text instead.')
    return Material(material_id=f'm-{uuid.uuid4().hex[:10]}', title=title.strip()[:120] or 'Untitled lesson',
                    kind=kind, chars=total, pages=pages, sections=capped)


# ------------------------------------------------------------------ text
_MD_HEAD = re.compile(r'^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$')


def _looks_heading(line: str, nxt: str | None) -> bool:
    s = line.strip()
    return (0 < len(s) <= 70 and not re.search(r'[.,;:!?]$', s) and len(s.split()) <= 10
            and s[0].isupper() and nxt is not None and len(nxt.strip()) > len(s))


def sections_from_text(text: str) -> tuple[str | None, list[Section]]:
    lines = clean(text).split('\n')
    title = None
    secs: list[tuple[str, list[str]]] = []
    cur_head, cur = None, []
    for i, raw in enumerate(lines):
        line = raw.strip()
        nxt = next((l for l in lines[i + 1:] if l.strip()), None)
        m = _MD_HEAD.match(raw)
        is_h1 = bool(re.match(r'^\s{0,3}#\s', raw))
        if m or (not line == '' and _looks_heading(line, nxt) and (not cur or cur[-1] == '')):
            head = m.group(1) if m else line
            if is_h1 and title is None and not secs and not any(c.strip() for c in cur):
                title = head
                continue
            if any(c.strip() for c in cur):
                secs.append((cur_head, cur))
            cur_head, cur = head, []
        else:
            cur.append(line)
    if any(c.strip() for c in cur):
        secs.append((cur_head, cur))
    headed = [s for s in secs if s[0]]
    if len(headed) >= 2:
        out = []
        for head, body in secs:
            out.append(Section(id='s0', heading=head or 'Introduction', text=_join([b for b in body if b])))
        return title, out
    # paragraphs
    paras = [(_join(p.split('\n')), 1) for p in re.split(r'\n\s*\n', '\n'.join(lines)) if p.strip()]
    if len(paras) <= 1:  # one big blob: split on sentences
        sents = re.split(r'(?<=[.!?])\s+', paras[0][0]) if paras else []
        paras = [(' '.join(sents[i:i + 4]), 1) for i in range(0, len(sents), 4)]
    return title, _chunk_paragraphs(paras)


def material_from_text(title: str, text: str, kind: str = 'text') -> Material:
    if len(text) > config.MAX_CHARS * 2:
        text = text[: config.MAX_CHARS * 2]
    t, secs = sections_from_text(text)
    pages = max(1, len(text) // 3000 + 1)
    return _finish(title or t or 'My lesson', secs, kind, pages)


# ------------------------------------------------------------------ pdf
def material_from_pdf(data: bytes, filename: str = 'lesson.pdf') -> Material:
    try:
        import pymupdf as fitz
    except ImportError:  # older PyMuPDF
        import fitz

    try:
        doc = fitz.open(stream=data, filetype='pdf')
    except Exception as e:
        raise ExtractError('That file could not be opened as a PDF.') from e
    if doc.needs_pass:
        raise ExtractError('This PDF is password-protected. Please upload an unlocked copy.')
    n_pages = min(doc.page_count, config.MAX_PAGES)
    lines: list[dict] = []  # {text,size,bold,page,block}
    for pno in range(n_pages):
        page = doc[pno]
        d = page.get_text('dict')
        for bi, block in enumerate(d.get('blocks', [])):
            if block.get('type') != 0:
                continue
            for ln in block.get('lines', []):
                spans = [s for s in ln.get('spans', []) if s.get('text', '').strip()]
                if not spans:
                    continue
                txt = clean(''.join(s['text'] for s in ln['spans']))
                if not txt:
                    continue
                size = max(s['size'] for s in spans)
                bold = all((s.get('flags', 0) & 16) or 'bold' in s.get('font', '').lower() for s in spans)
                lines.append({'text': txt, 'size': round(size, 1), 'bold': bool(bold), 'page': pno + 1, 'block': (pno, bi)})
    meta_title = (doc.metadata or {}).get('title') or ''
    doc.close()
    if sum(len(l['text']) for l in lines) < 120:
        raise ExtractError('This PDF has no selectable text (it looks scanned or image-only). '
                           'Please upload a text-based PDF or paste the lesson text instead.')
    weights = Counter()
    for l in lines:
        weights[l['size']] += len(l['text'])
    body = weights.most_common(1)[0][0]
    max_size = max(l['size'] for l in lines)

    def is_head(l):
        t = l['text']
        if len(t) > 90 or len(t.split()) > 12:
            return False
        if l['size'] >= body * 1.15:
            return True
        return l['bold'] and l['size'] >= body and not t.endswith(('.', ',', ';'))

    title = None
    secs: list[tuple[str | None, list[str], int]] = []
    cur_head, cur, cur_page, prev_head_block = None, [], 1, None
    for i, l in enumerate(lines):
        if is_head(l):
            if title is None and not secs and not cur and l['page'] == 1 and l['size'] == max_size and l['size'] > body * 1.3:
                title = l['text'] if title is None else f'{title} {l["text"]}'
                continue
            if cur_head is not None and not cur and prev_head_block == l['block']:
                cur_head += ' ' + l['text']  # wrapped heading
                continue
            if cur:
                secs.append((cur_head, cur, cur_page))
            cur_head, cur, cur_page, prev_head_block = l['text'], [], l['page'], l['block']
        else:
            cur.append(l['text'])
    if cur:
        secs.append((cur_head, cur, cur_page))
    headed = [s for s in secs if s[0]]
    if len(headed) >= 2:
        sections = [Section(id='s0', heading=h or 'Introduction', text=_join(b), page=p) for h, b, p in secs]
    else:
        paras: dict = {}
        for l in lines:
            paras.setdefault(l['block'], []).append(l['text'])
        sections = _chunk_paragraphs([(_join(v), k[0] + 1) for k, v in paras.items()])
    name = title or meta_title or re.sub(r'\.pdf$', '', filename, flags=re.I).replace('_', ' ').replace('-', ' ')
    return _finish(name, sections, 'pdf', n_pages)
