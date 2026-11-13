# Curiosity Craft — Build Brief (from Gabe, 13:06, Nov 13 2026)

Hard deadline **4:00 PM**. 3-minute demo, at least 2 modalities, measurable learning outcomes. Working demo beats more features.

**Pitch hook:** *Ask why. Fail freely. Learn by teaching.*

## Idea
A Minecraft-like world (original blocky style, not Minecraft assets) where kids are rewarded for being curious, not for being right.
1. Spawn somewhere random (demo: a beach with surfers; others: ice world, water).
2. Roam for 30 seconds.
3. A **Wonder Board** appears: draw, type or say what you wonder about (e.g. a wave or a surfboard).
4. The game turns it into 3 concrete questions and a destination world (surf world).
5. A character (**Surfer Sam**) answers briefly and always ends with a "why?" hook; every follow-up goes one level deeper on the **Why Ladder**.
6. **Try it**: build a surfboard from stone, wood or foam and see what floats. Wrong = funny + hint, never a penalty.
7. Every question becomes a card in the **Curiosity Journal**.
8. Parents and teachers get a **report**.

## Concepts
1. Curiosity is the score (XP for asking why).
2. Failure is content.
3. Wonder Board (draw / type / say → 3 questions → destination).
4. Try it, don't just hear it.
5. Real-world bridge ("try at home" experiment + a real book, job or person).
6. **Measurable:** questions asked, deepest why-level, concepts touched, attempts, before/after on one recall question.
7. **Safe by design:** no open web, no kid personal data, AI answers only from a per-world fact sheet, and the engine (not the LLM) awards progress.
8. **8 languages (lucky 8):** en, es, zh, fr, pt, nl, hi, ta.

## Demo script (3 min)
| Step | Time |
|---|---|
| Hook | 15 s |
| Spawn, roam, Wonder Board, draw a wave | 30 s |
| Ask Sam by voice, 2–3 whys deep | 45 s |
| Surfboard Lab: stone sinks, foam floats | 30 s |
| Journal + parent report with before/after | 30 s |
| corvus.gent live counters + votes, close | 30 s |

## Priorities
1. Core loop rock-solid (`?demo=1` skips the 30 s timer; works with keyboard, gamepad and mouse, plus typed input if the mic fails; Playwright test of the full loop).
2. Wonder Board drawing → vision LLM questions (fallback: 6 starter buttons).
3. Grounded NPC + Why Ladder (JSON `{answer, whyHook, conceptIds, levelUp}`; the engine awards levels).
4. Try-it physics: Surfboard Lab (+ Wave Maker).
5. Journal + parent report (numbers from the event log; Share link).
6. 8 languages (`?lang=` → localStorage → browser → en; speech locales; Noto Sans Tamil/Devanagari).
7. Allow iframe from https://corvus.gent (CSP frame-ancestors; mic, gamepad and fullscreen in the iframe; postMessage `{type:"cc_event", name, data}`).
8. Later: data-driven worlds (Ice Cave, Volcano, Space Dock).

Judges: Epic (kids' digital library), Khan-Academy-type educators, and an audience vote. Main judge Steve: "being a kid: you can ask why", "if I give you everything you won't learn", "failure isn't failure", be original, create and share.
