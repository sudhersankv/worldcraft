"""Generate art via Neon AI Gateway (OpenAI Responses image_generation, streamed).
Usage: python gen.py jobs.json [concurrency]
jobs.json: [{"out": "rel/path.png", "prompt": "...", "size": "1024x1024", "transparent": true}]
Credentials are read from D:/DSRW/dsrw-bench/.env at runtime and never written anywhere."""
import base64, json, os, sys, time, concurrent.futures as cf
import urllib.request
from pathlib import Path

ENV = Path(r"D:/DSRW/dsrw-bench/.env")
ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "tools" / "art" / "raw"
OUT = ROOT / "web" / "public" / "art"
MODEL_IMG = os.environ.get("IMG_MODEL", "gpt-image-2")

def env():
    d = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip().strip('"').strip("'")
    return d["NEON_AI_GATEWAY_BASE_URL"].rstrip("/"), d["NEON_AI_GATEWAY_TOKEN"]

def call(prompt, size, transparent, MODEL):
    base, tok = env()
    tool = {"type": "image_generation", "model": MODEL, "size": size, "quality": "high",
            "output_format": "png", "background": "transparent" if transparent else "opaque"}
    body = {"model": "gpt-5-mini", "stream": True, "input": prompt, "tools": [tool],
            "tool_choice": {"type": "image_generation"}}
    req = urllib.request.Request(base + "/openai/v1/responses", data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json", "Accept": "text/event-stream"})
    result = None; partial = None; err = None
    with urllib.request.urlopen(req, timeout=600) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"): continue
            data = line[5:].strip()
            if not data or data == "[DONE]": continue
            try: ev = json.loads(data)
            except Exception: continue
            t = ev.get("type", "")
            if t == "response.output_item.done":
                it = ev.get("item", {})
                if it.get("type") == "image_generation_call" and it.get("result"): result = it["result"]
            elif t.endswith("partial_image"):
                partial = ev.get("partial_image_b64") or partial
            elif t in ("error", "response.failed"):
                err = json.dumps(ev)[:400]
            elif t == "response.completed" and not result:
                for it in ev.get("response", {}).get("output", []):
                    if it.get("type") == "image_generation_call" and it.get("result"): result = it["result"]
    if not result: result = partial
    if not result: raise RuntimeError("no image: " + str(err))
    return base64.b64decode(result)

def run(job):
    raw = RAW / job["out"]
    if raw.exists() and not job.get("force"): return job["out"], "skip"
    raw.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(2):
        try:
            t = time.time()
            png = call(job["prompt"], job.get("size", "1024x1024"), job.get("transparent", False), job.get("model") or ("gpt-image-1.5" if job.get("transparent") else MODEL_IMG))
            raw.write_bytes(png)
            from PIL import Image
            webp = OUT / Path(job["out"]).with_suffix(".webp")
            webp.parent.mkdir(parents=True, exist_ok=True)
            im = Image.open(raw)
            if not job.get("transparent"): im = im.convert("RGB")
            im.save(webp, "WEBP", quality=85, method=6)
            return job["out"], f"ok {time.time()-t:.0f}s {webp.stat().st_size//1024}KB"
        except Exception as e:
            msg = str(e)
            if hasattr(e, "read"):
                try: msg += " " + e.read().decode()[:300]
                except Exception: pass
            last = msg
    return job["out"], "FAIL " + last[:300]

if __name__ == "__main__":
    jobs = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    with cf.ThreadPoolExecutor(n) as ex:
        for out, st in ex.map(run, jobs):
            print(out, st, flush=True)
