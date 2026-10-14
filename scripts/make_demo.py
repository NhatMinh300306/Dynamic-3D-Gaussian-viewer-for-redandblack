#!/usr/bin/env python3
"""Synthetic animated Gaussian figure. Not the 8i redandblack dataset."""
import json,math,random,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'public/data/demo'
C0=0.28209479177387814
PROPS=['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3']

def figure(frame,count):
    rng=random.Random(14);phase=frame*2*math.pi/24;out=[]
    # Ellipsoid body sections with deterministic samples, animated limbs and torso.
    parts=[((0,.57,0),(.15,.19,.14),(0.78,.68,.50),0),
           ((0,.15,0),(.24,.36,.14),(.66,.105,.075),1),
           ((-.12,-.45,0),(.095,.30,.105),(.055,.07,.06),2),
           ((.12,-.45,0),(.095,.30,.105),(.055,.07,.06),3),
           ((-.32,.13,0),(.075,.31,.075),(.69,.12,.075),4),
           ((.32,.13,0),(.075,.31,.075),(.69,.12,.075),5)]
    for j in range(count):
        center,sc,color,part=parts[j%len(parts)]
        u=rng.uniform(-1,1);a=rng.uniform(0,2*math.pi);rad=math.sqrt(1-u*u)
        x=rad*math.cos(a)*sc[0];y=u*sc[1];z=rad*math.sin(a)*sc[2]
        if part in (2,3,4,5):
            swing=math.sin(phase+(0 if part in (2,5) else math.pi))*.55
            y,z=y*math.cos(swing)-z*math.sin(swing),y*math.sin(swing)+z*math.cos(swing)
        x+=center[0];y+=center[1]+.025*math.cos(phase*2);z+=center[2]
        tint=.80+.2*rng.random();rgb=[min(1,c*tint) for c in color]
        s=math.log(.030 if count>1000 else .048)
        out.append([x,y,z,*[(c-.5)/C0 for c in rgb],2.2,s,s,s,1,0,0,0])
    return out

def write_ply(file,rows):
    file.parent.mkdir(parents=True,exist_ok=True)
    header='ply\nformat binary_little_endian 1.0\ncomment Synthetic demo - Gaussian Studio\nelement vertex '+str(len(rows))+'\n'+''.join('property float '+p+'\n' for p in PROPS)+'end_header\n'
    with file.open('wb') as f:
        f.write(header.encode('ascii'))
        for row in rows:f.write(struct.pack('<14f',*row))

def main():
    frames=[]
    for i in range(24):
        assets={}
        for q,n in [('preview',480),('detail',2400)]:
            relative=f'{q}/{i:06d}.ply';file=ROOT/relative;write_ply(file,figure(i,n));assets[q]={'url':relative,'bytes':file.stat().st_size,'format':'ply'}
        frames.append({'id':i,'assets':assets})
    m={'version':1,'mode':'sequence','name':'Kinetic study','synthetic':True,'fps':24,'defaultQuality':'detail',
       'description':'Demo Gaussian tổng hợp · 24 frame · Không phải dữ liệu 8i redandblack',
       'qualities':[{'id':'preview','label':'Preview · 480 splats'},{'id':'detail','label':'Detail · 2,400 splats'}],
       'transform':{'rotationDegrees':[0,0,0],'scale':1},'frames':frames}
    (ROOT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Generated synthetic demo: {ROOT}')
if __name__=='__main__':main()
