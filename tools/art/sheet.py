import sys
from pathlib import Path
from PIL import Image
files = sys.argv[2:]; out = sys.argv[1]
import os; T = int(os.environ.get("T", 360)); cols = min(int(os.environ.get("C", 4)), len(files)); rows = (len(files)+cols-1)//cols
S = Image.new("RGB", (cols*T, rows*T), (255, 244, 220))
for i, f in enumerate(files):
    im = Image.open(f).convert("RGBA"); im.thumbnail((T-10, T-10))
    x = (i%cols)*T + (T-im.width)//2; y = (i//cols)*T + (T-im.height)//2
    S.paste(im, (x, y), im)
S.save(out)
