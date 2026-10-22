import * as THREE from '../vendor/three.module.js';
import { RGBELoader } from '../vendor/RGBELoader.js';
import { nearestOnTrack } from './engine.js';

export function createArtLibrary(renderer) {
  const loader = new THREE.TextureLoader();
  const textures = new Map();
  const status = { pending: 0, errors: [] };
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function texture(name, color = false) {
    if (textures.has(name)) return textures.get(name);
    status.pending++;
    const map = loader.load(new URL(`../assets/pbr/${name}.jpg`, import.meta.url).href,
      () => { status.pending--; }, undefined,
      () => { status.pending--; status.errors.push(name); });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = anisotropy;
    if (color) map.colorSpace = THREE.SRGBColorSpace;
    textures.set(name, map); return map;
  }
  return {
    status,
    surface(kind, color = '#ffffff', tile = 3) {
      const surface = new THREE.MeshStandardMaterial({ color,
        map: texture(`${kind}-diff`, true), normalMap: texture(`${kind}-normal`),
        roughnessMap: texture(`${kind}-rough`), roughness: 1,
        normalScale: new THREE.Vector2(kind === 'asphalt' ? .55 : .35, kind === 'asphalt' ? .55 : .35),
      });
      surface.userData.worldTile = tile;
      return surface;
    },
    async environment() {
      status.pending++;
      try {
        const hdr = await new RGBELoader().loadAsync(new URL('../assets/pbr/industrial-sunset.hdr', import.meta.url).href);
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        return hdr;
      } catch (error) { status.errors.push('industrial-sunset'); throw error; }
      finally { status.pending--; }
    },
    dispose() { for (const map of textures.values()) map.dispose(); },
  };
}

export function addTrackFurniture(batch, track, surfaces) {
  const steel = surfaces.steel, concrete = surfaces.concrete;
  const white = new THREE.MeshStandardMaterial({ color: '#e4ded0', roughness: .68 });
  const red = new THREE.MeshStandardMaterial({ color: '#9e342a', roughness: .62 });
  const direction = new THREE.MeshBasicMaterial({ color: '#edcb72' });
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  for (let i = 0; i < track.points.length; i += 5) {
    const p = track.points[i], next = track.points[(i + 5) % track.points.length];
    const length = Math.hypot(next.x - p.x, next.y - p.y) * .1;
    const angle = Math.atan2(next.y - p.y, next.x - p.x);
    for (const side of [-1, 1]) {
      const offset = track.width * .05 + 1.8;
      const x = (p.x + next.x) * .05 + p.nx * offset * side;
      const z = (p.y + next.y) * .05 + p.ny * offset * side;
      if (i % 20 < 10) {
        batch.box(steel, x, .58, z, length + .2, .1, .16, -angle);
        batch.box(steel, x, 1.02, z, length + .2, .21, .15, -angle);
        batch.box(steel, x, .6, z, .14, 1.2, .18, -angle);
      } else {
        batch.box(concrete, x, .36, z, length - .05, .72, .58, -angle);
        batch.box(i % 20 === 10 ? red : white, x, .74, z, length - .05, .08, .6, -angle);
      }
      if (i % 30 === 0) {
        batch.box(steel, x, 2.3, z, .08, 3.4, .08);
        batch.box(steel, x, 3.6, z, 2.4, 1.1, .07, -angle);
        for (const shift of [-.7, .1]) {
          const tx = x + Math.cos(angle) * shift, tz = z + Math.sin(angle) * shift;
          batch.add(new THREE.BoxGeometry(1, 1, 1), direction, [tx, 3.6, tz], [.12, .68, .08], [0, -angle, -.5 * side]);
        }
      }
    }
  }
  for (const [x, z] of [[57, 40], [105, 54], [80, 91]]) {
    if(nearestOnTrack(track,x*10,z*10).distance*.1<track.width*.05+3)continue;
    for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++) {
      batch.add(cylinder, row % 2 ? red : steel, [x + column * .63, .3 + row * .57, z], [.38, .56, .38]);
    }
  }
  cylinder.dispose();
}

export function addIndustrialDetail(batch, palette) {
  const dark = new THREE.MeshStandardMaterial({ color: '#2b3337', metalness: .55, roughness: .5 });
  const galvanized = new THREE.MeshStandardMaterial({ color: '#87918b', metalness: .7, roughness: .38 });
  const black = new THREE.MeshStandardMaterial({ color: '#151b20', roughness: .65 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1c373d', metalness: .65, roughness: .16 });
  const pipe = new THREE.CylinderGeometry(1, 1, 1, 14);
  for (let i = 0; i < 4; i++) {
    const x = 66 + i * 7.5;
    batch.box(galvanized, x, 10.8, 47, 3.2, 1.8, 2.1);
    for (let rib = 0; rib < 10; rib++) batch.box(dark, x - 1.35 + rib * .3, 10.9, 45.9, .08, 1.3, .06);
    batch.add(pipe, galvanized, [x, 12.1, 47], [.7, .8, .7]);
    batch.box(dark, x, 12.55, 47, 1.7, .14, 1.7);
  }
  for (let row = 0; row < 2; row++) for (let col = 0; col < 11; col++) {
    const x = 65 + col * 2.4;
    batch.box(dark, x, 6.9 + row * 1.1, 37.3, 2.1, .9, .12);
    batch.box(glass, x, 6.9 + row * 1.1, 37.18, 1.9, .72, .12);
  }
  for (let i = 0; i < 3; i++) {
    batch.add(pipe, galvanized, [64, 1.7 + i * .35, 48], [.13, 16, .13], [Math.PI / 2, 0, 0]);
  }
  for (const [x,z] of [[62,33],[95,33]]) {
    batch.box(dark, x, 1.4, z, 1.7, 2.8, .6);
    batch.box(black, x, 1.5, z-.35, 1.35, 2.3, .08);
    for(let row=0;row<6;row++)batch.box(galvanized,x,1+row*.22,z-.4,1.1,.06,.04);
  }
  pipe.dispose();
}

export function makeDistantTerrain(palette, seed) {
  const geometry = new THREE.PlaneGeometry(800, 800, 64, 64);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x=pos.getX(i)+80,z=pos.getZ(i)+50;
    const distance=Math.hypot(x-80,z-50);
    const height=Math.max(0,Math.min(1,(distance-115)/90))*(14+12*Math.sin(x*.032+seed)*Math.cos(z*.021)+6*Math.sin(x*.071+z*.049));
    pos.setY(i,height-2);pos.setX(i,x);pos.setZ(i,z);
  }
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:palette.ground,roughness:1}));
  mesh.receiveShadow=true;return mesh;
}
