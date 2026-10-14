// Exercise the actual Spark decoder in Node workers, without a browser or WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
const workers=[];
class WorkerBridge {
  constructor(url){
    const source=decodeURIComponent(String(url).split(',').slice(1).join(','));
    const prefix=`const {parentPort}=require('node:worker_threads'); globalThis.self=globalThis;
      const listeners=new Map();
      self.addEventListener=(type,callback)=>{if(type==='message'){const wrapped=data=>callback({data});listeners.set(callback,wrapped);parentPort.on('message',wrapped);}};
      self.removeEventListener=(type,callback)=>{const wrapped=listeners.get(callback);if(wrapped)parentPort.off('message',wrapped);};
      self.postMessage=(data,options)=>parentPort.postMessage(data,Array.isArray(options)?options:options?.transfer);
    `;
    this.worker=new NodeWorker(prefix+source,{eval:true});workers.push(this.worker);
    this.worker.on('message',data=>this.onmessage?.({data}));
    this.worker.on('error',error=>{this.error=error;});
  }
  addEventListener(type,fn){if(type==='error')this.worker.on('error',fn);}
  postMessage(data,options){this.worker.postMessage(data,Array.isArray(options)?options:options?.transfer);}
  terminate(){return this.worker.terminate();}
}

test('Pinned Spark version decodes binary demo Gaussian PLY and preserves positions',{timeout:15000},async()=>{
  globalThis.Worker=WorkerBridge;
  let mesh;
  try{
    const {SplatMesh}=await import('@sparkjsdev/spark');
    const data=await readFile(new URL('../public/data/demo/detail/000000.ply',import.meta.url));
    mesh=new SplatMesh({fileBytes:new Uint8Array(data),fileName:'frame.ply',extSplats:true,lod:false});
    await mesh.initialized;
    assert.equal(mesh.numSplats,2400);
    const bounds=mesh.getBoundingBox();
    assert.ok(bounds.min.y<-.7);assert.ok(bounds.max.y>.7);
    assert.ok(bounds.max.x-bounds.min.x>.6);
  }finally{mesh?.dispose();await Promise.all(workers.map(w=>w.terminate()));delete globalThis.Worker;}
});
