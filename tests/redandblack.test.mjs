import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {Writable} from 'node:stream';
import {discoverRedandblack,resolveDatasetFile} from '../scripts/redandblack.mjs';
import {createHandler} from '../scripts/server.mjs';
import {validateManifest} from '../app/src/model.js';

const properties=['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'];
const ply=`ply\nformat ascii 1.0\nelement vertex 1\n${properties.map(p=>`property float ${p}`).join('\n')}\nend_header\n0 0 0 0 0 0 1 -3 -3 -3 1 0 0 0\n`;
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'gaussian-auto-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function write(root,relative,data){const file=path.join(root,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data);return file;}
async function frames(root,res,ids=[1450,1451,1452]){
  for(const id of ids){
    const dir=`model/8i/redandblack/dynamic-lapis/redandblack_res${res}/${id===1450?id:`dynamic_${id}`}`;
    await write(root,`${dir}/point_cloud/iteration_30000/point_cloud.ply`,ply);
    await write(root,`${dir}/input.ply`,'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nend_header\n0\n');
  }
}
class Response extends Writable {
  chunks=[];
  _write(chunk,encoding,callback){this.chunks.push(Buffer.from(chunk));callback();}
  writeHead(status,headers){this.status=status;this.headers=headers;return this;}
}
async function request(handler,url,headers={},method='GET'){
  const res=new Response(),finished=new Promise((resolve,reject)=>{res.on('finish',resolve);res.on('error',reject);});
  await handler({url,headers,method},res);await finished;res.body=Buffer.concat(res.chunks);return res;
}
test('Auto dataset finds all 4 resolutions, skips raw input, auto plays res8 and serves actual Range bytes',async t=>{
  const root=await fixture(t);for(const res of [1,2,4,8])await frames(root,res);
  const data=await discoverRedandblack(root);const m=validateManifest(data.manifest,'http://localhost/api/redandblack/manifest.json');
  assert.deepEqual(m.qualities.map(q=>q.id),['res1','res2','res4','res8']);assert.equal(m.defaultQuality,'res8');
  assert.equal(m.autoplay,true);assert.equal(m.loop,true);assert.deepEqual(m.frames.map(f=>f.id),['1450','1451','1452']);
  assert.deepEqual(m.transform.rotationDegrees,[-90,0,0]);
  const handler=createHandler(false,{getDataset:async()=>data});
  const startup=await request(handler,'/api/startup.json');assert.equal(JSON.parse(startup.body).manifestUrl,'/api/redandblack/manifest.json');
  const manifest=await request(handler,'/api/redandblack/manifest.json');assert.equal(JSON.parse(manifest.body).qualities.length,4);
  const asset='/_dataset/redandblack/res2/1451.ply';
  const range=await request(handler,asset,{range:'bytes=0-7'});assert.equal(range.status,206);assert.equal(range.body.toString(),ply.slice(0,8));
  const head=await request(handler,asset,{},'HEAD');assert.equal(head.body.length,0);assert.equal(head.headers['Content-Length'],Buffer.byteLength(ply));
  assert.equal((await request(handler,'/_dataset/redandblack/res1/input.ply')).status,404);
  assert.equal((await request(handler,'/_dataset/redandblack/res1/%2e%2e/package.json')).status,404);
  assert.equal(await resolveDatasetFile(data,'/model/8i/redandblack/dynamic-lapis/input.ply'),null);
  const dist=await request(createHandler(true,{getDataset:async()=>data}),asset);assert.equal(dist.status,200);
});
test('Incomplete resolution is disabled while complete timeline is preserved',async t=>{
  const root=await fixture(t);await frames(root,1);await frames(root,8);await frames(root,2,[1450,1451]);
  const {manifest:m}=await discoverRedandblack(root);
  assert.deepEqual(m.qualities.map(q=>q.id),['res1','res8']);assert.equal(m.frames.length,3);
  assert.ok(m.unavailableQualities.some(q=>q.id==='res2'&&q.reason.includes('frame')));
  assert.ok(m.unavailableQualities.some(q=>q.id==='res4'));
});
test('Import fallback works without model; saved orientation survives native discovery; config takes priority',async t=>{
  const root=await fixture(t);const old={version:1,transform:{rotationDegrees:[90,0,0]},fps:24};
  await write(root,'public/data/redandblack/manifest.json',JSON.stringify(old));
  assert.equal((await discoverRedandblack(root)).manifestUrl,'/data/redandblack/manifest.json');
  await frames(root,1);let data=await discoverRedandblack(root);
  assert.deepEqual(data.manifest.transform.rotationDegrees,[90,0,0]);assert.equal(data.manifest.fps,24);
  await write(root,'viewer.config.json',JSON.stringify({rotationDegrees:[-90,0,0],fps:30,defaultQuality:'res1',start:1451,end:1452}));
  data=await discoverRedandblack(root);assert.equal(data.manifest.frames.length,2);assert.equal(data.manifest.fps,30);
  assert.deepEqual(data.manifest.transform.rotationDegrees,[-90,0,0]);
});
test('Missing dataset explains setup, timeline gaps and raw point_cloud.ply are rejected',async t=>{
  const root=await fixture(t);await assert.rejects(discoverRedandblack(root),/Chưa có dữ liệu/);
  await frames(root,1,[1450,1452]);await assert.rejects(discoverRedandblack(root),/thiếu frame/);
  await frames(root,1,[1451]);await write(root,'model/8i/redandblack/dynamic-lapis/redandblack_res1/1450/point_cloud/iteration_30000/point_cloud.ply','ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nend_header\n0\n');
  await assert.rejects(discoverRedandblack(root),/Gaussian đầy đủ/);
});
test('Data scan rejects a PLY symlink leaving the dataset root',async t=>{
  const root=await fixture(t);const file=await write(root,'outside.ply',ply);
  const dest=path.join(root,'model/8i/redandblack/dynamic-lapis/redandblack_res1/1450/point_cloud/iteration_30000/point_cloud.ply');
  await mkdir(path.dirname(dest),{recursive:true});
  try{await symlink(file,dest);}catch(e){if(e.code==='EPERM'){t.skip('Symlinks unavailable');return;}throw e;}
  await assert.rejects(discoverRedandblack(root),/ngoài thư mục/);
});
