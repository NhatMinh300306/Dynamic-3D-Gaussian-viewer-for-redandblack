import test from 'node:test';
import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import {parseRange,resolveFile,createHandler} from '../scripts/server.mjs';

test('HTTP Range parsing covers closed, open, suffix and invalid ranges',()=>{
  assert.deepEqual(parseRange('bytes=10-19',100),{start:10,end:19});
  assert.deepEqual(parseRange('bytes=90-',100),{start:90,end:99});
  assert.deepEqual(parseRange('bytes=-5',100),{start:95,end:99});
  assert.equal(parseRange('bytes=100-200',100),false);assert.equal(parseRange('bytes=20-10',100),false);
  assert.equal(parseRange('bytes=0-1,4-5',100),false);assert.equal(parseRange('bytes=-0',100),false);
});
test('Server exposes app and vendor only, blocks traversal and project sources',async()=>{
  assert.ok(await resolveFile('/index.html'));
  assert.ok(await resolveFile('/vendor/three/build/three.module.js'));
  assert.ok(await resolveFile('/vendor/three/build/three.core.js'));
  assert.ok(await resolveFile('/vendor/spark/spark.module.js'));
  assert.equal(await resolveFile('/%2e%2e/package.json'),null);
  assert.equal(await resolveFile('/scripts/import_sequence.py'),null);
});
class Response extends Writable {
  chunks=[];
  _write(chunk,encoding,callback){this.chunks.push(Buffer.from(chunk));callback();}
  writeHead(status,headers){this.status=status;this.headers=headers;return this;}
}
async function request(url,headers={},method='GET'){
  const response=new Response();const finished=new Promise((resolve,reject)=>{response.on('finish',resolve);response.on('error',reject);});
  await createHandler()({url,headers,method},response);await finished;response.body=Buffer.concat(response.chunks);return response;
}
test('Range handler returns actual bytes, 206, 416 and HEAD lengths (no server needed)',async()=>{
  const whole=await request('/index.html');assert.equal(whole.status,200);
  const part=await request('/index.html',{range:'bytes=2-9'});assert.equal(part.status,206);assert.deepEqual(part.body,whole.body.subarray(2,10));
  assert.equal(part.headers['Content-Length'],8);
  const bad=await request('/index.html',{range:'bytes=999999999-'});assert.equal(bad.status,416);
  const head=await request('/index.html',{},'HEAD');assert.equal(head.body.length,0);assert.equal(Number(head.headers['Content-Length']),whole.body.length);
  const missing=await request('/missing.ply');assert.equal(missing.status,404);
});
