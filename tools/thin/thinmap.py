import sys,json,numpy as np
from PIL import Image,ImageDraw
tris=json.load(open(sys.argv[1]));out=sys.argv[2];title=sys.argv[3] if len(sys.argv)>3 else ''
W=360
LIMIT=float(sys.argv[4]) if len(sys.argv)>4 else 0.006
def view(az,el):
    a,e=np.radians(az),np.radians(el)
    f=np.array([np.cos(e)*np.sin(a),np.sin(e),np.cos(e)*np.cos(a)])
    r=np.cross([0,1,0],f);r/=np.linalg.norm(r);u=np.cross(f,r);return r,u,f
pts=np.array([t['p'] for t in tris])
imgs=[]
for az,el in [(0,0),(90,0),(0,89),(35,25),(215,25)]:
    r,u,f=view(az,el);X=pts@r;Y=pts@u;Z=pts@f
    mn=np.array([X.min(),Y.min()]);sz=max(X.max()-X.min(),Y.max()-Y.min())*1.08
    img=Image.new('RGB',(W,W),(245,245,242));d=ImageDraw.Draw(img)
    order=np.argsort(Z.mean(1))
    for i in order:
        n=np.array(tris[i]['n']);sh=0.35+0.65*abs(n@f)
        w=tris[i]['w'];thin=w is not None and w<LIMIT
        c=(int(230*sh),int(40*sh),int(40*sh)) if thin else (int(170*sh),)*3
        poly=[((X[i,k]-mn[0])/sz*W+W*0.04,W-((Y[i,k]-mn[1])/sz*W+W*0.04)) for k in range(3)]
        d.polygon(poly,fill=c)
    imgs.append(img)
sheet=Image.new('RGB',(W*5,W+18),'white');[sheet.paste(im,(i*W,18)) for i,im in enumerate(imgs)]
ImageDraw.Draw(sheet).text((4,2),title,fill='black');sheet.save(out)
