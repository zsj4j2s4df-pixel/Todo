"""Mechanical delivery transforms only; artwork comes from Canva masters."""
from pathlib import Path
from PIL import Image
import hashlib,json
root=Path(__file__).resolve().parent.parent
sheet=Image.open(root/'assets/icon-masters/canva-sheet.png').convert('RGB')
names=['home','list','calendar','bell','settings','plus','check','arrow','notebook']
for n,name in enumerate(names):
    x,y=n%3,n//3
    crop=sheet.crop((round(x*sheet.width/3),round(y*sheet.height/3),round((x+1)*sheet.width/3),round((y+1)*sheet.height/3)))
    # Preserve original pen strokes as an alpha mask; remove paper only.
    rgba=Image.new('RGBA',crop.size)
    rgba.putdata([(73,55,40,max(0,min(255,round((210-min(r,g,b))*255/160)))) for r,g,b in crop.get_flattened_data()])
    rgba.save(root/f'public/icons/ui/{name}.png')
if (root/'assets/icon-masters/canva-app.png').exists():
    app=Image.open(root/'assets/icon-masters/canva-app.png').convert('RGB')
    for size in [32,180,192,512]:
        app.resize((size,size),Image.Resampling.LANCZOS).save(root/f'public/icons/icon-{size}.png')
frame=Image.open(root/'assets/icon-masters/canva-frame.png').convert('RGB')
mask=Image.new('RGBA',frame.size)
mask.putdata([(73,55,40,max(0,min(255,round((190-min(r,g,b))*255/120)))) for r,g,b in frame.get_flattened_data()])
bounds=mask.getbbox()
mask=mask.crop(bounds)
mask.save(root/'public/icons/pen-frame.png')
# Reuse the real top pen stroke for rules, never synthesize vector paths.
mask.crop((12,0,mask.width-12,8)).save(root/'public/icons/pen-line.png')
manifest={'provider':'Canva','sheet_media_id':'MAHYxDzIIZ8','app_media_id':'MAHYxC2VE74','app_source_resolution':list(app.size),'frame_media_id':'MAHYxChA8rA','frame_source_resolution':list(frame.size),'sheet_source_resolution':list(sheet.size),'icons':names,'transform':'Equal 3x3 crop; paper-to-alpha; original stroke geometry retained','sha256':hashlib.sha256((root/'assets/icon-masters/canva-sheet.png').read_bytes()).hexdigest()}
(root/'assets/icon-masters/provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
