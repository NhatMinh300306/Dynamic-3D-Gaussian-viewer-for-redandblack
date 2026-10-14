import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest,frameWindow,PlaybackClock} from '../app/src/model.js';
import {FrameStore} from '../app/src/frame-store.js';

const minimal=()=>({version:1,fps:30,qualities:[{id:'res8'}],frames:[{id:1450,assets:{res8:{url:'res8/1450.ply'}}}]});
test('Manifest resolves assets relative to manifest, not page URL',()=>{
  const m=validateManifest(minimal(),'http://localhost:5173/data/red/manifest.json');
  assert.equal(m.frames[0].assets.res8.url,'http://localhost:5173/data/red/res8/1450.ply');
});
test('Reject missing quality, duplicate frame IDs and unsupported dynamic RAD paging',()=>{
  const m=minimal();m.qualities.push({id:'res1'});assert.throws(()=>validateManifest(m,'http://x/'),/thiếu quality/);
  const n=minimal();n.frames.push(n.frames[0]);assert.throws(()=>validateManifest(n,'http://x/'),/trùng/);
  const r=minimal();r.frames[0].assets.res8.url='scene.rad';assert.throws(()=>validateManifest(r,'http://x/'),/RAD/);
});
test('Window wraps once and stops at end when loop is off',()=>{
  assert.deepEqual(frameWindow(3,4,8,true),[3,0,1,2]);assert.deepEqual(frameWindow(3,4,3,false),[3]);
});
test('Playback freezes on a missing frame; stall is counted once; no frame skips',()=>{
  const c=new PlaybackClock();c.playing=true;const ready=i=>i===1;
  c.tick(0,10,4,false,ready);assert.equal(c.tick(100,10,4,false,ready),1);
  assert.equal(c.tick(200,10,4,false,ready),null);assert.equal(c.index,1);assert.equal(c.stalls,1);
  c.tick(300,10,4,false,ready);assert.equal(c.stalls,1);assert.equal(c.stallMs,100);
  assert.equal(c.tick(400,10,4,false,()=>true),2);assert.equal(c.stallMs,200);assert.equal(c.stalling,false);
});
test('Playback stops on final frame without looping',()=>{
  const c=new PlaybackClock();c.playing=true;c.tick(0,10,2,false,()=>true);assert.equal(c.tick(100,10,2,false,()=>true),1);
  c.tick(200,10,2,false,()=>true);assert.equal(c.playing,false);assert.equal(c.index,1);
});
test('Playback preserves fractional time: 30 frame changes in 1 second on a 60 Hz renderer',()=>{
  const c=new PlaybackClock();c.playing=true;c.tick(0,30,60,false,()=>true);
  let changes=0;for(let i=1;i<=60;i++)if(c.tick(i*1000/60,30,60,false,()=>true)!==null)changes++;
  assert.equal(changes,30);assert.equal(c.index,30);
});
test('Saved translation is validated and survives manifest normalization',()=>{
  const m=minimal();m.transform={rotationDegrees:[-90,0,0],position:[1,2,3],scale:2};
  assert.deepEqual(validateManifest(m,'http://localhost/').transform.position,[1,2,3]);
  m.transform.position=[1,'bad',3];assert.throws(()=>validateManifest(m,'http://localhost/'),/position/);
});
const drain=()=>new Promise(r=>setTimeout(r,0));
test('A stale asynchronous load is disposed after seek; pinned frame survives',async()=>{
  const waiting=new Map(),disposed=[];
  const s=new FrameStore(item=>new Promise(resolve=>waiting.set(item.key,resolve)),v=>disposed.push(v));
  s.plan([{key:'a'}]);waiting.get('a')('A');await drain();
  s.plan([{key:'b'}],'a');s.plan([{key:'c'}],'a');
  waiting.get('b')('B');await drain();assert.deepEqual(disposed,['B']);assert.equal(s.get('a').status,'ready');
  waiting.get('c')('C');await drain();s.plan([{key:'c'}],'c');assert.deepEqual(disposed,['B','A']);
  s.close();assert.deepEqual(disposed,['B','A','C']);
});
test('Failed frame retries explicitly without infinite retry loop',async()=>{
  let tries=0;const s=new FrameStore(async()=>{if(++tries===1)throw Error('404');return 'ok';},()=>{});
  s.plan([{key:'a'}]);await drain();assert.equal(tries,1);assert.equal(s.get('a').status,'error');
  s.retry();await drain();assert.equal(s.get('a').value,'ok');s.close();
});
