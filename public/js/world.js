// Escenario: cielo, terreno, bosque, montañas y el castillo (murallas por tramos con daño).
import * as THREE from 'three';
import * as A from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HALF = 12;          // medio lado del castillo
export const WALL_H = 4.6;       // altura de la muralla
export const WALK_Y = 3.75;      // altura del adarve (donde se paran los defensores)
export const GATE_POS = new THREE.Vector3(5, 0, HALF);
const rnd = (a, b) => a + Math.random() * (b - a);

export function buildSky(scene) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#3d7fd1'); gr.addColorStop(0.45, '#8fc3f0'); gr.addColorStop(0.75, '#f6d9a8'); gr.addColorStop(1, '#f0b77a');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
  scene.fog = new THREE.Fog(0xcfe0e8, 90, 230);
}

export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xdcefff, 0x5a6b3a, 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(-30, 55, 35); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera; s.left = -42; s.right = 42; s.top = 42; s.bottom = -42; s.near = 5; s.far = 140;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun);
  return { hemi, sun };
}

export function buildGround(scene) {
  // terreno con ondulaciones suaves fuera del área de juego y color variado
  const geo = new THREE.PlaneGeometry(520, 520, 180, 180);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = [];
  const c1 = new THREE.Color(0x6fae4a), c2 = new THREE.Color(0x8cc152), c3 = new THREE.Color(0x4f8f3a), dirt = new THREE.Color(0xa88a5c);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    const n = Math.sin(x * 0.11) * Math.cos(z * 0.13) + Math.sin(x * 0.031 + z * 0.047) * 0.8;
    if (r > 75) pos.setY(i, (r - 75) * 0.06 * (1 + n * 0.5));
    const c = c1.clone().lerp(n > 0 ? c2 : c3, Math.abs(n) * 0.5);
    // tierra pisoteada alrededor del castillo
    const sq = Math.max(Math.abs(x), Math.abs(z));
    if (sq < HALF + 7) c.lerp(dirt, Math.max(0, 1 - (sq - HALF) / 7) * 0.55);
    // camino al portón
    if (z > HALF && Math.abs(x - GATE_POS.x - Math.sin(z * 0.08) * 3) < 3.2) c.lerp(dirt, 0.75);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true; scene.add(ground);
  // patio interior empedrado
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ color: 0xb9a383, roughness: 1 }));
  yard.rotation.x = -Math.PI / 2; yard.position.y = 0.02; yard.receiveShadow = true; scene.add(yard);
  return ground;
}

// Une muchos objetos estáticos en pocas mallas (muchas menos llamadas de dibujo = más FPS)
function mergeStatic(root, scene, castShadow) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, img = m.map && m.map.image;
    const key = m.name + '|' + (img ? img.width + 'x' + img.height : 'c' + m.color.getHex()) + '|' + m.transparent;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!buckets.has(key)) buckets.set(key, { mat: m, geos: [] });
    buckets.get(key).geos.push(g);
  });
  for (const { mat, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = castShadow; mesh.receiveShadow = true; scene.add(mesh);
  }
}

function place(key, x, z, { s = 1, ry = 0, y = 0, scene, shadow = true } = {}) {
  const o = A.clone(key); o.scale.setScalar(s); o.position.set(x, y, z); o.rotation.y = ry;
  if (!shadow) o.traverse(m => { if (m.isMesh) m.castShadow = false; });
  scene.add(o); return o;
}

export function buildScenery(realScene) {
  const clouds = [];
  const far = new THREE.Group(), near = new THREE.Group();
  let scene = far;
  // montañas al fondo (norte y lados)
  const mts = ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees', 'mountain_A', 'mountain_B', 'mountain_C'];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (1.08 + i / 25 * 0.84) + rnd(-0.03, 0.03), r = rnd(120, 170);
    place('deco/' + mts[i % mts.length], Math.cos(a) * r, Math.sin(a) * r, { s: rnd(16, 26), ry: rnd(0, 6), scene, shadow: false });
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.15 + i / 13 * 0.7) + rnd(-0.05, 0.05), r = rnd(125, 170);
    place('deco/hills_' + 'ABC'[i % 3] + '_trees', Math.cos(a) * r, Math.sin(a) * r, { s: rnd(14, 20), ry: rnd(0, 6), scene, shadow: false });
  }
  // bosque en anillo, dejando claros por donde salen los enemigos y el camino
  scene = near;
  const trees = A.MODELS.nature.filter(n => n.startsWith('Tree'));
  for (let i = 0; i < 420; i++) {
    const a = rnd(0, Math.PI * 2), r = 42 + Math.pow(Math.random(), 0.7) * 70;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 20 && Math.abs(x - GATE_POS.x) < 9) continue; // camino
    place('nature/' + trees[(Math.random() * trees.length) | 0], x, z, { s: rnd(1.6, 2.8), ry: rnd(0, 6), scene: r < 60 ? near : far });
  }
  const small = ['Bush_1_A', 'Bush_2_A', 'Bush_3_A', 'Bush_4_A', 'Rock_1_A', 'Rock_2_A', 'Rock_3_A', 'Grass_1_A', 'Grass_2_A', 'Grass_1_A', 'Grass_2_A'];
  scene = far;
  for (let i = 0; i < 260; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(HALF + 6, 75);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > HALF && Math.abs(x - GATE_POS.x) < 4) continue;
    place('nature/' + small[(Math.random() * small.length) | 0], x, z, { s: rnd(1.2, 2.2), ry: rnd(0, 6), scene, shadow: false });
  }
  // aldea al sur, junto al camino (de ahí vienen los aldeanos)
  const village = [['castle/home_A', -6, 48], ['castle/home_B', 16, 46], ['castle/windmill', -14, 56], ['castle/home_A', 18, 58], ['castle/grain', -4, 58], ['castle/home_B', -12, 44], ['castle/church', 26, 52]];
  for (const [k, x, z] of village) place(k, x, z, { s: 4, ry: Math.atan2(GATE_POS.x - x, HALF - z), scene: near });
  mergeStatic(near, realScene, true); mergeStatic(far, realScene, false);
  scene = realScene;
  for (let i = 0; i < 10; i++) {
    const c = place('deco/cloud_' + (i % 3 ? 'big' : 'small'), rnd(-140, 140), rnd(-120, 60), { s: rnd(10, 18), y: rnd(38, 55), scene, shadow: false });
    clouds.push(c);
  }
  return { clouds };
}

// ---------- Ballesta de asedio (procedural) ----------
export function makeBallista() {
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4b26, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a2c16, roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4 });
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 8), dark); base.position.y = 0.25; root.add(base);
  const yaw = new THREE.Group(); yaw.position.y = 0.5; root.add(yaw);
  const pitch = new THREE.Group(); pitch.position.y = 0.45; yaw.add(pitch);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), wood); post.position.y = -0.15; yaw.add(post);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 2.6), wood); stock.position.z = 0.4; pitch.add(stock);
  const armGeo = new THREE.BoxGeometry(1.25, 0.14, 0.16);
  for (const sgn of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, dark); arm.position.set(sgn * 0.7, 0.05, 1.35); arm.rotation.y = sgn * 0.42; pitch.add(arm);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), iron); tip.position.set(sgn * 1.27, 0.05, 1.05); pitch.add(tip);
  }
  const strGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.27, 0.06, 1.05), new THREE.Vector3(0, 0.12, -0.5), new THREE.Vector3(1.27, 0.06, 1.05)]);
  const string = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: 0xeeeeee })); pitch.add(string);
  const bolt = makeBoltMesh(); bolt.position.set(0, 0.2, 0.5); pitch.add(bolt);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  root.userData = { yaw, pitch, bolt, string };
  return root;
}
export function makeBoltMesh() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5), new THREE.MeshStandardMaterial({ color: 0x5b3a1e }));
  shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.7, roughness: 0.3 }));
  head.rotation.x = Math.PI / 2; head.position.z = 1.05; g.add(head);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.3), new THREE.MeshStandardMaterial({ color: 0xd94b3a })); fl.position.z = -0.8; g.add(fl);
  return g;
}

// ---------- Castillo ----------
export function buildCastle(scene) {
  const castle = { segments: [], towers: [], keep: null, princessSpot: null, gate: null, yardSpots: [] };
  const sides = [
    { n: new THREE.Vector3(0, 0, 1), along: new THREE.Vector3(1, 0, 0), ry: 0 },              // sur (frente)
    { n: new THREE.Vector3(1, 0, 0), along: new THREE.Vector3(0, 0, -1), ry: Math.PI / 2 },   // este
    { n: new THREE.Vector3(0, 0, -1), along: new THREE.Vector3(-1, 0, 0), ry: Math.PI },      // norte
    { n: new THREE.Vector3(-1, 0, 0), along: new THREE.Vector3(0, 0, 1), ry: -Math.PI / 2 },  // oeste
  ];
  let id = 0;
  for (const [si, sd] of sides.entries()) {
    for (const off of [-5, 5]) {
      const center = sd.n.clone().multiplyScalar(HALF).addScaledVector(sd.along, off);
      const isGate = si === 0 && off === 5;
      const grp = new THREE.Group(); grp.position.copy(center); grp.rotation.y = sd.ry; scene.add(grp);
      const wall = A.clone(isGate ? 'castle/wall_straight_gate' : 'castle/wall_straight');
      wall.scale.set(5, 4.2, 4); grp.add(wall);
      // materiales propios para poder oscurecer el tramo cuando se daña
      wall.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.userData.baseColor = o.material.color.clone(); } });
      const seg = {
        id: id++, side: si, center, n: sd.n.clone(), along: sd.along.clone(), ry: sd.ry, grp, wall, isGate,
        hp: 100, maxHp: 100, state: 0, emitT: 0, attackers: 0,
        outer: center.clone().addScaledVector(sd.n, 2.2), inner: center.clone().addScaledVector(sd.n, -3.2),
        top: center.clone().setY(WALK_Y),
      };
      if (isGate) {
        castle.gate = { seg, open: 0, target: 0, doors: [] };
        wall.traverse(o => { if (/door_left/.test(o.name)) castle.gate.doors.push({ o, dir: 1 }); if (/door_right/.test(o.name)) castle.gate.doors.push({ o, dir: -1 }); });
      }
      // ballesta encima de cada tramo (en el portón, sobre el arco)
      const b = makeBallista(); b.scale.setScalar(1.15);
      b.position.copy(center).addScaledVector(sd.n, 0.3).setY(isGate ? WALL_H + 0.55 : WALK_Y + 0.15);
      b.rotation.y = Math.atan2(sd.n.x, sd.n.z); scene.add(b);
      seg.ballista = { obj: b, cd: Math.random(), target: null, recoil: 0, aim: b.rotation.y };
      seg.crew = center.clone().addScaledVector(sd.n, -1.3).addScaledVector(sd.along, 1.2).setY(isGate ? WALL_H + 0.4 : WALK_Y);
      castle.segments.push(seg);
    }
  }
  // torres en las esquinas
  for (const [x, z] of [[HALF, HALF], [HALF, -HALF], [-HALF, -HALF], [-HALF, HALF]]) {
    const t = A.clone('castle/tower_A'); t.scale.setScalar(4.6); t.position.set(x, 0, z); t.rotation.y = Math.atan2(x, z); scene.add(t);
    castle.towers.push(t);
    const f = A.clone('deco/flag_red'); f.scale.setScalar(9); f.position.set(x, 10.1, z); scene.add(f);
  }
  // torre del homenaje y torre de la princesa
  const keep = A.clone('castle/castle'); keep.scale.setScalar(3.6); keep.position.set(1.5, 0, -5); scene.add(keep); castle.keep = keep;
  const pt = A.clone('castle/tower_B'); pt.scale.setScalar(6.6); pt.position.set(-6.2, 0, -3); pt.rotation.y = 0.5; scene.add(pt);
  castle.princessTower = pt;
  // sin techo: así la princesa se ve desde la cámara alta
  pt.traverse(o => { if (/top/i.test(o.name) && o.isMesh) o.visible = false; });
  const banner = A.clone('deco/flag_yellow'); banner.scale.setScalar(14); banner.position.set(-6.2 + 0.6, 2.49 * 6.6 * 0.585, -3 - 1.2); scene.add(banner);
  castle.princessSpot = new THREE.Vector3(-6.2 - 0.5 * 3.35, 2.49 * 6.6 * 0.585, -3 + 0.86 * 3.35);
  // utilería del patio
  const props = [['deco/well', 'castle/well', 4.5, -3.5, 7, 3], ['deco/tent', 'deco/tent', -7, 7, 6, 0.4], ['', 'deco/crate_A_big', 7.5, 7.5, 7, 0], ['', 'deco/crate_B_big', 8.4, 6.2, 7, 0.5], ['', 'deco/barrel', 6.5, 8.6, 7, 0],
    ['', 'deco/bucket_arrows', -2, 8.8, 9, 0], ['', 'deco/weaponrack', -9.5, 2, 8, Math.PI / 2], ['', 'res/Wood_Log_Stack', 9, -8, 1.6, 0.3], ['', 'res/Stone_Bricks_Stack_Small', 9.5, 1, 1.8, 0], ['', 'deco/wheelbarrow', 3, 9, 7, 2.5],
    ['', 'deco/sack', -4, 9.5, 8, 0], ['', 'deco/crate_long_A', -9, -8.5, 7, 0.4], ['', 'deco/target', -9.4, -4, 7, Math.PI / 2]];
  for (const [, k, x, z, s, ry] of props) place(k, x, z, { s, ry, scene });
  // puntos donde trabajan los jugadores en el patio
  castle.yardSpots = [
    { p: new THREE.Vector3(8.2, 0, -6.5), anim: 'Chopping', face: new THREE.Vector3(9, 0, -8) },
    { p: new THREE.Vector3(3.5, 0, -1.5), anim: 'Working_A', face: new THREE.Vector3(4.5, 0, -3.5) },
    { p: new THREE.Vector3(8, 0, 2.5), anim: 'Hammering', face: new THREE.Vector3(9.5, 0, 1) },
    { p: new THREE.Vector3(-8, 0, 2), anim: 'Sawing', face: new THREE.Vector3(-9.5, 0, 2) },
    { p: new THREE.Vector3(-7.5, 0, -4), anim: 'Ranged_2H_Aiming', face: new THREE.Vector3(-9.4, 0, -4) },
    { p: new THREE.Vector3(-1, 0, 7), anim: 'PickUp', face: new THREE.Vector3(-2, 0, 8.8) },
    { p: new THREE.Vector3(5.5, 0, 6.5), anim: 'Lockpicking', face: new THREE.Vector3(7.5, 0, 7.5) },
    { p: new THREE.Vector3(-4.5, 0, 4.5), anim: 'Digging', face: new THREE.Vector3(-4.5, 0, 6) },
    { p: new THREE.Vector3(-8, 0, -7), anim: 'Pickaxing', face: new THREE.Vector3(-9, 0, -8.5) },
    { p: new THREE.Vector3(1, 0, 4), anim: 'Cheering', face: new THREE.Vector3(1, 0, 10) },
  ];
  return castle;
}

// Aplica el aspecto visual según la vida del tramo
export function setSegmentLook(seg) {
  const k = seg.hp / seg.maxHp;
  const st = k <= 0 ? 3 : k < 0.34 ? 2 : k < 0.67 ? 1 : 0;
  const dark = [0, 0.25, 0.5, 0.7][st];
  seg.wall.traverse(o => { if (o.isMesh && o.userData.baseColor) o.material.color.copy(o.userData.baseColor).lerp(new THREE.Color(0x2b2420), dark); });
  if (st === seg.state) return false;
  const prev = seg.state; seg.state = st;
  // brecha: el muro desaparece y quedan escombros
  if (st === 3) {
    seg.wall.visible = false;
    if (!seg.rubble) {
      seg.rubble = new THREE.Group();
      for (let i = 0; i < 3; i++) { const r = A.clone('castle/destroyed'); r.scale.setScalar(3.2); r.position.set((i - 1) * 3.3, 0, rnd(-0.5, 0.5)); r.rotation.y = rnd(0, 6); seg.rubble.add(r); }
      seg.grp.add(seg.rubble);
    }
    seg.rubble.visible = true; seg.ballista.obj.visible = false;
  } else {
    seg.wall.visible = true; if (seg.rubble) seg.rubble.visible = false; seg.ballista.obj.visible = true;
  }
  // grietas: piedras sueltas en la base
  if (st >= 1 && !seg.chunks) {
    seg.chunks = new THREE.Group();
    for (let i = 0; i < 4; i++) { const c = A.clone('res/Stone_Chunks_Large'); c.scale.setScalar(rnd(1.4, 2.2)); c.position.set(rnd(-4, 4), 0, rnd(1.8, 2.8)); c.rotation.y = rnd(0, 6); seg.chunks.add(c); }
    seg.grp.add(seg.chunks);
  }
  if (seg.chunks) seg.chunks.visible = st >= 1;
  return st > prev ? 'worse' : 'better';
}
