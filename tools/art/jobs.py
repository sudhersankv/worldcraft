"""Build job lists. python jobs.py <group> > file.json"""
import json, sys
from pathlib import Path

STYLE = ("Original character art for a children's educational adventure game. Glossy stylized 3D toy render, "
 "like a hand-painted vinyl collectible figure photographed in a miniature diorama, chibi proportions (big head about one third "
 "of total height, short limbs, small rounded hands), soft rounded chunky shapes, vivid saturated candy colours "
 "(leaf green #3DDC5A, sunflower yellow #FFC93C, sky blue #36B5FF, coral #FF6B57, warm cream), warm sunlight from the top-left, "
 "soft cyan-white rim light, subtle clay and lacquer specular highlights, clean readable silhouette, highly detailed surface "
 "textures (fabric weave, leaf veins, stitching), big friendly expressive eyes with sparkle highlights, rosy cheeks. "
 "Bright cheerful daylight colour grading, never desaturated or grey or purple-tinted. Not based on any existing franchise character. ")
CUT = ("Single character only, full body head to toe fully in frame with margin, centred, standing in a 3/4 front view, "
 "isolated on a fully transparent background, no ground, no shadow, no text, no border, no frame. ")
PORT = ("Chest-up portrait, character facing 3/4 toward the viewer, centred with a little margin, isolated on a fully transparent "
 "background, no text, no border. ")
SCENE = ("Isometric 3/4 high-angle view of a miniature handcrafted diorama for a cozy children's adventure game, glossy toy-like 3D "
 "render, tilt-shift shallow depth of field at the edges, chunky rounded shapes, vivid saturated colours: lush emerald and lime "
 "grass, sunflower yellow, coral, turquoise water, bright sky blue, warm cream paths; bright warm daylight from top-left, soft "
 "ambient occlusion, crisp highly detailed textures, cheerful and inviting, no people, no text, no UI, no logos. ")
LAND = ("Isometric 3/4 high-angle view of a single standalone game prop on a small round grassy base, glossy toy-like 3D render, "
 "chunky rounded shapes, vivid saturated colours, warm sunlight from top-left, highly detailed, centred and fully in frame, "
 "isolated on a fully transparent background, no text. ")
SCI = ("Clean, colourful kid-friendly science illustration for a children's study card, glossy soft 3D clay style, simple "
 "readable composition on a soft pale mint-to-cream gradient background, bright saturated colours, clear arrows shown as glowing "
 "coloured ribbons, absolutely no text, no letters, no numbers, no labels. ")

CHARS = json.loads(Path(__file__).with_name("chars.json").read_text(encoding="utf-8"))

def out(group):
    J = []
    if group in ("chars", "all"):
        for c in CHARS:
            J.append({"out": f"plants/char/{c['id']}-full.png", "transparent": True, "prompt": STYLE + CUT + c["desc"]})
            if c.get("back"):
                J.append({"out": f"plants/char/{c['id']}-back.png", "transparent": True, "prompt": STYLE +
                  "Single character only, full body head to toe in frame, centred, standing in a 3/4 BACK view (seen from behind, "
                  "looking away over the shoulder slightly), isolated on a fully transparent background, no shadow, no text. " + c["desc"]})
    if group in ("ports", "all"):
        for c in CHARS:
            J.append({"out": f"plants/char/{c['id']}-portrait.png", "transparent": True, "prompt": STYLE + PORT +
              "Expression: happy and talking, mouth open mid-sentence, eyes bright. " + c["desc"]})
    if group == "think":
        for c in CHARS:
            J.append({"out": f"plants/char/{c['id']}-think.png", "transparent": True, "prompt": STYLE + PORT +
              "Expression: thinking and curious, one hand to chin, eyes looking up, small thoughtful smile. " + c["desc"]})
    return J

if __name__ == "__main__":
    print(json.dumps(out(sys.argv[1]), indent=1))
