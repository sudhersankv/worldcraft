# CuriosityCraft Art Bible: Verdant Hollow

**North star:** a glossy, hand-painted *toy diorama* that a kid wants to reach into. It should be bright, warm, chunky and readable from across a room. **Never** desaturated, grey or purple-graded. If a frame looks "moody", it is wrong.

## 1. Principles from the references

| Reference | What we take from it (principles only, no copying) |
|---|---|
| Link's Awakening (2019, Switch) | Toy/vinyl material with a lacquer specular, tilt-shift blur at the frame edges, a high 3/4 camera, chibi bodies with a head about 1/3 of the height |
| Zelda: Echoes of Wisdom | The same toy look with stronger rim light and very clean, readable silhouettes |
| A Short Hike | A cosy pastel-to-vivid palette, landmarks you can read from far away, warm low sun |
| Tunic | Isometric framing, bold shape language, one hero colour per area |
| Alba: A Wildlife Adventure | Saturated Mediterranean daylight, lots of plant and animal detail |
| Paper Mario TTYD (2024) | Crafted materials (felt, paper, clay), expressive faces, a theatrical diorama staging |
| Ooblets | Candy-coloured plant creatures and chunky rounded UI |
| Kirby/Yoshi crafted worlds | Handmade textures (stitching, fabric weave) that add micro-detail without noise |
| Pinterest: "cozy isometric game art", "stylized diorama" | A floating island base, a rounded grassy edge, a dense prop cluster around one centrepiece |
| Kids' educational UI (Dribbble) | Thick rounded panels, cream paper backgrounds, big friendly icons |

## 2. Palette (vivid, saturated)

| Role | Hex |
|---|---|
| Leaf green (primary) | `#3DDC5A` |
| Deep emerald (shade) | `#14A44D` |
| Lime highlight | `#B6F24A` |
| Sunflower yellow | `#FFC93C` |
| Golden hour orange | `#FF9F1C` |
| Coral / accent | `#FF6B57` |
| Sky blue | `#36B5FF` |
| Turquoise water | `#2EE6D6` |
| Warm cream (UI paper) | `#FFF4DC` |
| Soil / wood | `#9A5B2E` |
| Ink outline / text | `#2B2340` |

Shadows are warm or teal, never grey. Highlights are warm white (`#FFFBEA`).

## 3. Lighting
- The key light is warm sunlight from the **top-left**, about 45°.
- A soft cyan-white **rim light** separates characters from the background.
- Soft ambient occlusion, no hard black shadows.
- Key art uses golden hour. Gameplay zones use bright late-morning daylight.

## 4. Shape language
- Everything is chunky, rounded and bevelled, like vinyl toys, clay or lacquered wood. No sharp spikes on friendly things.
- One clear **centrepiece landmark** per zone, readable as a silhouette.
- Each zone is a small floating diorama island with a rounded grassy edge.

## 5. Characters
- Chibi: head ≈ 1/3 of the height, short limbs, small rounded hands, big sparkle eyes and rosy cheeks.
- Each character has one dominant hue plus one accent, and a unique silhouette (hat, horns, petals, cloud hair).
- The view is 3/4 front for in-world sprites. Portraits are chest-up, showing "talking/happy" and "thinking".

## 6. Prompt rules (used by `tools/art/jobs.py`)
1. Always start with the shared STYLE prefix (glossy vinyl toy, chibi, vivid, top-left sun, rim light, "not based on any franchise").
2. Cutouts: transparent background, no ground and no shadow, full body in frame with a margin.
3. Scenes: an isometric 3/4 diorama with tilt-shift, no people, no text.
4. Science art: soft clay style, **no text or labels** (the UI overlays them).
5. Never name or describe an existing franchise character, logo or asset.

## 7. Production
- Model: OpenAI `gpt-image-1.5` for transparent cutouts (gpt-image-2 rejects transparency) and `gpt-image-2` for opaque scenes, via the Neon AI Gateway (Responses API, streamed).
- The raw PNGs live in `tools/art/raw/` (git-ignored). WebP files at q85 go to `web/public/art/plants/`, and the manifest is `web/src/shared/art.ts`.

## 8. References
- Link's Awakening (2019): https://www.nintendo.com/us/store/products/the-legend-of-zelda-links-awakening-switch/
- Zelda: Echoes of Wisdom: https://www.zelda.com/echoes-of-wisdom/
- A Short Hike: https://ashorthike.com/
- Tunic: https://tunicgame.com/
- Alba: A Wildlife Adventure: https://www.albawildlife.com/
- Paper Mario: The Thousand-Year Door (2024): https://www.nintendo.com/us/store/products/paper-mario-the-thousand-year-door-switch/
- Ooblets: https://ooblets.com/
- Kirby and the Forgotten Land / Yoshi's Crafted World: https://www.nintendo.com/us/store/products/yoshis-crafted-world-switch/
- Pinterest searches: https://www.pinterest.com/search/pins/?q=cozy%20isometric%20game%20art, https://www.pinterest.com/search/pins/?q=stylized%20diorama, https://www.pinterest.com/search/pins/?q=kids%20educational%20game%20ui
- Dribbble: https://dribbble.com/search/isometric-cozy-game
- ArtStation: https://www.artstation.com/search?query=stylized%20diorama
