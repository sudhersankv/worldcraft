import json
BASE = ("Original game logo for a kids' curiosity adventure game. The exact words \"CURIOSITY CRAFT\" spelled C-U-R-I-O-S-I-T-Y on the first line "
 "and C-R-A-F-T on the second line, in chunky 3D blocky voxel letters built from glossy bevelled cubes, golden-yellow and sunny "
 "yellow blocks with turquoise block outlines and edges, crisp white specular highlights, a soft drop shadow beneath, bright warm "
 "light from top-left. The letter O in CURIOSITY is replaced by a glowing turquoise-and-white voxel cube with a bright golden question mark "
 "glowing on its face. Bold, clean, perfectly readable, correct spelling, centred, nothing else in the image, no other words, no characters. "
 "Original design, not Minecraft, not any existing franchise logo. ")
J = []
for i in range(2):
    J.append({"out": f"cc/logo/v{i+1}.png", "transparent": True, "size": "1536x1024", "prompt": BASE + "Isolated on a fully transparent background."})
for i in range(2):
    J.append({"out": f"cc/logo/g{i+1}.png", "model": "gpt-image-2", "size": "1536x1024", "prompt": BASE + "On a perfectly flat plain pure white #FFFFFF background with no gradient, no texture and no scenery."})
J.append({"out": "cc/logo-mark.png", "transparent": True, "size": "1024x1024", "prompt": ("App icon: a single glossy bevelled voxel cube shown in 3/4 isometric view, made of small turquoise and sky-blue blocks with white "
 "highlights, a big bright golden-yellow glowing question mark built from blocks on its front face, soft golden glow and a few tiny floating "
 "sparkle cubes around it, centred, fills most of the frame, isolated on a fully transparent background, no text other than the question mark. "
 "Original design, not a Mario item block, not Minecraft.")})
print(json.dumps(J))
