import json
from jobs import SCENE, LAND
Z = {
 "seedling-square": ("Seedling Square: a sunny village green hub on a floating island, cobbled cream paths radiating out, a ring of seedling planters, little mushroom-roofed cottages, wooden signposts, and in the centre the wilted Great Bloom, a giant magical flower with drooping coral and pink petals on a mossy stone dais.",
   "The Great Bloom, a giant magical flower WILTED: drooping faded coral-pink petals, bent stem, curled dry leaves, on a mossy round stone dais"),
 "sunflower-meadow": ("Sunflower Meadow: rolling hills of giant golden sunflowers taller than houses, a towering sunflower tower in the middle with a spiral wooden stair around its stem, bees and butterflies, a little picnic windmill, bright midday sun.",
   "A giant sunflower tower: an enormous glossy sunflower on a thick stem with a spiral wooden staircase and a tiny lookout platform under the flower head"),
 "leaf-lab": ("Leaf Lab Treehouse: a huge friendly broadleaf tree holding a whimsical wooden treehouse laboratory with round windows, glass leaf-shaped greenhouse roofs, bubbling green flasks, rope bridges, ladders and lanterns.",
   "A whimsical wooden treehouse laboratory built in a big leafy tree, round windows, a glass greenhouse dome, bubbling green flasks on the balcony"),
 "rootdeep-caverns": ("Rootdeep Caverns: a cutaway hillside revealing cosy underground caverns laced with huge glowing golden and cyan roots, crystal water pools, mole-sized mine carts, lanterns and mushrooms, grassy hilltop above.",
   "A cavern entrance in a grassy mossy hill, framed by thick glowing cyan and golden roots, lanterns, a small mine-cart track leading in"),
 "misty-canopy": ("Misty Canopy: the sunlit treetop canopy of a giant rainforest, broad glossy leaves exhaling soft white vapour wisps, rope walkways and leaf platforms between treetops, dewdrops sparkling, rainbow in the mist.",
   "A treetop platform of giant glossy leaves with a rope swing and soft white mist wisps rising from the leaves, dew drops sparkling"),
 "stream-pond": ("Whispering Stream and Pond: a sparkling turquoise stream winding through reeds and lily pads into a round pond fed by a little waterfall from mossy rocks, stepping stones, frogs on lily pads, a tiny wooden bridge.",
   "A small waterfall pond: mossy rocks with a sparkling turquoise waterfall into a round lily pond with stepping stones"),
 "cloud-peak": ("Cloudmother's Peak: a grassy mountain peak rising above fluffy white clouds, a round open-air cloud shrine with white pillars and a golden rain bell, rainbow arch, sky-blue sky, puffy clouds below drifting past.",
   "A cloud shrine on a small rocky grassy peak: white round pillars, a dome of fluffy cloud, a golden bell, tiny rainbow"),
}
J = []
for k, (scene, land) in Z.items():
    J.append({"out": f"plants/zones/{k}.png", "size": "1536x1024", "prompt": SCENE + scene})
    J.append({"out": f"plants/landmarks/{k}.png", "transparent": True, "prompt": LAND + land})
J.append({"out": "plants/landmarks/great-bloom-open.png", "transparent": True, "prompt": LAND +
  "The Great Bloom, a giant magical flower FULLY BLOOMING: wide open glossy vivid coral, pink and golden petals, glowing sparkles and pollen, lush green leaves, on a mossy round stone dais with tiny flowers"})
print(json.dumps(J))
