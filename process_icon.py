import os
from PIL import Image

src_path = r"C:\Users\wylie\.gemini\antigravity\brain\1fe5f4cc-1879-442e-8c0a-021ad1883c1c\media__1776692482474.png"
img = Image.open(src_path).convert("RGBA")

# Let's crop it to be somewhat square for the tray icon.
# The image is wide with text at the bottom. We want to extract the 'P' mark at the top.
width, height = img.size

# Assuming the 'P' mark is centered horizontally and in the upper half.
# Let's do a bounding box of the non-transparent pixels.
bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

# Now we have the cropped logo + text. We want just the top logo part.
# Let's crop the top 50% for the 'P', or let's just make it a square and resize the whole thing.
# Actually, the user gave us the logo, maybe the text looks fine in the taskbar. But it's usually too small.
# I will just create a square version with padding.
width, height = img.size
size = max(width, height)
square = Image.new("RGBA", (size, size), (255, 255, 255, 0))
square.paste(img, ((size - width) // 2, (size - height) // 2))

frontend_dir = r"Z:\GEMINI_CHATS\POLYUNITY_SYNC_APP\frontend"
public_dir = os.path.join(frontend_dir, "public")
electron_dir = os.path.join(frontend_dir, "electron")

os.makedirs(public_dir, exist_ok=True)
os.makedirs(electron_dir, exist_ok=True)

square.save(os.path.join(electron_dir, "icon.png"))
square.save(os.path.join(public_dir, "icon.png"))

# Save ICO format (requires multiple sizes usually, but PIL can do it)
icon_sizes = [(16,16), (32, 32), (48, 48), (64,64), (128,128), (256, 256)]
square.save(os.path.join(electron_dir, "icon.ico"), sizes=icon_sizes)
square.save(os.path.join(public_dir, "favicon.ico"), sizes=icon_sizes)

print("Icons successfully generated.")
