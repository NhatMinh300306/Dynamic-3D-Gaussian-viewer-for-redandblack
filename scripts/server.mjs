import http from 'node:http';
import {createReadStream,existsSync} from 'node:fs';
import {stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {datasetProvider,resolveDatasetFile} from './redandblack.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png'};

export function parseRange(header,size){
  if(!header)return null;
  const m=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!m||(!m[1]&&!m[2])||size<=0)return false;
  let start,end;
  if(!m[1]){const length=Number(m[2]);if(length<=0)return false;start=Math.max(0,size-length);end=size-1;}
  else {start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return false;
  return {start,end};
}
function inside(root,file){return file===root||file.startsWith(root+path.sep);}
export async function resolveFile(urlPath,dist=false){
  const decoded=decodeURIComponent(urlPath);
  if(decoded.includes('\0')||decoded.split(/[\\/]/).includes('..'))return null;
  let choices;
  if(dist)choices=decoded.startsWith('/data/')?[[path.join(project,'public'),decoded],[path.join(project,'dist'),decoded]]:[[path.join(project,'dist'),decoded]];
  else if(decoded.startsWith('/vendor/three/'))choices=[[path.join(project,'node_modules/three'),decoded.slice(14)]];
  else if(decoded.startsWith('/vendor/spark/'))choices=[[path.join(project,'node_modules/@sparkjsdev/spark/dist'),decoded.slice(14)]];
  else choices=[[path.join(project,'app'),decoded],[path.join(project,'public'),decoded]];
  for(const [root,relative]of choices){
    const file=path.resolve(root,'.'+path.sep+relative.replace(/^[/\\]+/,''));
    if(!inside(root,file))continue;
    try {
      let actual=file,info=await stat(actual);
      if(info.isDirectory()){actual=path.join(actual,'index.html');info=await stat(actual);}
      if(!info.isFile()||!inside(await realpath(root),await realpath(actual)))continue;
      return {file:actual,info};
    }catch{}
  }
  return null;
}
export function createHandler(dist=false,{getDataset=datasetProvider(project)}={}){return async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  const pathname=new URL(req.url,'http://localhost').pathname;
  const json=(status,value)=>{const body=Buffer.from(JSON.stringify(value));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':body.length});res.end(req.method==='HEAD'?undefined:body);};
  let found;
  if(pathname==='/api/startup.json'||pathname==='/api/redandblack/manifest.json'){
    try{const data=await getDataset();if(pathname==='/api/startup.json')json(200,{manifestUrl:data.manifestUrl});else if(data.manifest)json(200,data.manifest);else json(404,{error:'Dùng manifest đã import.'});}
    catch(error){json(422,{error:error.message});}return;
  }
  if(pathname.startsWith('/_dataset/')){try{found=await resolveDatasetFile(await getDataset(),pathname);}catch{}}
  else try{found=await resolveFile(pathname,dist);}catch{}
  if(!found){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
  const {file,info}=found;
  const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
  const range=parseRange(req.headers.range,info.size);
  if(range===false){res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`});res.end();return;}
  const start=range?.start??0,end=range?.end??info.size-1;
  headers['Content-Length']=Math.max(0,end-start+1);
  if(range)headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
  res.writeHead(range?206:200,headers);
  if(req.method==='HEAD'||!info.size){res.end();return;}
  const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);const dist=args.includes('--dist');
  const value=(flag,fallback)=>{const i=args.indexOf(flag);return i>=0?args[i+1]:fallback;};
  const host=value('--host','127.0.0.1'),port=Number(value('--port','5173'));
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Port không hợp lệ.');
  if(!existsSync(path.join(project,dist?'dist/index.html':'node_modules/@sparkjsdev/spark/dist/spark.module.js'))){console.error(dist?'Chạy npm run build trước.':'Chạy npm ci trước.');process.exit(1);}
  const server=http.createServer(createHandler(dist));server.on('error',e=>{console.error(e.message);process.exitCode=1;});
  server.listen(port,host,()=>{
    console.log(`Gaussian Studio: http://${host}:${port}\nTự nhận redandblack từ model/8i/redandblack/dynamic-lapis.\nCtrl+C để dừng.`);
    if(args.includes('--open')&&process.platform==='win32')execFile('cmd.exe',['/d','/c','start','',`http://127.0.0.1:${port}`],{windowsHide:true},error=>{if(error)console.log(`Mở trình duyệt tại http://127.0.0.1:${port}`);});
  });
}
