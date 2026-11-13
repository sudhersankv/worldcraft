# CuriosityCraft 3D assets

Every 3D model in `web/public/assets/3d/` is **CC0 1.0 (public domain)**. Redistribution, modification and commercial use are all allowed, and no attribution is required (we credit the creators anyway). Each pack folder contains its original licence text, either `LICENSE.txt` or, for `nature/`, the `LICENSE.txt` copied from `License_Standard.txt`.

The typed manifest is in `web/src/shared/assets3d.ts` (`ASSETS3D`, `KITS`, `landmarkAsset()`, `npcAsset()`). Scales come from each file's measured bounding box, so 1 unit is about 1 m and a humanoid stands about 1.15 m tall. The skinned characters were re-measured in three.js with the skin applied. Clip names are the real `AnimationClip.name` values from each file. Dev contact sheet: `npx vite --port 5176` from the repo root, then open `/assets/3d/preview.html` (`?filter=tree.` limits it to one prefix).

Look: KayKit (glossy, chunky, chibi) for characters, buildings and props, plus the Quaternius Stylized Nature MegaKit for painterly, round nature. Quaternius poly.pizza models fill the remaining gaps: animals, palms, statues and clouds.

| Folder | Pack | Creator | Source | Licence | Files used |
|---|---|---|---|---|---|
| `kaykit-adventurers/` | KayKit Adventurers Character Pack 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (also kaylousberg.itch.io/kaykit-adventurers) | CC0 | Barbarian, Knight, Mage, Rogue, Rogue_Hooded `.glb`. Animations trimmed to 12 clips (Idle, Walking_A, Running_A, Interact, Cheer, PickUp, Use_Item, Jump_Full_Short, Hit_A, Spellcasting, Sit_Floor_Idle, Unarmed_Idle), textures at 512 px, meshes quantized with KHR_mesh_quantization |
| `kaykit-medieval/` | KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 | CC0 | well, towers, castle, market stalls, home, church, windmill, walls, fences, bridge, flags, barrel, crate, sack, tent, mountains/hills, rocks, water lily/plant, bucket, wheelbarrow, trees (`.gltf` + `.bin` + shared `hexagons_medieval.png`) |
| `kaykit-space/` | KayKit Space Base Bits 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0 | CC0 | base modules, garage, cargo, containers, lander (rocket), landing pad, solar panel, structures, drill, wind turbine, rocks, truck, lights |
| `kaykit-dungeon/` | KayKit Dungeon Remastered 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | CC0 | chest, gold chest, banners, column, decorated pillar, barrel, keg, bottles, crates, box, coins, candle |
| `kaykit-halloween/` | KayKit Halloween Bits 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 | CC0 | shrine with candles, arch/gate, lanterns, lantern post, bench, plaque, path |
| `kaykit-furniture/` | KayKit Furniture Bits 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0 | CC0 | books, table, shelf, cabinet, lamp, chair, cacti |
| `kaykit-restaurant/` | KayKit Restaurant Bits 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0 | CC0 | jars (lab beakers), pot, kitchen table (lab bench), crate |
| `nature/` | Stylized Nature MegaKit (Standard, free) | Quaternius | https://quaternius.com/packs/stylizednaturemegakit.html (download: quaternius.itch.io/stylized-nature-megakit) | CC0 | 36 of 68 models: CommonTree 1-5, Pine 1/2/3/5, TwistedTree 1-3, DeadTree 1, bushes, fern, clover, flowers, grass, mushrooms, plants, pebbles, rock paths, medium rocks, petals. Textures downscaled to 512 px (leaf atlases 1024 px) |
| `polypizza/` | individual Quaternius models (and 1 Kay Lousberg model) via Poly Pizza | Quaternius / Kay Lousberg | https://poly.pizza/u/Quaternius (each model page shows "CC0 1.0") | CC0 | listed below. The animated ones are quantized |

`polypizza/` files (poly.pizza model ID shown in brackets): deer (T6Cs7tmMHJ), fox (Bc97C66HKi), stag (tQdzbZ1Cmw), sheep, which stands in for the goat (rgJXF570ZK), alpaca (bCVFD48i2l), bunny (irZjWFARyl), robot (QCm7qe9uNJ), drone (lF3jeRJwiH), astronaut (OgeSH89Nmx), alien (HYUUkdugoP), clownfish (769fHo3eEB), blobfish (7Jh8vsARfN), bee (HvfIku26CK), mushroom_king (grnFTziU8u), fox_statue (abxyXID5EA), fountain_plaza (sPY1OPVCAX), obelisk, which is Kay Lousberg's "Shrine" (tFxdxO5clk), column (wLubNpOTX4), palm_1/2/3 (A6cKJYFsIb, DsrrAYmucG, P0tgwyXBgr), shipwreck (W2vMzztgIi), computer (or4LLmesjq), signpost (lGC5MHYT85), noticeboard (4MSsNFk5fc), crystal_cluster (STixpWYaTd), crystal_big (pf5lzmgr2J), satellite_dish (OuHQCigiUR), planet_ringed (9g1aIbfR9Y), flask (WJxYta4Z96), cactus_tall (HsEJgRLQWX), cactus_flowers (Da39rzd54k). Added in the Verdant Hollow detail pass: flower_tall (GvfHo0roi3), flower_lily (rHBoS64rRL), flowers_purple (xH5gNlQxAZ), lilypad (TI6ukUlsLh), frog (9Z2V8fpazF), log (L4E32Wee6C), log_moss (nwsYvcI0bC), stump_moss (nFvEbUX6LE), bridge_small (j4KsIuJYnq), dock (XViKoBh2UN), lantern (CtHBJ1ufeW, Kay Lousberg), lantern_hanging (3jzk3YShv1, Kay Lousberg), hut (4MJWbyd6vw), cottage (oJJIRwv6Bo), cloud_1/2 (KdFNOVn1Gf, pjiBiLJwAl), bird (gYYC0gYMnw), tree_puff (QeYQEpgPcC), tree_ball (i4QMw4L64D), berry_bush (TSbIxkDtxF).

Licence texts: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/. Kay Lousberg's licence asks for optional credit ("www.kaylousberg.com"). Quaternius's licence also asks for optional credit (patreon.com/quaternius).

## Known gaps and stand-ins
- **Goat (Exa):** neither family has a CC0 goat, so `goat` uses the Quaternius blocky sheep. Horns can be added in code on the `Head` bone.
- **Turtle:** no turtle exists, so `npc.turtle` is a green-tinted blobfish. Coral and reef also have no models: `coral.*`, `npc.coral` and `landmark.reef` are tinted crystal clusters.
- **Sunflower:** there is no true sunflower. `flower.sunflower` and `landmark.sunflower` use a tall yellow flower, and `npc.sunflower` and `npc.tree` use the Quaternius Mushroom King, tinted.
- **Pyramid, cave and waterfall:** none exists. `landmark.pyramid` is a sandstone-tinted pillar, so build a real pyramid procedurally. `cave.entrance` is a KayKit mountain, and `waterfall.rocks` is a big rock (add the water in code).
- **Reeds:** `water.reeds` is tinted wispy grass.
- **Characters without clips:** `companion` (bee) and `npc.coral` have no animations, so bob them in code.
- **Sci-fi console:** `landmark.console` is the Quaternius "Computer Large".

## Pre-rendered sprites (paused experiment)
`tools/bake/` (Playwright, three.js and Vite) renders the manifest into 2.5D sprites in `web/public/assets/sprites/`: 8-direction character atlases with idle, walk, talk and cheer, 512 px portraits, and `web/src/shared/sprites.ts`. It is not used by the 3D game. Delete `web/public/assets/sprites/` (17 MB) if the sprites stay unused.

## AI-generated art

| Path | What | Source / licence |
|---|---|---|
| `web/public/art/cc/**` | Curiosity Craft beach world (blocky voxel toy style): Surfer Sam (full, surfing, happy/thinking/laughing portraits), beach key art with "WHY?", 6 starter icons (512 px), Surfboard Lab stickers (stone/wood/foam), Why Ladder, journal-card frame | Generated with OpenAI gpt-image-1.5 (transparent cutouts) and gpt-image-2 (opaque scenes) via the Neon AI Gateway. Original designs, owned by the project. |
| `web/public/art/plants/**` | Verdant Hollow plants world (glossy chibi toy diorama): 9 characters (full + portrait, player back view), 7 zone key arts, 8 landmarks (incl. wilted/blooming Great Bloom), 6 science illustrations, title art | Same pipeline as above. Original, owned by the project. |

Prompts and the generator are in `tools/art/` (`gen.py`, `jobs.py`, `cc.py`, `zones.py`, `sci.py`). The style rules are in `docs/ART_BIBLE.md`. The raw PNGs are kept out of git (`tools/art/raw/`).
