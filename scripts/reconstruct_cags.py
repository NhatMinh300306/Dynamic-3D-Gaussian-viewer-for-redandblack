#!/usr/bin/env python3
"""Batch reconstruct independent CAGS frames on a machine with CAGS installed.
Not for inter-frame residual streams: those must use python -m cags.decode.
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',required=True)
    p.add_argument('--output',required=True)
    p.add_argument('--mode',choices=['quantize','tile'],required=True)
    p.add_argument('--iteration',type=int,default=30000)
    p.add_argument('--draco',action='store_true')
    p.add_argument('--dry-run',action='store_true')
    a=p.parse_args()
    source=Path(a.root).expanduser().resolve();dest=Path(a.output).expanduser().resolve()
    if not source.is_dir():p.error('Root không tồn tại.')
    if source==dest or source in dest.parents or dest in source.parents:p.error('Nguồn và đích phải tách biệt.')
    if dest.exists():p.error('Chọn output chưa tồn tại để bảo toàn dữ liệu.')
    if any(source.rglob('*.mask.npz')):p.error('Có mask inter-frame: dùng cags.decode theo thứ tự, không giải mã từng frame độc lập.')
    directories=sorted(source.glob(f'**/point_cloud/iteration_{a.iteration}'))
    if not directories:p.error('Không thấy point_cloud/iteration_*.')
    for iteration_dir in directories:
        frame=iteration_dir.parent.parent
        relative=frame.relative_to(source)
        out=dest/relative
        cmd=[sys.executable,'-m','cags.'+a.mode,'-s',str(out),'-d',str(out),'-i',str(a.iteration)]
        if a.draco:cmd.append('--draco')
        cmd.append('--dequantize' if a.mode=='quantize' else '--stitching')
        print(f'{relative}: {cmd}',flush=True)
        if a.dry_run:continue
        # Copy all sidecars and metadata before reconstructing. Never modify source.
        shutil.copytree(frame,out)
        subprocess.run(cmd,check=True)
        if not (out/'point_cloud'/f'iteration_{a.iteration}'/'point_cloud.ply').is_file():
            raise RuntimeError(f'CAGS không xuất point_cloud.ply tại {out}. Kiểm tra phiên bản và loại output.')
    if not a.dry_run:print(f'Hoàn tất: {dest}. Dùng import_sequence.py để đưa lên viewer.')
if __name__=='__main__':main()
