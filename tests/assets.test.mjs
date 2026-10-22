import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);

test('GT derivative is a real self-contained GLB with normals, UVs and all four wheel assemblies',async()=>{
 const raw=await fs.readFile(new URL('assets/3d/gt/rally-gt.glb',root));
 assert.equal(raw.toString('utf8',0,4),'glTF');assert.equal(raw.readUInt32LE(4),2);assert.equal(raw.readUInt32LE(8),raw.length);
 const json=JSON.parse(raw.toString('utf8',20,20+raw.readUInt32LE(12)));
 assert.equal(json.asset.version,'2.0');assert(json.buffers.every(b=>!b.uri));assert(json.images.every(i=>Number.isInteger(i.bufferView)));
 const wheels=new Set(json.nodes.map(n=>n.name?.match(/^Wheel(Front|Rear)(L|R)-/)?.slice(1).join('')).filter(Boolean));
 assert.deepEqual([...wheels].sort(),['FrontL','FrontR','RearL','RearR']);
 let triangles=0;
 for(const mesh of json.meshes)for(const primitive of mesh.primitives){
  assert.notEqual(primitive.attributes.NORMAL,undefined);
  const material=json.materials[primitive.material];
  for(const texture of [material.pbrMetallicRoughness?.baseColorTexture,material.pbrMetallicRoughness?.metallicRoughnessTexture,material.normalTexture,material.occlusionTexture,material.emissiveTexture].filter(Boolean)){
   assert.notEqual(primitive.attributes[`TEXCOORD_${texture.texCoord||0}`],undefined);
  }
  const positions=json.accessors[primitive.attributes.POSITION];assert(positions.min.every(Number.isFinite));assert(positions.max.every(Number.isFinite));
  triangles+=json.accessors[primitive.indices].count/3;
 }
 assert(triangles>30000&&triangles<90000);
});

test('all shipped environment maps and HDRI have the expected binary formats',async()=>{
 for(const name of ['asphalt','concrete'])for(const channel of ['diff','normal','rough']){
  const raw=await fs.readFile(new URL(`assets/pbr/${name}-${channel}.jpg`,root));assert.equal(raw.readUInt16BE(0),0xffd8);assert(raw.length>50000);
 }
 const hdr=await fs.readFile(new URL('assets/pbr/industrial-sunset.hdr',root));assert.match(hdr.toString('ascii',0,40),/#\?RADIANCE/);assert(hdr.length>100000);
 const credit=await fs.readFile(new URL('THIRD_PARTY.md',root),'utf8');assert.match(credit,/Eric Chadwick/);assert.match(credit,/Creative Commons Attribution 4.0/);assert.match(credit,/Poly Haven/);
});
