import path from 'node:path';
import {open,readFile,readdir,realpath,stat} from 'node:fs/promises';

const levels=[1,2,4,8];
const required=['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'];
const imported=['redandblack-multi','redandblack','redandblack-res8','redandblack-res1'];
const within=(root,file)=>file===root||file.startsWith(root+path.sep);
async function optionalJSON(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw new Error(`Không đọc được ${path.basename(file)}: ${e.message}`);}}
async function gaussianFile(file,root){
  const actual=await realpath(file);
  if(!within(root,actual))throw new Error(`File nằm ngoài thư mục dữ liệu: ${file}`);
  const handle=await open(actual,'r');
  try{
    const buffer=Buffer.alloc(256*1024);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);
    const text=buffer.subarray(0,bytesRead).toString('ascii');const end=text.indexOf('end_header');
    if(!text.startsWith('ply')||end<0)throw new Error(`PLY header không hợp lệ: ${file}`);
    const props=new Set();let vertex=false,count=0;
    for(const line of text.slice(0,end).split(/\r?\n/)){
      const p=line.trim().split(/\s+/);
      if(p[0]==='element'){vertex=p[1]==='vertex';if(vertex)count=Number(p[2]);}
      if(vertex&&p[0]==='property')props.add(p.at(-1));
    }
    const missing=required.filter(p=>!props.has(p));
    if(missing.length||!count)throw new Error(`Không phải Gaussian đầy đủ: ${file}. Thiếu ${missing.join(', ')}. CAGS cần giải mã trước.`);
    return {file:actual,info:await handle.stat()};
  }finally{await handle.close();}
}

// Reads only trained point_cloud.ply at an explicit iteration. Never scans input.ply.
// Returns an exact file allowlist; the HTTP server does not expose the whole model tree.
export async function discoverRedandblack(project){
  const config=await optionalJSON(path.join(project,'viewer.config.json'))??{};
  const iteration=Number(config.iteration??30000);
  if(!Number.isInteger(iteration)||iteration<0)throw new Error('viewer.config.json: iteration phải là số nguyên không âm.');
  for(const field of ['start','end'])if(config[field]!=null&&!Number.isInteger(config[field]))throw new Error(`${field} phải là số nguyên.`);
  let previous=null,previousURL=null;
  for(const base of ['public','dist']){
    for(const folder of imported){const m=await optionalJSON(path.join(project,base,'data',folder,'manifest.json'));if(m){previous=m;previousURL=`/data/${folder}/manifest.json`;break;}}
    if(previous)break;
  }
  const root=path.join(project,'model/8i/redandblack/dynamic-lapis');
  const groups=new Map(),reasons=new Map();let rootReal;
  try{rootReal=await realpath(root);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(rootReal)for(const res of levels){
    const q=`res${res}`,dir=path.join(root,`redandblack_${q}`);let dirs;
    try{dirs=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT'){reasons.set(q,'Chưa có thư mục dữ liệu');continue;}throw e;}
    const frames=new Map();
    for(const entry of dirs){
      if(!entry.isDirectory())continue;
      const match=/^(?:dynamic_|frame[_-]?)?(\d+)$/i.exec(entry.name);if(!match)continue;
      const id=Number(match[1]);if(config.start!=null&&id<config.start||config.end!=null&&id>config.end)continue;
      const file=path.join(dir,entry.name,'point_cloud',`iteration_${iteration}`,'point_cloud.ply');
      try{
        const asset=await gaussianFile(file,rootReal);
        if(frames.has(id))throw new Error(`Trùng frame ${id} trong ${q}.`);
        frames.set(id,asset);
      }catch(e){if(e.code==='ENOENT')continue;throw e;}
    }
    if(frames.size)groups.set(q,frames);else reasons.set(q,`Không có point_cloud.ply tại iteration_${iteration}`);
  }
  if(!groups.size){
    if(previous)return {manifestUrl:previousURL,manifest:null,files:new Map(),root:rootReal};
    throw new Error('Chưa có dữ liệu redandblack. Đặt model/8i/redandblack/dynamic-lapis trong gaussian-web-studio, rồi khởi động lại server. Xem HUONG_DAN_WINDOWS_V2.md.');
  }
  // Keep the longest timeline intact. Incomplete levels stay disabled, not silently intersected.
  const canonical=[...groups.keys()].sort((a,b)=>groups.get(b).size-groups.get(a).size||Number(b.slice(3))-Number(a.slice(3)))[0];
  const ids=[...groups.get(canonical).keys()].sort((a,b)=>a-b);
  if(ids.some((id,i)=>i&&id!==ids[i-1]+1))throw new Error('Chuỗi redandblack thiếu frame ở giữa. Bổ sung frame hoặc đặt start/end liên tục trong viewer.config.json.');
  for(const [q,frames]of groups)if(frames.size!==ids.length||ids.some(id=>!frames.has(id))){groups.delete(q);reasons.set(q,'Thiếu hoặc lệch frame so với chuỗi đầy đủ');}
  const qualities=levels.map(res=>({id:`res${res}`,label:`res${res}`})).filter(q=>groups.has(q.id));
  const preferred=config.defaultQuality??'res8';
  const defaultQuality=groups.has(preferred)?preferred:qualities.at(-1).id;
  const files=new Map();
  const frames=ids.map(id=>({id,assets:Object.fromEntries(qualities.map(({id:q})=>{
    const asset=groups.get(q).get(id),url=`/_dataset/redandblack/${q}/${id}.ply`;files.set(url,asset);
    return[q,{url,format:'ply',bytes:asset.info.size}];
  }))}));
  const transform={rotationDegrees:config.rotationDegrees??previous?.transform?.rotationDegrees??[-90,0,0],
    position:config.position??previous?.transform?.position??[0,0,0],scale:config.scale??previous?.transform?.scale??1};
  const unavailableQualities=[...reasons].map(([id,reason])=>({id,reason}));
  const manifest={version:1,mode:'sequence',name:'redandblack',fps:config.fps??previous?.fps??30,autoplay:true,loop:true,
    defaultQuality,qualities,frames,transform,unavailableQualities,
    description:`8i · Dynamic-LapisGS · ${frames.length} frames · ${qualities.map(q=>q.id).join(' / ')}`};
  return {manifestUrl:'/api/redandblack/manifest.json',manifest,files,root:rootReal};
}

export function datasetProvider(project){
  let snapshot;
  return ()=>snapshot??=(discoverRedandblack(project).catch(error=>{snapshot=null;throw error;}));
}

export async function resolveDatasetFile(snapshot,pathname){
  const asset=snapshot.files.get(pathname);if(!asset)return null;
  try{
    const actual=await realpath(asset.file);
    if(!snapshot.root||!within(snapshot.root,actual))return null;
    const info=await stat(actual);return info.isFile()?{file:actual,info}:null;
  }catch{return null;}
}
