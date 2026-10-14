export function validateManifest(raw, baseURL) {
  if (!raw || raw.version !== 1) throw new Error('Manifest cần có version: 1.');
  const mode = raw.mode ?? 'sequence';
  if (!['sequence', 'scene'].includes(mode)) throw new Error('mode phải là sequence hoặc scene.');
  const fps = Number(raw.fps ?? 30);
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('fps phải từ 1 đến 120.');
  if (!Array.isArray(raw.frames) || !raw.frames.length) throw new Error('Manifest chưa có frames.');
  if (mode === 'scene' && raw.frames.length !== 1) throw new Error('Chế độ scene cần đúng 1 frame.');
  if (!Array.isArray(raw.qualities) || !raw.qualities.length) throw new Error('Manifest chưa có qualities.');
  const ids = raw.qualities.map(q => q.id);
  if (ids.some(id => typeof id !== 'string' || !/^[\w-]+$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error('Mỗi quality cần id riêng gồm chữ, số, dấu gạch.');
  }
  const seen = new Set();
  const frames = raw.frames.map((f, i) => {
    const id = String(f.id ?? i);
    if (seen.has(id)) throw new Error(`Frame bị trùng: ${id}`);
    seen.add(id);
    const assets = {};
    for (const q of ids) {
      const a = f.assets?.[q];
      if (!a || typeof a.url !== 'string') throw new Error(`Frame ${id} thiếu quality ${q}.`);
      const url = new URL(a.url, baseURL);
      if (!['http:', 'https:', 'blob:'].includes(url.protocol)) throw new Error('URL chỉ hỗ trợ HTTP/HTTPS hoặc file cục bộ đã chọn.');
      const format = String(a.format ?? url.pathname.split('.').pop()).toLowerCase();
      if (!['ply', 'spz', 'splat', 'ksplat', 'rad'].includes(format)) throw new Error(`Định dạng chưa hỗ trợ: ${format}`);
      if (mode === 'sequence' && format === 'rad') throw new Error('RAD paging dành cho mode scene. Chuỗi động dùng PLY/SPZ/SPLAT đầy đủ từng frame.');
      if (a.bytes != null && (!Number.isFinite(a.bytes) || a.bytes < 0)) throw new Error('bytes phải là số không âm.');
      assets[q] = {...a, url:url.href, format};
    }
    return {...f, id, assets};
  });
  const rotation = raw.transform?.rotationDegrees ?? [0, 0, 0];
  const position = raw.transform?.position ?? [0, 0, 0];
  const scale = Number(raw.transform?.scale ?? 1);
  if (!Array.isArray(rotation) || rotation.length !== 3 || rotation.some(n => !Number.isFinite(n))) throw new Error('rotationDegrees cần 3 số.');
  if (!Array.isArray(position) || position.length !== 3 || position.some(n => !Number.isFinite(n))) throw new Error('position cần 3 số.');
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('scale cần > 0.');
  if(raw.camera){for(const field of ['position','target'])if(!Array.isArray(raw.camera[field])||raw.camera[field].length!==3||raw.camera[field].some(x=>!Number.isFinite(x)))throw new Error('camera.position và camera.target cần 3 số.');}
  return {...raw, mode, fps, frames, qualities:raw.qualities.map(q => ({...q, label:q.label ?? q.id})),
    name:raw.name ?? 'Untitled scene', defaultQuality:ids.includes(raw.defaultQuality) ? raw.defaultQuality : ids[0],
    transform:{rotationDegrees:rotation, position, scale}};
}

export function frameWindow(index, count, ahead, loop) {
  const result = [];
  for (let n=0; n<=Math.min(ahead, count-1); n++) {
    const j=index+n;
    if (j >= count && !loop) break;
    result.push(j % count);
  }
  return result;
}

// Does not skip content frames. A late frame freezes the content clock and records a stall.
export class PlaybackClock {
  constructor() { this.reset(); }
  reset() { this.playing=false; this.index=0; this.last=null; this.elapsed=0; this.stalls=0; this.stallMs=0; this.stalling=false; }
  seek(index) { this.index=index; this.elapsed=0; this.last=null; this.stalling=false; }
  tick(now, fps, count, loop, ready) {
    const dt = this.last == null ? 0 : Math.min(250, Math.max(0, now-this.last));
    this.last=now;
    if (!this.playing || count < 2) return null;
    if (this.stalling) this.stallMs+=dt;
    this.elapsed+=dt;
    const period=1000/fps;
    if (this.elapsed + 0.001 < period) return null;
    let next=this.index+1;
    if (next >= count) {
      if (!loop) { this.playing=false; this.stalling=false; this.elapsed=0; return null; }
      next=0;
    }
    if (!ready(next)) {
      if (!this.stalling) this.stalls++;
      this.stalling=true; this.elapsed=period; return null;
    }
    // Preserve the fractional frame time at normal refresh rates. After a stall,
    // reset the clock rather than bursting through frames to catch up.
    this.elapsed=this.stalling?0:Math.max(0,Math.min(period,this.elapsed-period));
    this.stalling=false; this.index=next; return next;
  }
}

export function csvRows(rows) {
  if (!rows.length) return '';
  const keys=Object.keys(rows[0]);
  const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
  return [keys.map(quote).join(','), ...rows.map(r=>keys.map(k=>quote(r[k])).join(','))].join('\n');
}
