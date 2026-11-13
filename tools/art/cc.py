import json
V = ("Original art for a children's curiosity adventure game. Glossy blocky voxel toy style: everything built from chunky cubes "
 "and rounded-edge blocks like a premium painted wooden/vinyl voxel figure, cube-shaped head about 1/3 of total height, rectangular "
 "body and limbs, pixel-crisp block textures with subtle bevels and soft lacquer highlights, vivid saturated candy colours "
 "(ocean turquoise #2EE6D6, sky blue #36B5FF, sunny yellow #FFC93C, coral #FF6B57, leaf green #3DDC5A, warm sand #FFD89A), bright warm "
 "sunlight from top-left, soft cyan rim light, highly detailed, friendly expressive face with big bright eyes and a wide smile. "
 "Bright cheerful colour grading, never grey or desaturated. Original design, not Minecraft, not based on any existing game or franchise. ")
CUT = "Single subject only, fully in frame with margin, centred, isolated on a fully transparent background, no ground, no shadow, no text, no border. "
PORT = "Chest-up portrait facing 3/4 toward the viewer, centred, isolated on a fully transparent background, no text, no border. "
SAM = ("Surfer Sam: a laid-back blocky voxel surfer dude, sun-tanned skin, messy spiky bleached-blond block hair, cool turquoise "
 "sunglasses, a coral-and-yellow Hawaiian flower shirt open over a white tank top, sky-blue board shorts with wave patterns, bare blocky feet, shell necklace")
J = [
 {"out":"cc/sam-full.png","transparent":True,"prompt":V+CUT+"Full body head to toe, standing in 3/4 front view, holding a tall bright surfboard with a sunny yellow and turquoise stripe tucked under one arm, giving a friendly shaka wave with the other hand. "+SAM},
 {"out":"cc/sam-happy.png","transparent":True,"prompt":V+PORT+"Expression: happy and talking, mouth open mid-sentence, sunglasses pushed up on the forehead showing friendly eyes. "+SAM},
 {"out":"cc/sam-think.png","transparent":True,"prompt":V+PORT+"Expression: thinking and curious, one blocky hand on the chin, eyes looking up, sunglasses pushed up on the forehead, a small question-mark sparkle near the head. "+SAM},
 {"out":"cc/sam-laugh.png","transparent":True,"prompt":V+PORT+"Expression: laughing out loud, eyes squeezed shut happily, head tilted back, big open grin, sunglasses slipping down the nose. "+SAM},
 {"out":"cc/penny.png","transparent":True,"prompt":V+PORT+"Expression: happy and talking. Penny the penguin: a cute blocky voxel penguin explorer from an ice world, glossy navy and white cube body, bright orange beak and feet, a knitted sky-blue scarf and a woolly bobble hat, a tiny ice-crystal badge, snowflakes sparkling around."},
 {"out":"cc/rocky.png","transparent":True,"prompt":V+PORT+"Expression: happy and talking. Rocky: a friendly blocky voxel rock-golem character from a volcano world, chunky dark basalt cube body with glowing orange-yellow lava cracks, warm glowing eyes, a little hard hat with a lamp, tiny embers floating, cheerful grin."},
 {"out":"cc/nova.png","transparent":True,"prompt":V+PORT+"Expression: happy and talking. Nova: a cheerful blocky voxel kid astronaut from a space world, a white and coral spacesuit with mission patches, a round glass bubble helmet with a starry reflection, purple-blue starry background glow only inside the visor, a tiny orbiting planet charm."},
 {"out":"cc/keyart.png","size":"1536x1024","prompt":V+"Wide isometric 3/4 diorama key art, tilt-shift: a sunny blocky voxel beach island with turquoise cube waves, palm trees made of blocks, a little surf shack, sand blocks, two blocky surfers riding waves and Surfer Sam (blond spiky hair, turquoise sunglasses, Hawaiian shirt) waving from the shore, and a curious blocky kid explorer with a backpack in the foreground looking up in wonder at a huge glowing golden 'WHY?' made of glowing blocks floating in the bright blue sky. The only text in the image is 'WHY?'. Leave some open sky."},
]
I = {"wave":"a curling ocean wave made of turquoise and white voxel blocks with foam","surfboard":"a surfboard with yellow and turquoise stripes","sun":"a smiling bright yellow sun with block rays","fish":"a cute orange and coral tropical fish","sand":"a little pile of golden sand cubes with a seashell and a tiny bucket","wind":"swirling gusts of wind as curved sky-blue and white block ribbons with a tiny leaf"}
for k,v in I.items():
    J.append({"out":f"cc/icons/{k}.png","transparent":True,"size":"1024x1024","prompt":V+CUT+"A single chunky game icon, simple bold readable silhouette, centred: "+v+"."})
S = {"stone":"Funny sticker: a heavy grey stone-block surfboard SINKING nose-first into turquoise blocky water with big bubbles rising and a surprised little crab on top, comedic.",
     "wood":"Sticker: a warm brown wooden plank surfboard FLOATING calmly on turquoise blocky water, small ripples, a little sparkle, a happy face on the board.",
     "foam":"Sticker: a bright white-and-coral foam surfboard RIDING high on top of a curling turquoise voxel wave, spray and sparkles, triumphant feel."}
for k,v in S.items():
    J.append({"out":f"cc/lab/{k}.png","transparent":True,"prompt":V+CUT+"Die-cut sticker style with a thick white sticker outline. "+v})
J.append({"out":"cc/why-ladder.png","transparent":True,"size":"1024x1536","prompt":V+CUT+"A tall glowing voxel ladder of five rungs climbing up into the sky, each rung a glowing block of a different colour (turquoise, green, yellow, orange, coral) going from bottom to top, small glowing question-mark blocks floating beside it, a little star at the top. No text."})
J.append({"out":"cc/journal-frame.png","transparent":True,"size":"1024x1536","prompt":V+CUT+"An empty journal card frame for a kids' game: a cream paper card with a chunky blocky voxel border in turquoise and sand blocks, little shell and starfish block decorations in the corners, a tiny bookmark ribbon, the large centre area plain empty cream for overlaid content. No text."})
print(json.dumps(J))
