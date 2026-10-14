import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SparkRenderer, SplatMesh} from '@sparkjsdev/spark';
import {validateManifest, frameWindow, PlaybackClock, csvRows} from './model.js';
import {FrameStore} from './frame-store.js';

const $=id=>document.getElementById(id);
const stage=$('stage'), scene=new THREE.Scene();
scene.background=new THREE.Color('#171e19');
const camera=new THREE.PerspectiveCamera(45,1,0.01,10000);
camera.position.set(0,1.4,4);
const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false});
renderer.setPixelRatio(1); stage.prepend(renderer.domElement);
const spark=new SparkRenderer({renderer, maxPagedSplats:2097152, lodSplatCount:600000,pagedExtSplats:true});
scene.add(spark);
const root=new THREE.Group(); scene.add(root);
const grid=new THREE.GridHelper(12,24,0x45523f,0x2a3828); grid.position.y=-1; scene.add(grid);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=.08; controls.autoRotateSpeed=.7;
controls.zoomSpeed=1.6;controls.zoomToCursor=true;
let manifest=null, store=null, displayed=null, displayedKey=null, pending=0, generation=0;
let quality='', fitPending=true, blobURLs=[], loadController=null, userFPS=24;
let lastMetrics=0, renderCount=0, renderFPS=0, lastDownload=null;
let startupStart=performance.now(), firstReadyMs=null, log=[], fullBytes=0;
const clock=new PlaybackClock();
let sceneRadius=1,viewTransform=null,activeManifestURL='',lastRenderTime=performance.now();
const MAX_FILE_BYTES=1024*1024*1024; // per request guard, not a VRAM guarantee

function resize() {const {width,height}=stage.getBoundingClientRect(); renderer.setSize(width,height); camera.aspect=width/height; camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);
function status(text){$('status').textContent=text;}
function showError(error){$('loading').hidden=true;$('error').hidden=false;$('error-text').textContent=error.message??String(error);status('Dữ liệu chưa sẵn sàng');}
function clearError(){$('error').hidden=true;}
function key(index,q=quality){return `${q}:${index}`;}
function dispose(value){root.remove(value.mesh);value.mesh.dispose();}

function transformKey(){return `gaussian-studio:transform:v2:${manifest?.name}`;}
function syncTransformInputs(){
  if(!viewTransform)return;
  ['x','y','z'].forEach((axis,i)=>{$(`rotation-${axis}`).value=viewTransform.rotationDegrees[i];$(`position-${axis}`).value=viewTransform.position[i];});
  $('model-scale').value=viewTransform.scale;
}
function transform(){
  if(!viewTransform)return;
  root.rotation.set(...viewTransform.rotationDegrees.map(THREE.MathUtils.degToRad));
  root.position.fromArray(viewTransform.position);root.scale.setScalar(viewTransform.scale);root.updateMatrixWorld(true);
}
function rememberTransform(){try{localStorage.setItem(transformKey(),JSON.stringify(viewTransform));}catch{}}
function restoreTransform(){
  viewTransform=structuredClone(manifest.transform);
  try{const saved=JSON.parse(localStorage.getItem(transformKey()));
    if(saved&&['position','rotationDegrees'].every(k=>Array.isArray(saved[k])&&saved[k].length===3&&saved[k].every(Number.isFinite))&&Number.isFinite(saved.scale)&&saved.scale>0){viewTransform=saved;$('orientation').value='custom';}
  }catch{}
  syncTransformInputs();transform();
}
function updateClipping(){
  const distance=camera.position.distanceTo(controls.target);
  const near=Math.max(sceneRadius*1e-7,Math.min(sceneRadius*.001,distance/10000));
  const far=Math.max(sceneRadius*100,distance*4+sceneRadius*10);
  if(Math.abs(camera.near-near)>near*.01||Math.abs(camera.far-far)>far*.01){camera.near=near;camera.far=far;camera.updateProjectionMatrix();}
}
function zoom(factor){
  const offset=camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));
  camera.position.copy(controls.target).add(offset);controls.update();updateClipping();
}
function fit(){
  if(!displayed)return false;
  root.updateMatrixWorld(true);
  const bounds=displayed.mesh.getBoundingBox().clone().applyMatrix4(root.matrixWorld);
  if(bounds.isEmpty() || !Number.isFinite(bounds.min.x) || !Number.isFinite(bounds.max.x))return false;
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const radius=Math.max(size.length()/2,.01);
  sceneRadius=radius;
  const halfAngle=Math.min(THREE.MathUtils.degToRad(camera.fov)/2,Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*camera.aspect));
  const distance=radius/Math.sin(halfAngle)*1.2;
  controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(.25,.13,1).normalize().multiplyScalar(distance));
  controls.minDistance=radius*.0001;controls.maxDistance=radius*2000;controls.update();updateClipping();
  grid.position.set(center.x,bounds.min.y-.01*radius,center.z);grid.scale.setScalar(radius/3);
  return true;
}

async function loadFrame(item,signal){
  const {asset}=item; let mesh;
  const started=performance.now();let bytes=0, downloadMs=null,decodeMs=null;
  try {
    if(asset.format==='rad'){
      mesh=new SplatMesh({url:asset.url,paged:true});
      await Promise.all([mesh.initialized,mesh.paged.getRadMeta()]);
    } else {
      const response=await fetch(asset.url,{signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}: ${asset.url}`);
      const declared=Number(response.headers.get('content-length')||0);
      if(declared>MAX_FILE_BYTES)throw new Error('File lớn hơn 1 GiB. Chọn mức res nhẹ hơn hoặc chuyển SPZ/RAD.');
      const data=await response.arrayBuffer(); bytes=data.byteLength;downloadMs=performance.now()-started;
      if(bytes>MAX_FILE_BYTES)throw new Error('File lớn hơn giới hạn 1 GiB.');
      if(signal.aborted)throw new DOMException('Aborted','AbortError');
      const decodeStart=performance.now();
      mesh=new SplatMesh({fileBytes:data,fileName:`frame.${asset.format}`,lod:false,extSplats:true});
      await mesh.initialized;decodeMs=performance.now()-decodeStart;
    }
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    mesh.visible=true;
    return {mesh, bytes,downloadMs,decodeMs,local:asset.url.startsWith('blob:'),paged:asset.format==='rad'};
  } catch(error) {mesh?.dispose();throw error;}
}

function plan(){
  if(!manifest||!store)return;
  const index=pending??clock.index;
  // Limit the prefetch window by source bytes where metadata is known. GPU memory is different.
  const requested=frameWindow(index,manifest.frames.length,Number($('ahead').value),$('loop').checked);
  const items=[];let sourceBytes=0;
  for(const i of requested){
    const asset=manifest.frames[i].assets[quality];
    if(items.length>=2 && sourceBytes+(asset.bytes??0)>192*1024*1024)break;
    sourceBytes+=asset.bytes??0;items.push({key:key(i),index:i,asset});
  }
  store.plan(items,displayedKey);
}
function commitFrame(index){
  const entry=store?.get(key(index));if(entry?.status!=='ready')return false;
  if(displayed)root.remove(displayed.mesh);
  displayed=entry.value;displayedKey=key(index);root.add(displayed.mesh);
  clock.index=index;pending=null;clearError();
  $('loading').hidden=true;
  if(firstReadyMs===null)firstReadyMs=performance.now()-startupStart;
  if(fitPending){transform();fitPending=!fit();}
  $('frame-label').textContent=`FRAME ${manifest.frames[index].id}`;
  $('seek').value=index;
  status(clock.playing?'Đang phát':'Sẵn sàng khám phá');
  plan();return true;
}
function onStoreChange(owner,token){
  if(token!==generation || owner!==store)return;
  // Account each successful load exactly once; these are application file timings, not link capacity.
  for(const entry of owner.entries.values())if(entry.status==='ready'&&!entry.reported){
    entry.reported=true;lastDownload=entry.value;fullBytes+=entry.value.bytes;
  }
  if(pending!==null){
    const entry=owner.get(key(pending));
    if(entry?.status==='ready')commitFrame(pending);
    else if(entry?.status==='error'){clock.playing=false;showError(entry.error);}
  }
}
function setManifest(m){
  generation++;store?.close();root.clear();displayed=null;displayedKey=null;
  manifest=m;quality=m.defaultQuality;clock.reset();clock.playing=m.mode==='sequence'&&m.autoplay!==false;pending=0;fitPending=true;
  startupStart=performance.now();firstReadyMs=null;lastDownload=null;fullBytes=0;log=[];
  userFPS=m.fps;$('fps-input').value=userFPS;$('speed').value='1';$('orientation').value='manifest';
  $('loop').checked=m.loop!==false;restoreTransform();
  $('scene-name').textContent=m.name;$('mode').textContent=m.mode==='scene'?'SPARK SCENE / LOD':'DYNAMIC GAUSSIAN SEQUENCE';
  $('source-badge').textContent=m.synthetic?'DEMO TỔNG HỢP':m.mode==='scene'?'RAD / SCENE':'DỮ LIỆU CỦA BẠN';
  $('detail').textContent=m.description??'PLY/SPZ đầy đủ từng frame · Tải trước có giới hạn';
  $('quality').replaceChildren(...m.qualities.map(q=>new Option(q.label,q.id)));$('quality').value=quality;
  renderQualityButtons();
  $('source-warning').textContent=(m.unavailableQualities??[]).map(q=>`${q.id}: ${q.reason}`).join('\n');
  $('seek').max=m.frames.length-1;$('seek').value=0;
  for(const id of ['seek','play','prev','next','fps-input','speed','ahead'])$(id).disabled=m.mode==='scene';
  $('lod-budget').disabled=m.mode!=='scene';
  $('lod-controls').hidden=m.mode!=='scene';
  if(m.camera){
    camera.position.fromArray(m.camera.position);controls.target.fromArray(m.camera.target);controls.update();fitPending=false;
  }
  const token=generation;const owner=new FrameStore(loadFrame,dispose,()=>onStoreChange(owner,token));store=owner;
  transform();clearError();$('loading').hidden=false;status('Đang tải frame đầu…');plan();
}
function renderQualityButtons(){
  const isRes=manifest.qualities.every(q=>/^res[1248]$/.test(q.id));
  $('quality').hidden=isRes;$('quality-buttons').hidden=!isRes;
  $('quality-buttons').replaceChildren(...[1,2,4,8].map(res=>{
    const id=`res${res}`,button=document.createElement('button');button.textContent=`res${res}`;
    button.disabled=!manifest.qualities.some(q=>q.id===id);button.setAttribute('aria-pressed',String(id===quality));
    button.title=button.disabled?(manifest.unavailableQualities?.find(q=>q.id===id)?.reason??'Chưa có dữ liệu mức này'):`Chuyển sang ${id}`;
    button.onclick=()=>{$('quality').value=id;$('quality').dispatchEvent(new Event('change'));};return button;
  }));
}
async function openManifest(url,{autoplay=false}={}){
  loadController?.abort();loadController=new AbortController();const current=loadController;
  clearError();status('Đang đọc manifest…');$('load').disabled=true;
  try{
    const resolved=new URL(url,location.href);activeManifestURL=resolved.href;$('manifest-url').value=url;
    let raw,base=resolved.href;
    if(/\.rad$/i.test(resolved.pathname))raw={version:1,mode:'scene',name:decodeURIComponent(resolved.pathname.split('/').pop()),qualities:[{id:'lod',label:'LoD theo góc nhìn'}],frames:[{id:0,assets:{lod:{url:resolved.href,format:'rad'}}}],description:'RAD paging · Spark tải chunk theo góc nhìn · Mở file .rad nguyên khối hoặc kèm đầy đủ .radc'};
    else {
      const response=await fetch(resolved,{signal:current.signal});
      if(!response.ok)throw new Error(`Không đọc được manifest: HTTP ${response.status}. Kiểm tra đường dẫn public/data.`);
      raw=await response.json();base=response.url||base;
    }
    if(autoplay)raw={...raw,autoplay:true,loop:true};
    const m=validateManifest(raw,base);
    if(current!==loadController)return;
    for(const url of blobURLs)URL.revokeObjectURL(url);blobURLs=[];setManifest(m);
  }catch(error){if(error.name!=='AbortError')showError(error);}
  finally{if(current===loadController)$('load').disabled=false;}
}

function seek(index,{keepPlaying=false}={}){
  if(!manifest)return;const resume=keepPlaying&&clock.playing;clock.playing=resume;clock.seek(Math.max(0,Math.min(index,manifest.frames.length-1)));
  pending=clock.index;clearError();if(!commitFrame(pending)){status('Đang tải frame được chọn…');plan();}
}
function togglePlay(){
  if(!manifest||manifest.frames.length<2)return;
  if(!clock.playing&&!$('loop').checked&&clock.index===manifest.frames.length-1)seek(0);
  clock.playing=!clock.playing;clock.last=null;
  if(!clock.playing)clock.stalling=false;
  status(clock.playing?'Đang phát':'Tạm dừng');
  plan();
}
$('load').onclick=()=>openManifest($('manifest-url').value.trim());
$('manifest-url').onkeydown=e=>{if(e.key==='Enter')$('load').click();};
$('demo').onclick=()=>{$('manifest-url').value='./data/demo/manifest.json';openManifest($('manifest-url').value);};
$('pick').onclick=()=>$('files').click();
$('files').onchange=()=>{
  const files=[...$('files').files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));if(!files.length)return;
  loadController?.abort();$('load').disabled=false;
  for(const url of blobURLs)URL.revokeObjectURL(url);blobURLs=[];
  try {
    const frames=files.map((file,i)=>{const url=URL.createObjectURL(file);blobURLs.push(url);return{id:`${i+1} · ${file.name}`,assets:{original:{url,format:file.name.split('.').pop().toLowerCase(),bytes:file.size}}};});
    if(files.some(f=>/quantized/i.test(f.name)))throw new Error('Hãy giải mã CAGS thành point_cloud.ply trước khi mở.');
    setManifest(validateManifest({version:1,name:files.length===1?files[0].name:`${files.length} frames cục bộ`,fps:30,qualities:[{id:'original',label:'Original'}],frames,description:'File cục bộ · Tốc độ đọc file không phải throughput mạng'},location.href));
  }catch(error){showError(error);}
  $('files').value='';
};
$('play').onclick=togglePlay;$('prev').onclick=()=>seek(clock.index-1);$('next').onclick=()=>seek(clock.index+1);
$('seek').oninput=()=>seek(Number($('seek').value));
$('quality').onchange=()=>{if(!manifest||quality===$('quality').value)return;quality=$('quality').value;renderQualityButtons();seek(clock.index,{keepPlaying:true});};
$('ahead').oninput=()=>{$('ahead-out').textContent=`${$('ahead').value} frame`;plan();};
$('loop').onchange=plan;
$('fps-input').onchange=()=>{userFPS=Math.max(1,Math.min(120,Number($('fps-input').value)||manifest?.fps||30));$('fps-input').value=userFPS;clock.elapsed=0;};
$('speed').onchange=()=>{clock.elapsed=0;clock.last=null;};
$('pixel-ratio').onchange=()=>{renderer.setPixelRatio(Number($('pixel-ratio').value));resize();};
$('lod-budget').onchange=()=>{spark.lodSplatCount=Number($('lod-budget').value);};
$('orientation').onchange=()=>{
  if(!viewTransform)return;
  const presets={manifest:manifest.transform.rotationDegrees,y:[0,0,0],z:[-90,0,0],flip:[180,0,0]};
  if(presets[$('orientation').value])viewTransform.rotationDegrees=[...presets[$('orientation').value]];
  syncTransformInputs();transform();rememberTransform();fit();
};$('fit').onclick=fit;
for(const kind of ['rotation','position'])for(const axis of ['x','y','z'])$(`${kind}-${axis}`).onchange=()=>{
  if(!viewTransform)return;const field=kind==='rotation'?'rotationDegrees':'position';
  ['x','y','z'].forEach((a,i)=>{const value=Number($(`${kind}-${a}`).value);if(Number.isFinite(value))viewTransform[field][i]=value;});
  $('orientation').value='custom';syncTransformInputs();transform();rememberTransform();
};
$('model-scale').onchange=()=>{if(!viewTransform)return;const value=Number($('model-scale').value);if(Number.isFinite(value)&&value>0)viewTransform.scale=value;syncTransformInputs();transform();rememberTransform();fit();};
$('reset-transform').onclick=()=>{if(!manifest)return;viewTransform=structuredClone(manifest.transform);$('orientation').value='manifest';syncTransformInputs();transform();rememberTransform();fit();};
$('zoom-in').onclick=()=>zoom(.75);$('zoom-out').onclick=()=>zoom(1/.75);
function panel(open){$('controls-panel').hidden=!open;$('panel-toggle').setAttribute('aria-expanded',String(open));}
$('panel-toggle').onclick=()=>panel($('controls-panel').hidden);$('panel-close').onclick=()=>{panel(false);$('panel-toggle').focus();};
$('grid').onchange=()=>{grid.visible=$('grid').checked;};
$('rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('rotate').textContent=`Tự xoay: ${controls.autoRotate?'bật':'tắt'}`;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));};
$('fullscreen').onclick=()=>{(document.fullscreenElement?document.exitFullscreen():stage.requestFullscreen()).catch(showError);};
$('retry').onclick=()=>{clearError();if(!manifest){if(activeManifestURL)openManifest(activeManifestURL);else openDefault();}else{store?.retry();plan();}};
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||$('help-dialog').open)return;
  if(e.target.closest('button,summary'))return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}if(e.key==='ArrowRight'){e.preventDefault();seek(clock.index+1);}if(e.key==='ArrowLeft'){e.preventDefault();seek(clock.index-1);}if(e.key.toLowerCase()==='f')fit();
  if(e.key==='+'||e.key==='=')zoom(.75);if(e.key==='-')zoom(1/.75);if(e.key==='Escape')panel(false);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clock.playing=false;clock.stalling=false;clock.last=null;}});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();clock.playing=false;showError(new Error('WebGL context bị mất. Giảm tải trước/mức chất lượng rồi tải lại trang.'));});

function readyBuffer(){
  if(!manifest)return 0;let count=0;
  for(const i of frameWindow(clock.index,manifest.frames.length,8,$('loop').checked).slice(1)){
    if(store.get(key(i))?.status!=='ready')break;count++;
  }
  return count/(userFPS*Number($('speed').value));
}
function metrics(now){
  const elapsed=now-lastMetrics;renderFPS=renderCount*1000/elapsed;renderCount=0;lastMetrics=now;
  $('render-fps').textContent=renderFPS.toFixed(0);
  $('splats').textContent=displayed?.paged?'LoD':(displayed?.mesh.numSplats??0).toLocaleString('en-US');
  const buffer=readyBuffer();$('buffer').innerHTML=`${buffer.toFixed(2)} <em>s</em>`;
  const downloadMbps=lastDownload?.downloadMs>0&&!lastDownload.local?8*lastDownload.bytes/lastDownload.downloadMs/1000:null;
  $('throughput').innerHTML=downloadMbps===null?'—':`${downloadMbps.toFixed(1)} <em>Mbps</em>`;
  $('network-note').textContent=lastDownload?.paged?'RAD: Spark quản lý request':lastDownload?.local?'Đọc file cục bộ':'Có thể gồm cache / localhost';
  $('stalls').textContent=`Stall: ${clock.stalls} · ${(clock.stallMs/1000).toFixed(2)} s`;
  if(!manifest)return;
  if(fitPending&&displayed?.paged)fitPending=!fit();
  $('time-label').textContent=`${(clock.index/userFPS).toFixed(2)} / ${(manifest.frames.length/userFPS).toFixed(2)} s`;
  const bars=manifest.frames.length<=240?manifest.frames.map((_,i)=>{const el=document.createElement('i');if(store.get(key(i))?.status==='ready')el.className='ready';if(i===clock.index)el.className='current';return el;}):[];
  $('buffer-strip').replaceChildren(...bars);
  log.push({elapsed_s:Number(((now-startupStart)/1000).toFixed(3)),scene:manifest.name,frame:manifest.frames[clock.index].id,quality,
    render_fps:Number(renderFPS.toFixed(2)),content_fps:userFPS,speed:Number($('speed').value),ready_buffer_s:Number(buffer.toFixed(3)),
    request_mbps:downloadMbps===null?'':Number(downloadMbps.toFixed(3)),decode_ms:lastDownload?.decodeMs?.toFixed(2)??'',
    total_file_bytes:fullBytes,ready_meshes:[...store.entries.values()].filter(e=>e.status==='ready').length,
    stalls:clock.stalls,stall_s:Number((clock.stallMs/1000).toFixed(3)),startup_ready_ms:firstReadyMs?.toFixed(2)??'',
    source:lastDownload?.paged?'rad_paged':lastDownload?.local?'local_file':'http_file'});
  if(log.length>14400)log.shift();
}
$('export').onclick=()=>{const blob=new Blob(['\ufeff'+csvRows(log)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='gaussian-viewer-metrics.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
renderer.setAnimationLoop(now=>{
  controls.update(Math.min(.1,Math.max(0,(now-lastRenderTime)/1000)));lastRenderTime=now;updateClipping();
  if(manifest&&pending===null){
    const next=clock.tick(now,userFPS*Number($('speed').value),manifest.frames.length,$('loop').checked,i=>store.get(key(i))?.status==='ready');
    if(next!==null)commitFrame(next);
    if(clock.stalling){
      const n=(clock.index+1)%manifest.frames.length;const e=store.get(key(n));
      if(e?.status==='error'){clock.playing=false;clock.stalling=false;showError(e.error);}else status('Đang chờ frame tiếp theo…');
    }
  }else clock.last=now;
  $('play').textContent=clock.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',clock.playing?'Tạm dừng':'Phát');
  renderer.render(scene,camera);renderCount++;
  if(now-lastMetrics>=500)metrics(now);
});
window.addEventListener('beforeunload',()=>{store?.close();spark.dispose();renderer.dispose();for(const url of blobURLs)URL.revokeObjectURL(url);});
async function openDefault(){
  clearError();$('loading').hidden=false;activeManifestURL='';status('Đang mở redandblack…');
  try{
    const response=await fetch('./api/startup.json',{cache:'no-store'});
    // Static hosts can use an imported dataset; the bundled Node server discovers model/ directly.
    if(response.status===404)return openManifest('./data/redandblack/manifest.json',{autoplay:true});
    const data=await response.json();if(!response.ok)throw new Error(data.error??'Không mở được redandblack.');
    await openManifest(data.manifestUrl,{autoplay:true});
  }catch(error){showError(error);}
}
$('default-scene').onclick=openDefault;
const initial=new URLSearchParams(location.search).get('manifest');
if(initial)openManifest(initial);else openDefault();
