// One decode at a time: avoids simultaneous large PLY allocations and stale results after seeks.
// The active frame is pinned. Other entries live only in the current prefetch window.
export class FrameStore {
  constructor(loader, dispose, onChange=()=>{}) {
    this.loader=loader; this.dispose=dispose; this.onChange=onChange;
    this.entries=new Map(); this.wanted=[]; this.pinned=null; this.active=null; this.closed=false;
  }
  get(key) { return this.entries.get(key); }
  plan(items, pinned=null) {
    if (this.closed) return;
    this.wanted=items; this.pinned=pinned;
    const keep=new Set(items.map(x=>x.key));
    if (pinned) keep.add(pinned);
    for (const [k,e] of this.entries) if (!keep.has(k)) {
      if (e.value) this.dispose(e.value);
      this.entries.delete(k);
    }
    if (this.active && !keep.has(this.active.key)) this.active.controller.abort();
    this.pump();
  }
  retry() { for (const [k,e] of this.entries) if (e.status==='error') this.entries.delete(k); this.pump(); }
  async pump() {
    if (this.active || this.closed) return;
    const item=this.wanted.find(x=>!this.entries.has(x.key));
    if (!item) return;
    const controller=new AbortController();
    this.active={key:item.key, controller};
    this.entries.set(item.key,{status:'loading'}); this.onChange();
    try {
      const value=await this.loader(item, controller.signal);
      if (this.closed || controller.signal.aborted || (!this.wanted.some(x=>x.key===item.key) && this.pinned!==item.key)) {
        this.dispose(value); this.entries.delete(item.key);
      } else this.entries.set(item.key,{status:'ready',value});
    } catch(error) {
      if (this.closed || controller.signal.aborted) this.entries.delete(item.key);
      else this.entries.set(item.key,{status:'error',error});
    } finally {
      this.active=null; this.onChange();
      if (!this.closed) this.pump();
    }
  }
  close() {
    this.closed=true; this.active?.controller.abort();
    for (const e of this.entries.values()) if(e.value) this.dispose(e.value);
    this.entries.clear(); this.wanted=[];
  }
}
