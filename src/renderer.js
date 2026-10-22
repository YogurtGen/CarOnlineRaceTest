import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { WORLD, nearestOnTrack } from './engine.js';
import { createArtLibrary, addTrackFurniture, addIndustrialDetail, makeDistantTerrain } from './art.js';

const SCALE = 0.1;
const clamp = THREE.MathUtils.clamp;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 10);
const CONE = new THREE.ConeGeometry(1, 1, 7);
const PALETTES = {
  harbor: { sky: '#c5bdaf', top: '#587c9b', fog: '#aaa79e', ground: '#8d8b7c', water: '#305464', sun: '#ffe0b5', concrete: '#c6c1af', metal: '#374951', accent: '#dbaa43' },
  canyon: { sky: '#ddc7ab', top: '#86a4b1', fog: '#bca38c', ground: '#b29a7a', water: '#6f9a94', sun: '#ffdab0', concrete: '#c3b49b', metal: '#685b50', accent: '#d4a852' },
  orchard: { sky: '#bbc8bc', top: '#637e92', fog: '#a6ada1', ground: '#859078', water: '#577f87', sun: '#ffe4c3', concrete: '#bebdaf', metal: '#485d64', accent: '#d7b655' },
};

function seeded(seed = 824) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function material(color, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

class StaticBatch {
  constructor() { this.entries = new Map(); }
  add(geometry, surface, position, size = [1, 1, 1], rotation = [0, 0, 0]) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...size));
    const instance = geometry.clone().applyMatrix4(matrix);
    if (surface.userData.worldTile && instance.attributes.uv) {
      const positions=instance.attributes.position,normals=instance.attributes.normal,uv=instance.attributes.uv,tile=surface.userData.worldTile;
      for(let i=0;i<uv.count;i++){
        const nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i)),nz=Math.abs(normals.getZ(i));
        uv.setXY(i,(ny>nx&&ny>nz?positions.getX(i):nx>nz?positions.getZ(i):positions.getX(i))/tile,(ny>nx&&ny>nz?positions.getZ(i):positions.getY(i))/tile);
      }
    }
    if (!this.entries.has(surface)) this.entries.set(surface, []);
    this.entries.get(surface).push(instance);
  }
  box(surface, x, y, z, width, height, depth, yaw = 0) {
    this.add(BOX, surface, [x, y, z], [width, height, depth], [0, yaw, 0]);
  }
  finish(group) {
    for (const [surface, geometries] of this.entries) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((entry) => entry.dispose());
      const mesh = new THREE.Mesh(geometry, surface);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.entries.clear();
  }
}

function ribbon(track, left, right, height, surfaces, stripe = false) {
  const positions = [], uvs = [], colors = [];
  const geometry = new THREE.BufferGeometry();
  track.points.forEach((point, index) => {
    const next = track.points[(index + 1) % track.points.length];
    const edge = (p, side) => [p.x * SCALE + p.nx * side, height, p.y * SCALE + p.ny * side];
    const a = edge(point, left), b = edge(point, right), c = edge(next, left), d = edge(next, right);
    positions.push(...a, ...b, ...c, ...b, ...d, ...c);
    const u = point.s * SCALE / 12, v = (point.s + point.segmentLength) * SCALE / 12, span = (right - left) / 12;
    uvs.push(u, 0, u, span, v, 0, u, span, v, span, v, 0);
    if (stripe) {
      const color = surfaces[Math.floor(point.s / 25) % 2].color;
      for (let vertex = 0; vertex < 6; vertex += 1) colors.push(color.r, color.g, color.b);
    }
  });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (stripe) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, stripe ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }) : surfaces);
  mesh.receiveShadow = true;
  return mesh;
}

function road(group, track, batch, palette, art) {
  const half = track.width * SCALE / 2;
  group.add(ribbon(track, -half - 1, half + 1, 0.025, material('#858985')));
  group.add(ribbon(track, -half, half, 0.075, art.surface('asphalt', '#d9d8cf', 12)));
  const curbs = [material('#d86a54'), material('#e7e1cd')];
  group.add(ribbon(track, -half - 0.65, -half + 0.05, 0.105, curbs, true));
  group.add(ribbon(track, half - 0.05, half + 0.65, 0.105, curbs, true));
  const paint = material('#e7e1ca');
  for (let i = 0; i < track.points.length; i += 8) {
    const p = track.points[i];
    batch.box(paint, p.x * SCALE, 0.083, p.y * SCALE, 1.8, 0.012, 0.085, -p.angle);
  }
  const start = new THREE.Group();
  start.position.set(track.start.x * SCALE, 0, track.start.y * SCALE);
  start.rotation.y = -track.start.angle;
  const startBatch = new StaticBatch();
  const black = material('#1f2c32'), white = material('#eeeada');
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 3; column += 1) startBatch.box((row + column) % 2 ? white : black,
      (column - 1) * 0.5, 0.092, -half + (row + 0.5) * half / 6, 0.5, 0.015, half / 6);
  }
  const steel = material('#3d4a50', 0.5, 0.55), yellow = material(palette.accent, 0.55, 0.15);
  for (const side of [-1, 1]) {
    startBatch.box(steel, 0, 3.3, side * (half + 1.2), 0.7, 6.6, 0.7);
    startBatch.box(yellow, 0, 0.25, side * (half + 1.2), 1.8, 0.5, 1.8);
  }
  startBatch.box(steel, 0, 6.25, 0, 0.9, 1.6, track.width * SCALE + 3);
  startBatch.box(yellow, -0.5, 7.12, 0, 0.12, 0.12, track.width * SCALE + 3);
  startBatch.finish(start);
  const banner = canvasTexture(1024, 128, (context) => {
    context.fillStyle = '#243039'; context.fillRect(0, 0, 1024, 128);
    context.fillStyle = '#ffcf62'; context.fillRect(0, 0, 13, 128);
    context.font = 'italic 900 65px Arial, sans-serif'; context.textAlign = 'center';
    context.fillStyle = '#f5f2e9'; context.fillText('COUCH RALLY', 512, 77);
    context.font = 'bold 17px Arial, sans-serif'; context.fillStyle = '#c0c7c7';
    context.fillText(`${track.name.toUpperCase()}  /  START - FINISH`, 512, 108);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(track.width * SCALE + 2.4, 1.55),
    new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide }));
  sign.rotation.y = -Math.PI / 2; sign.position.set(-0.46, 6.25, 0);
  start.add(sign); group.add(start);
}

function sky(scene, palette) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(palette.top) }, bottom: { value: new THREE.Color(palette.sky) },
      sun: { value: new THREE.Vector3(-0.55, 0.4, -0.6).normalize() } },
    vertexShader: 'varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; varying vec3 direction; void main(){ vec3 d=normalize(direction); float h=max(d.y,0.0); vec3 col=mix(bottom,top,pow(h,0.48)); float glow=pow(max(dot(d,sun),0.0),12.0)*0.22; float disk=pow(max(dot(d,sun),0.0),800.0); gl_FragColor=vec4(col+vec3(1.0,0.72,0.37)*(glow+disk*1.9),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  dome.position.set(80, -8, 50); scene.add(dome);
  return dome;
}

function addContainer(batch, x, z, levels, yaw, surfaces) {
  const transform = (lx, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  const surface = surfaces[(Math.floor(x + z) + levels) % surfaces.length];
  for (let level = 0; level < levels; level += 1) {
    const y = 1.32 + level * 2.68;
    batch.box(surface, x, y, z, 11.7, 2.55, 2.5, yaw);
    for (let rib = -5.4; rib <= 5.4; rib += 0.62) {
      for (const side of [-1.27, 1.27]) {
        const [rx, rz] = transform(rib, side);
        batch.box(surface, rx, y, rz, 0.09, 2.34, 0.07, yaw);
      }
    }
    const trim = surfaces[surfaces.length - 1];
    for (const end of [-5.85, 5.85]) {
      const [ex, ez] = transform(end, 0);
      batch.box(trim, ex, y, ez, 0.07, 2.48, 2.54, yaw);
      for (const side of [-0.6, 0.6]) {
        const [rx, rz] = transform(end + 0.05, side);
        batch.box(trim, rx, y, rz, 0.09, 2.18, 0.05, yaw);
      }
    }
  }
}

function addCrane(batch, x, z, yellow, steel) {
  for (const side of [-1, 1]) {
    batch.box(yellow, x + side * 3, 12, z, 0.65, 24, 0.85);
    batch.box(steel, x + side * 3, 0.65, z, 3, 1.3, 4.5);
    batch.add(BOX, yellow, [x + side * 1.5, 12, z], [0.28, 12.4, 0.28], [0, 0, side * 0.25]);
  }
  batch.box(yellow, x, 24, z, 7, 1, 1.5);
  batch.box(yellow, x + 6, 25.4, z, 29, 0.65, 0.65);
  batch.box(yellow, x + 6, 27.6, z, 29, 0.25, 0.25);
  for (let step = -8; step < 20; step += 3) batch.add(BOX, yellow, [x + step, 26.5, z], [0.2, 3.6, 0.2], [0, 0, -0.85]);
  batch.box(steel, x + 17, 19, z, 0.055, 12, 0.055);
  batch.box(steel, x + 17, 13, z, 2, 0.35, 2);
  batch.box(steel, x - 5, 25.3, z, 3.8, 2.2, 2.5);
}

function addWarehouse(batch, palette, art) {
  const concrete = art.surface('concrete', palette.concrete, 3.4), roof = material(palette.metal, 0.65, 0.25);
  const glass = material('#456b78', 0.2, 0.5), frame = material('#d0c5ae');
  batch.box(concrete, 78, 4.7, 46, 27, 9.4, 17);
  batch.box(roof, 78, 9.6, 46, 28.2, 0.7, 18.3);
  batch.box(roof, 78, 3.1, 36.9, 24, 5.3, 0.25);
  for (let i = 0; i < 4; i += 1) {
    const x = 68 + i * 6.8;
    batch.box(frame, x, 3, 36.65, 5.5, 5.8, 0.2);
    batch.box(roof, x, 2.8, 36.48, 5, 5.2, 0.1);
    for (let rib = 0; rib < 9; rib += 1) batch.box(concrete, x, 0.45 + rib * 0.58, 36.38, 4.9, 0.035, 0.1);
    batch.box(glass, x, 7.2, 37.42, 5, 1.6, 0.1);
  }
  for (let i = 0; i < 3; i += 1) batch.box(roof, 70 + i * 8, 10.6, 46, 3, 1.4, 2);
}

function scenery(group, track, palette, art) {
  const batch = new StaticBatch(), random = seeded(track.id === 'harbor' ? 842 : track.id === 'canyon' ? 91 : 634);
  const groundGeometry=new THREE.PlaneGeometry(600,600);
  const groundUV=groundGeometry.attributes.uv;
  for(let i=0;i<groundUV.count;i++)groundUV.setXY(i,groundUV.getX(i)*110,groundUV.getY(i)*110);
  const ground = new THREE.Mesh(groundGeometry, art.surface('concrete', palette.ground, 5));
  ground.rotation.x = -Math.PI / 2; ground.position.set(80, -0.04, 50); ground.receiveShadow = true;
  group.add(ground);
  const concrete = art.surface('concrete', palette.concrete, 3), steel = material(palette.metal, 0.55, 0.5);
  const yellow = material(palette.accent, 0.63, 0.15), dark = material('#354349');
  const lamp = new THREE.MeshBasicMaterial({ color: '#fff1b7' });
  const containerColors = ['#b3533e', '#477b80', '#c2a061', '#657b64', '#576f88', '#c3b8a0'].map((color) => material(color, 0.78, 0.13));
  const safe = (x, z, radius = 0) => nearestOnTrack(track, x / SCALE, z / SCALE).distance * SCALE > track.width * SCALE / 2 + radius + 2.5;
  if (track.id === 'harbor') {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(170, 360), material(palette.water, 0.33, 0.4));
    water.rotation.x = -Math.PI / 2; water.position.set(-83, -0.18, 50); group.add(water);
    batch.box(concrete, 1, 0.15, 50, 3, 0.5, 170);
    for (let z = -25; z < 135; z += 4) {
      batch.box(dark, 1.3, 0.65, z, 0.5, 0.9, 0.5);
      batch.box(yellow, 1.3, 1.04, z, 0.56, 0.15, 0.56);
    }
    const waves = material('#82b3ba', 0.4);
    for (let i = 0; i < 45; i += 1) batch.box(waves, -random() * 85, -0.13, -20 + random() * 160, 2 + random() * 4, 0.01, 0.04);
    addCrane(batch, 0, 25, yellow, steel); addCrane(batch, -2, 83, yellow, steel);
    addWarehouse(batch, palette, art); addIndustrialDetail(batch, palette);
  } else if (track.id === 'canyon') {
    for (const [x, z] of [[73, 42], [89, 46], [101, 34]]) {
      if (!safe(x, z, 5)) continue;
      batch.add(CYLINDER, concrete, [x, 4.3, z], [3.8, 8.6, 3.8]);
      batch.add(CONE, steel, [x, 9.3, z], [3.8, 1.4, 3.8]);
      batch.box(steel, x + 3.9, 4.5, z, 0.25, 9, 0.4);
    }
  } else { addWarehouse(batch, palette, art); addIndustrialDetail(batch, palette); }
  for (let i = 0; i < 60; i += 1) {
    const x = 8 + random() * 146, z = 5 + random() * 91;
    if (x > 60 && x < 97 && z > 33 && z < 60) continue;
    if (safe(x, z, 7)) addContainer(batch, x, z, i % 4 === 0 ? 3 : i % 3 === 0 ? 2 : 1, i % 3 === 0 ? Math.PI / 2 : 0, containerColors);
  }
  for (let i = 0; i < track.points.length; i += 20) {
    const point = track.points[i], offset = track.width * SCALE / 2 + 2, side = i % 40 ? -1 : 1;
    const x = point.x * SCALE + point.nx * offset * side, z = point.y * SCALE + point.ny * offset * side;
    batch.box(concrete, x, 0.3, z, 0.8, 0.6, 0.8); batch.box(steel, x, 4.2, z, 0.16, 8.4, 0.16);
    batch.box(steel, x - point.nx * side * 1.3, 8.35, z - point.ny * side * 1.3, 2.8, 0.12, 0.12, -Math.atan2(point.ny, point.nx));
    batch.box(lamp, x - point.nx * side * 2.4, 8.25, z - point.ny * side * 2.4, 0.7, 0.1, 0.4, -point.angle);
    if (i % 40 === 0) {
      batch.box(yellow, x, 1.3, z, 0.5, 1.7, 0.5); batch.box(dark, x, 1.3, z, 0.51, 0.28, 0.51);
    }
  }
  group.add(makeDistantTerrain(palette, track.id === 'canyon' ? 4 : 1));
  for (let i = 0; i < 25; i += 1) {
    const x = -25 + i * 9.4, z = -20 - random() * 10, height = 8 + random() * 23;
    batch.box(i % 2 ? concrete : steel, x, height / 2, z, 5 + random() * 7, height, 7 + random() * 6);
    for(let row=0;row<Math.floor(height/2.5);row++)for(let col=0;col<2;col++){
      batch.box(i%4===0?lamp:dark,x-1.4+col*2.8,2+row*2.4,z+4.4,1.45,1.12,.12);
    }
    if (i % 5 === 0) batch.add(CYLINDER, steel, [x, height + 7, z], [0.8, 14, 0.8]);
  }
  const stone = material(track.id === 'canyon' ? '#9d7d60' : '#647662'), leaf = material('#455f52'), trunk = material('#655e50');
  for (let i = 0; i < 90; i += 1) {
    const x = 5 + random() * 150, z = 5 + random() * 90;
    if (!safe(x, z, 3.5) || (x > 58 && x < 105 && z > 29 && z < 63)) continue;
    if (track.id === 'canyon' || i % 3) batch.add(CONE, stone, [x, 0.8, z],
      [0.6 + random() * 1.5, 1.2 + random() * 2, 0.8 + random() * 1.3], [0, random() * 4, 0.1]);
    else {
      batch.box(trunk, x, 1.4, z, 0.35, 2.8, 0.35);
      batch.add(CONE, leaf, [x, 4, z], [2.2, 5.6, 2.2]); batch.add(CONE, leaf, [x, 5.8, z], [1.7, 4.3, 1.7]);
    }
  }
  road(group, track, batch, palette, art);
  addTrackFurniture(batch, track, {steel,concrete});
  batch.finish(group);
}

function fallbackCar(color) {
  const group = new THREE.Group(), paint = material(color, 0.32, 0.48), glass = material('#193841', 0.13, 0.5);
  const rubber = material('#192125', 0.96), chrome = material('#a9b7ba', 0.25, 0.8);
  const part = (geometry, surface, x, y, z) => { const mesh = new THREE.Mesh(geometry, surface); mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  part(new THREE.BoxGeometry(4.3, 0.55, 1.9), paint, 0, 0.65, 0);
  part(new THREE.BoxGeometry(1.75, 0.62, 1.65), glass, -0.15, 1.2, 0);
  part(new THREE.BoxGeometry(1.35, 0.15, 1.63), paint, -0.23, 1.58, 0);
  part(new THREE.BoxGeometry(0.4, 0.12, 2), paint, -1.8, 1.1, 0);
  for (const x of [-1.35, 1.35]) for (const z of [-0.98, 0.98]) {
    part(new THREE.CylinderGeometry(0.43, 0.43, 0.28, 14), rubber, x, 0.43, z).rotation.x = Math.PI / 2;
    part(new THREE.CylinderGeometry(0.25, 0.25, 0.29, 8), chrome, x, 0.43, z).rotation.x = Math.PI / 2;
  }
  group.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  return group;
}

function driverLabel(car, number) {
  const texture = canvasTexture(512, 96, (context) => {
    context.fillStyle = '#17252c'; context.fillRect(0, 0, 512, 96); context.fillStyle = car.color; context.fillRect(0, 0, 12, 96);
    context.font = '900 42px Arial, sans-serif'; context.textAlign = 'center'; context.fillStyle = '#fff7e8';
    context.fillText(`${number}  ${car.name.slice(0, 15)}`, 257, 63);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true, transparent: true }));
  sprite.scale.set(2.6, 0.5, 1); sprite.position.y = 2.5; sprite.renderOrder = 5;
  return sprite;
}

function makeCar(car, index, template, onError) {
  const root = new THREE.Group();
  root.userData = { id: car.id, wheels: [], lastAngle: car.angle };
  const body = new THREE.Group(); root.add(body);
  const shadowMap = canvasTexture(64, 64, (context) => {
    const gradient = context.createRadialGradient(32, 32, 5, 32, 32, 32);
    gradient.addColorStop(0, '#10202a99'); gradient.addColorStop(1, '#10202a00'); context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.4), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.09; root.add(shadow);
  const fallback = fallbackCar(car.color); body.add(fallback);
  template.then((scene) => {
    if (!root.parent) return;
    const model = scene.clone(true), box = new THREE.Box3().setFromObject(model), scale = 4.4 / (box.max.z - box.min.z);
    const center=box.getCenter(new THREE.Vector3());
    const wheelParts=new Map();
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry = node.geometry.clone(); node.castShadow = true; node.receiveShadow = true; node.material = node.material.clone();
      const surface=node.material;
      if(surface.name.startsWith('Paint')){
        const secondary=surface.name.startsWith('Paint 2');
        surface.color.set(car.color).multiplyScalar(secondary ? .2 : .82);
        surface.metalness=.66;surface.roughness=.22;surface.clearcoat=1;surface.clearcoatRoughness=.12;
        surface.normalScale?.set(.08,.08);
      }
      surface.envMapIntensity=1;
      const wheel=node.name.match(/^Wheel(Front|Rear)(L|R)-/);
      if(wheel){const key=wheel[1]+wheel[2];if(!wheelParts.has(key))wheelParts.set(key,[]);wheelParts.get(key).push(node);}
      if(surface.name==='Brakelight'){surface.emissive.set('#e21b09');surface.emissiveIntensity=.8;}
    });
    for(const [name,parts] of wheelParts){
      const bounds=new THREE.Box3();parts.forEach(part=>bounds.expandByObject(part));
      const pivot=new THREE.Group();pivot.name=`wheel_${name.toLowerCase()}`;
      pivot.position.copy(bounds.getCenter(new THREE.Vector3()));model.add(pivot);
      model.updateMatrixWorld(true);parts.forEach(part=>pivot.attach(part));
      pivot.userData.radius=(bounds.max.y-bounds.min.y)*scale/2;root.userData.wheels.push(pivot);
    }
    model.scale.setScalar(scale);model.position.set(-center.x*scale,-box.min.y*scale+.035,-center.z*scale);
    const normalized=new THREE.Group();normalized.rotation.y=Math.PI/2;normalized.add(model);
    body.remove(fallback); disposeObject(fallback); body.add(normalized);
  }).catch(onError);
  const flame = new THREE.Group();
  for (const z of [-0.63, 0.63]) {
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.6, 8), new THREE.MeshBasicMaterial({ color: '#ff9c3a', transparent: true, opacity: 0.8, depthWrite: false }));
    outer.rotation.z = Math.PI / 2; outer.position.set(-2.7, 0.48, z);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.1, 8), new THREE.MeshBasicMaterial({ color: '#c1f4ff' }));
    inner.rotation.z = Math.PI / 2; inner.position.set(-2.48, 0.48, z); flame.add(outer, inner);
  }
  root.add(flame); root.userData.flame = flame; root.userData.body = body;
  root.userData.label = driverLabel(car, index + 1); root.add(root.userData.label);
  return root;
}

function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const surfaces = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    surfaces.forEach((surface) => { materials.add(surface); for (const value of Object.values(surface)) if (value?.isTexture) textures.add(value); });
  });
  geometries.forEach((geometry) => geometry.dispose()); materials.forEach((surface) => surface.dispose()); textures.forEach((texture) => texture.dispose());
}

export function getViewRects(race, split = true) {
  const humans = race.cars.filter((car) => !car.isBot).slice(0, 4), cars = split && humans.length ? humans : [humans[0] || race.cars[0]].filter(Boolean);
  return cars.map((car, index) => {
    if (cars.length === 1) return { x: 0, y: 0, width: 1, height: 1, carId: car.id };
    if (cars.length === 2) return { x: index / 2, y: 0, width: 0.5, height: 1, carId: car.id };
    if (cars.length === 3 && index === 2) return { x: 0, y: 0.5, width: 1, height: 0.5, carId: car.id };
    return { x: (index % 2) / 2, y: Math.floor(index / 2) / 2, width: 0.5, height: 0.5, carId: car.id };
  });
}

export function createRenderer(canvas) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); }
  catch { throw new Error('Mode 3D butuh WebGL. Aktifkan hardware acceleration di browser, lalu muat ulang.'); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  const scene = new THREE.Scene(), ambient = new THREE.HemisphereLight('#d9e7ec', '#524b41', .65);
  scene.add(ambient);
  const sunlight = new THREE.DirectionalLight('#fff0d1', 2.4); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048); sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -48;
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = 48; sunlight.shadow.camera.near = 1; sunlight.shadow.camera.far = 180;
  sunlight.shadow.bias = -0.0003; sunlight.shadow.normalBias = 0.035; sunlight.shadow.radius = 2;
  scene.add(sunlight, sunlight.target);
  const environmentTexture = canvasTexture(256, 128, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#81a7c0'); gradient.addColorStop(0.48, '#e7edf0'); gradient.addColorStop(0.54, '#9b9e98'); gradient.addColorStop(1, '#575d59');
    context.fillStyle = gradient; context.fillRect(0, 0, width, height); context.fillStyle = '#ffffff'; context.fillRect(28, 20, 48, 20);
  });
  environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromEquirectangular(environmentTexture);
  scene.environment = environment.texture; environmentTexture.dispose(); pmrem.dispose();
  const art=createArtLibrary(renderer);
  canvas.dataset.models = 'loading';
  const modelError = (error) => {
    canvas.dataset.models = 'error'; canvas.dataset.modelError = String(error?.message || error).slice(0, 180);
    console.warn('Couch Rally: model 3D gagal dimuat; mobil cadangan aktif.', error);
  };
  const template = new GLTFLoader().loadAsync(new URL('../assets/3d/gt/rally-gt.glb', import.meta.url).href).then((gltf) => {
    canvas.dataset.models = 'ready'; delete canvas.dataset.modelError; return gltf.scene;
  });
  template.catch(modelError);
  template.catch(() => {});
  const cars = new Map(), cameras = new Map();
  const stats = { calls: 0, triangles: 0, viewports: 0 };
  let trackGroup, skyDome, trackId = '', rosterKey = '', lastTime = performance.now(), width = 0, height = 0, disposed = false;
  let hdrEnvironment=null;
  art.environment().then(hdr=>{
    if(disposed){hdr.dispose();return;}
    hdrEnvironment=hdr;scene.environment=hdr;scene.background=hdr;scene.backgroundBlurriness=.025;
    if(skyDome){scene.remove(skyDome);disposeObject(skyDome);skyDome=null;}
  }).catch(error=>console.warn('HDRI tidak tersedia; pencahayaan cadangan tetap aktif.',error));

  function rebuild(race) {
    if (trackGroup) { scene.remove(trackGroup); disposeObject(trackGroup); }
    if (skyDome) { scene.remove(skyDome); disposeObject(skyDome); }
    const palette = PALETTES[race.trackId] || PALETTES.harbor;
    scene.background = hdrEnvironment || new THREE.Color(palette.sky); scene.fog = new THREE.Fog(palette.fog, 90, 340);
    ambient.groundColor.set(palette.ground); sunlight.color.set(palette.sun);
    trackGroup = new THREE.Group(); scenery(trackGroup, race.track, palette, art); scene.add(trackGroup);
    skyDome = hdrEnvironment ? null : sky(scene, palette); trackId = race.trackId; cameras.clear();
  }

  function syncCars(race) {
    const key = race.cars.map((car) => `${car.id}:${car.color}:${car.name}`).join('|');
    if (key === rosterKey) return;
    for (const mesh of cars.values()) { scene.remove(mesh); disposeObject(mesh); }
    cars.clear();
    race.cars.forEach((car, index) => { const mesh = makeCar(car, index, template, modelError); scene.add(mesh); cars.set(car.id, mesh); });
    rosterKey = key; cameras.clear();
  }

  return {
    getViewRects,
    getStats() { return { ...stats, models: canvas.dataset.models, modelError: canvas.dataset.modelError || null, assets: {...art.status}, cars:cars.size, wheelPivots:[...cars.values()].reduce((count,car)=>count+car.userData.wheels.length,0), ...renderer.info.memory }; },
    draw(race, { labels = false, motion = true, split = false } = {}) {
      if (!race || disposed) return;
      const now = performance.now(), dt = clamp((now - lastTime) / 1000, 1 / 240, 0.05); lastTime = now;
      const nextWidth = Math.max(1, Math.round(canvas.clientWidth || WORLD.width)), nextHeight = Math.max(1, Math.round(canvas.clientHeight || WORLD.height));
      if (nextWidth !== width || nextHeight !== height) { width = nextWidth; height = nextHeight; renderer.setSize(width, height, false); }
      if (trackId !== race.trackId) rebuild(race);
      syncCars(race);
      race.cars.forEach((car) => {
        const mesh = cars.get(car.id); mesh.position.set(car.x * SCALE, 0.04, car.y * SCALE); mesh.rotation.y = -car.angle;
        const steer = Math.atan2(Math.sin(car.angle - mesh.userData.lastAngle), Math.cos(car.angle - mesh.userData.lastAngle));
        mesh.userData.body.rotation.x = motion ? clamp(-steer * 0.7, -0.045, 0.045) : 0;
        mesh.userData.body.position.y = motion && car.offroad ? Math.sin(race.elapsed * 32) * 0.025 : 0;
        mesh.userData.flame.visible = motion && car.boosting; mesh.userData.flame.scale.x = 0.85 + Math.sin(race.elapsed * 59) * 0.15;
        for (const wheel of mesh.userData.wheels) { wheel.rotation.x -= car.speed * SCALE * dt / Math.max(.2,wheel.userData.radius||.34); if (wheel.name.includes('front')) wheel.rotation.y = clamp(-steer / dt * 0.11, -0.32, 0.32); }
        mesh.userData.lastAngle = car.angle;
      });
      const views = getViewRects(race, split), focus = race.cars.find((car) => car.id === views[0]?.carId) || race.cars[0];
      if (focus) { sunlight.target.position.set(focus.x * SCALE, 0, focus.y * SCALE); sunlight.position.copy(sunlight.target.position).add(new THREE.Vector3(-42, 63, -48)); }
      renderer.shadowMap.needsUpdate = true;
      renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.clear(true, true, true); renderer.setScissorTest(true);
      stats.calls = 0; stats.triangles = 0; stats.viewports = views.length;
      for (const view of views) {
        const car = race.cars.find((candidate) => candidate.id === view.carId); if (!car) continue;
        let state = cameras.get(car.id);
        if (!state) { state = { camera: new THREE.PerspectiveCamera(61, 1, 0.15, 450), position: new THREE.Vector3(), target: new THREE.Vector3(), ready: false }; cameras.set(car.id, state); }
        const speed = clamp(Math.abs(car.speed) / 305, 0, 1.4), distance = split ? 6.5 : 7.5, fx = Math.cos(car.angle), fz = Math.sin(car.angle);
        const desired = new THREE.Vector3(car.x * SCALE - fx * (distance + speed * 1.1), (split ? 2.45 : 2.9) + speed * 0.35, car.y * SCALE - fz * (distance + speed * 1.1));
        const target = new THREE.Vector3(car.x * SCALE + fx * (3.5 + speed * 1.5), 1.05, car.y * SCALE + fz * (3.5 + speed * 1.5));
        state.position.lerp(desired, state.ready ? 1 - Math.exp(-7 * dt) : 1); state.target.lerp(target, state.ready ? 1 - Math.exp(-9 * dt) : 1); state.ready = true;
        state.camera.position.copy(state.position); state.camera.lookAt(state.target);
        state.camera.aspect = width * view.width / (height * view.height); state.camera.fov = 59 + (motion ? speed * 4 + (car.boosting ? 3 : 0) : 0); state.camera.updateProjectionMatrix();
        for (const racer of race.cars) {
          const mesh = cars.get(racer.id);
          const nearCamera = Math.hypot(mesh.position.x - state.camera.position.x, mesh.position.z - state.camera.position.z) < 4.5;
          mesh.visible = racer.id === car.id || !nearCamera;
          mesh.userData.label.visible = labels && !racer.isBot && racer.id !== car.id && !nearCamera;
        }
        const x = Math.round(view.x * width), y = Math.round((1 - view.y - view.height) * height), gap = views.length > 1 ? 2 : 0;
        const viewportWidth = Math.round(view.width * width) - (view.x + view.width < 1 ? gap : 0), viewportHeight = Math.round(view.height * height) - (view.y + view.height < 1 ? gap : 0);
        renderer.setViewport(x, y, viewportWidth, viewportHeight); renderer.setScissor(x, y, viewportWidth, viewportHeight); renderer.render(scene, state.camera);
        stats.calls += renderer.info.render.calls; stats.triangles += renderer.info.render.triangles;
      }
      renderer.setScissorTest(false);
    },
    dispose() {
      if (disposed) return; disposed = true; disposeObject(scene); environment.dispose(); hdrEnvironment?.dispose();art.dispose();template.then(disposeObject).catch(() => {}); renderer.dispose();
    },
  };
}
