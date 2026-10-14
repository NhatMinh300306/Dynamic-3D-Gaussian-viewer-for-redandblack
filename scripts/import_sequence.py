#!/usr/bin/env python3
"""Copy full Gaussian frames into a portable web dataset. Python standard library only."""
import argparse
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

REQUIRED = {'x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'}

def inspect_ply(file):
    with open(file,'rb') as f:
        if f.readline().strip()!=b'ply': raise ValueError(f'Không phải PLY: {file}')
        props=set(); count=0; vertex=False; consumed=4; fmt=''
        while consumed < 1024*1024:
            line=f.readline();consumed+=len(line)
            if not line: raise ValueError(f'PLY thiếu end_header: {file}')
            parts=line.decode('ascii','strict').strip().split()
            if not parts: continue
            if parts[0]=='format': fmt=parts[1]
            if parts[0]=='element':
                vertex=parts[1]=='vertex'
                if vertex: count=int(parts[2])
            if parts[0]=='property' and vertex:
                if parts[1]=='list':raise ValueError(f'Không hỗ trợ thuộc tính list trong vertex: {file}')
                props.add(parts[-1])
            if parts[0]=='end_header':break
        else:raise ValueError(f'Header quá lớn: {file}')
        if fmt not in ('ascii','binary_little_endian','binary_big_endian'):raise ValueError(f'Format PLY không hợp lệ: {file}')
        if count<=0:raise ValueError(f'PLY không có Gaussian: {file}')
        missing=REQUIRED-props
        if missing:raise ValueError(f'{file}\nThiếu thuộc tính Gaussian: {sorted(missing)}. Có thể là point cloud gốc hoặc CAGS chưa giải mã.')
    return count

def frame_id(file,root):
    relative=file.relative_to(root)
    for part in reversed(relative.parts[:-1]):
        m=re.fullmatch(r'(?:dynamic_|frame[_-]?)?(\d+)',part,re.I)
        if m:return int(m.group(1))
    stem=file.stem
    m=re.fullmatch(r'(?:frame[_-]?)?(\d+)',stem,re.I) or re.search(r'[_-](\d+)$',stem)
    if m:return int(m.group(1))
    # root itself may be a frame directory for a single-frame dataset.
    m=re.fullmatch(r'(?:dynamic_|frame[_-]?)?(\d+)',root.name,re.I)
    if m:return int(m.group(1))
    raise ValueError(f'Không xác định được frame ID: {relative}. Dùng thư mục frame1450/dynamic_1450/1450 hoặc tên 1450.ply.')

def quality_id(file,root):
    for part in reversed(file.relative_to(root).parts[:-1]+(root.name,)):
        m=re.search(r'(?:^|_)res(1|2|4|8)$',part,re.I)
        if m:return 'res'+m.group(1)
    return 'original'

def discover(root,pattern='**/*.ply',iteration=30000,fixed_quality=None,start=None,end=None,resolutions=None):
    root=Path(root).expanduser().resolve()
    if not root.is_dir():raise ValueError(f'Thư mục không tồn tại: {root}')
    found={};skipped=0
    for file in sorted(root.glob(pattern)):
        if not file.is_file() or file.suffix.lower() not in ('.ply','.spz','.splat','.ksplat'):continue
        if 'quantized' in file.name.lower() or any(p.endswith('_tiles') for p in file.parts):skipped+=1;continue
        iterations=[int(m.group(1)) for p in file.parts if (m:=re.fullmatch(r'iteration_(\d+)',p))]
        if iterations and iterations[-1]!=iteration:continue
        q=fixed_quality or quality_id(file,root)
        if resolutions and q not in {'res'+str(r) for r in resolutions}:continue
        fid=frame_id(file,root)
        if start is not None and fid<start or end is not None and fid>end:continue
        if fid in found.get(q,{}):raise ValueError(f'Trùng {q}, frame {fid}:\n{found[q][fid]}\n{file}\nHãy trỏ --root vào đúng một bộ kết quả hoặc chọn --glob. Không trộn original và reconstructed.')
        if file.suffix.lower()=='.ply':inspect_ply(file)
        found.setdefault(q,{})[fid]=file
    return found,skipped

def validate_frames(groups,intersection=False,allow_gaps=False):
    if not groups:raise ValueError('Không tìm thấy frame hợp lệ. Kiểm tra --root, --iteration, --glob hoặc giải mã CAGS trước.')
    sets={q:set(g) for q,g in groups.items()};union=set.union(*sets.values());common=set.intersection(*sets.values())
    if any(s!=union for s in sets.values()) and not intersection:
        message='\n'.join(f'{q} thiếu: {sorted(union-s)[:30]}' for q,s in sets.items() if s!=union)
        raise ValueError('Các quality không có cùng frame ID.\n'+message+'\nCó thể dùng --intersection để chỉ lấy phần giao, hoặc --start/--end.')
    ids=sorted(common if intersection else union)
    if not ids:raise ValueError('Không có frame chung giữa các quality.')
    if not allow_gaps and any(b!=a+1 for a,b in zip(ids,ids[1:])):raise ValueError('Có khoảng trống giữa frame ID. Hoàn thiện dữ liệu hoặc dùng --allow-gaps (thời gian sẽ bị nén theo thứ tự còn lại).')
    return ids

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',help='Thư mục chứa một bộ output Dynamic-LapisGS hoặc CAGS reconstructed')
    p.add_argument('--quality-root',action='append',default=[],metavar='ID=PATH',help='Lặp lại để ghép các thư mục quality hoặc original/CAGS cùng frame ID')
    p.add_argument('--scene',default='My Gaussian sequence')
    p.add_argument('--output',required=True,help='Thư mục mới bên trong public/data')
    p.add_argument('--fps',type=float,default=30)
    p.add_argument('--iteration',type=int,default=30000)
    p.add_argument('--glob',default='**/*.ply',help='Có thể dùng **/*.spz hoặc **/point_cloud.ply')
    p.add_argument('--res',type=int,nargs='+',choices=[1,2,4,8])
    p.add_argument('--start',type=int);p.add_argument('--end',type=int)
    p.add_argument('--rotation',type=float,nargs=3,default=[0,0,0],metavar=('X','Y','Z'))
    p.add_argument('--scale',type=float,default=1)
    p.add_argument('--intersection',action='store_true');p.add_argument('--allow-gaps',action='store_true')
    p.add_argument('--dry-run',action='store_true',help='Chỉ kiểm tra, chưa sao chép')
    p.add_argument('--force',action='store_true',help='Thay thư mục do chính script này từng tạo; không sửa nguồn')
    args=p.parse_args(argv)
    if bool(args.root)==bool(args.quality_root):p.error('Chọn đúng một trong --root hoặc các --quality-root.')
    if not 1<=args.fps<=120 or args.scale<=0:p.error('fps phải 1..120 và scale > 0.')
    groups={};skipped=0;sources=[]
    if args.root:sources=[(None,Path(args.root).expanduser().resolve())]
    else:
        for value in args.quality_root:
            if '=' not in value:p.error('--quality-root cần ID=PATH')
            q,d=value.split('=',1)
            if not re.fullmatch(r'[A-Za-z0-9_-]+',q):p.error('Quality ID không hợp lệ.')
            if q in [x[0] for x in sources]:p.error('Quality ID trùng.')
            sources.append((q,Path(d).expanduser().resolve()))
    output=Path(args.output).expanduser().resolve()
    for _,source in sources:
        if output==source or output in source.parents or source in output.parents:raise ValueError('--output và --root phải tách biệt, không chứa nhau.')
    for q,root in sources:
        data,n=discover(root,args.glob,args.iteration,q,args.start,args.end,args.res)
        if groups.keys()&data.keys():raise ValueError('Quality ID bị trùng giữa các root.')
        groups.update(data);skipped+=n
    ids=validate_frames(groups,args.intersection,args.allow_gaps)
    order=sorted(groups,key=lambda q:({'res8':0,'res4':1,'res2':2,'res1':3}.get(q,4),q))
    total=sum(groups[q][i].stat().st_size for q in order for i in ids)
    print(f'{len(ids)} frame: {ids[0]}..{ids[-1]} | qualities: {", ".join(order)} | copy: {total/1024**2:.1f} MiB')
    if skipped:print(f'Đã bỏ qua {skipped} file quantized/tile; chỉ dùng Gaussian hoàn chỉnh.')
    if args.dry_run:return
    if output.exists() and not(args.force and (output/'.viewer-dataset').is_file()):raise ValueError('Output đã tồn tại. Chọn tên mới hoặc --force nếu đây là dataset do script tạo.')
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary=Path(tempfile.mkdtemp(prefix='viewer-import-',dir=output.parent))
    try:
        frames=[]
        for i in ids:
            assets={}
            for q in order:
                source=groups[q][i];relative=Path(q)/f'{i:06d}{source.suffix.lower()}'
                target=temporary/relative;target.parent.mkdir(exist_ok=True);shutil.copy2(source,target)
                assets[q]={'url':relative.as_posix(),'format':source.suffix.lower()[1:],'bytes':source.stat().st_size}
            frames.append({'id':i,'assets':assets})
        document={'version':1,'mode':'sequence','name':args.scene,'description':'Full Gaussian frames · imported from your training/reconstruction output',
                  'fps':args.fps,'defaultQuality':order[0],'qualities':[{'id':q,'label':q} for q in order],
                  'transform':{'rotationDegrees':args.rotation,'scale':args.scale},'frames':frames}
        (temporary/'manifest.json').write_text(json.dumps(document,ensure_ascii=False,indent=2),encoding='utf-8')
        (temporary/'.viewer-dataset').write_text('Generated by import_sequence.py; source files are not modified.\n')
        if output.exists():shutil.rmtree(output)
        temporary.rename(output)
    except BaseException:
        shutil.rmtree(temporary,ignore_errors=True);raise
    print(f'Saved: {output/"manifest.json"}')
    print('Nhập URL tương ứng với public/, ví dụ ./data/redandblack/manifest.json')

if __name__=='__main__':
    try:main()
    except (ValueError,OSError) as error:print(f'ERROR: {error}',file=sys.stderr);sys.exit(1)
