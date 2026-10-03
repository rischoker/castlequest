// Personajes animados: jugadores, aldeanos, enemigos y la princesa.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as A from './assets.js';

const KAY = new Set(['Barbarian', 'Knight', 'Mage', 'Ranger', 'Rogue', 'Rogue_Hooded', 'Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior']);

// nombres lógicos de animación → nombres reales en cada familia de modelos
const MAP_KAY = {
  idle: ['Idle_A'], idle2: ['Idle_B'], walk: ['Walking_A'], run: ['Running_A'], cheer: ['Cheering'], death: ['Death_A', 'Skeletons_Death'], hit: ['Hit_A'],
  attack: ['Melee_1H_Attack_Chop', 'Melee_2H_Attack_Chop', 'Melee_Unarmed_Attack_Punch_A'], shoot: ['Ranged_2H_Shoot'], reload: ['Ranged_2H_Reload'], aim: ['Ranged_2H_Aiming'],
  cast: ['Ranged_Magic_Spellcasting'], castShot: ['Ranged_Magic_Shoot'], interact: ['Interact'], pickup: ['PickUp'], hammer: ['Hammering', 'Hammer'], sad: ['Sit_Floor_Idle'],
  rise: ['Skeletons_Awaken_Floor'], taunt: ['Skeletons_Taunt'], spawn: ['Spawn_Ground'],
};
const MAP_Q = {
  idle: ['Idle'], walk: ['Walk'], run: ['Run'], death: ['Death'], hit: ['HitReact', 'HitRecieve', 'RecieveHit'], attack: ['Punch', 'Attack', 'Weapon', 'Idle_Attack', 'Dagger_Attack'],
  cheer: ['Yes', 'Wave', 'Jump'], pickup: ['PickUp'], crawl: ['Crawl'], throw: ['Punch', 'Attack'],
};

export class Unit {
  constructor(key, { height = 1.8, tint, tintAmt = 0.4, emissive } = {}) {
    this.key = key;
    const short = key.split('/')[1];
    this.isKay = KAY.has(short);
    this.root = new THREE.Group();
    this.model = A.clone(key, { skinned: true });
    if (tint) A.tint(this.model, tint, tintAmt, emissive);
    this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    A.fitHeight(this.model, height);
    this.root.add(this.model);
    this.height = height;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clipList = this.isKay ? Object.values(A.kayClips) : A.clips(key);
    this.map = this.isKay ? MAP_KAY : MAP_Q;
    this.actions = {}; this.current = null; this.cur = '';
    this.static = !this.clipList.length && !this.isKay;
    this.t = Math.random() * 10;
  }
  action(name) {
    if (this.actions[name] !== undefined) return this.actions[name];
    let clip = null;
    const names = this.map[name] || [name];
    clip = A.findClip(this.clipList, ...names);
    if (!clip && !this.isKay) clip = A.findClip(this.clipList, ...(MAP_Q[name] || []));
    const a = clip ? this.mixer.clipAction(clip) : null;
    this.actions[name] = a; return a;
  }
  play(name, { once = false, fade = 0.2, speed = 1, force = false } = {}) {
    if (this.cur === name && !force) return this.current;
    const a = this.action(name) || (name !== 'idle' ? this.action('idle') : null);
    if (!a) { this.cur = name; return null; }
    a.reset(); a.enabled = true; a.setEffectiveTimeScale(speed); a.setEffectiveWeight(1);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    a.play(); this.current = a; this.cur = name;
    return a;
  }
  duration(name) { const a = this.action(name); return a ? a.getClip().duration : 1; }
  update(dt) {
    this.t += dt;
    this.mixer.update(dt);
    if (this.static) {
      // modelos sin animaciones: balanceo procedural para que se vean vivos
      const m = this.model, moving = this.cur === 'walk' || this.cur === 'run';
      m.position.y = moving ? Math.abs(Math.sin(this.t * 8)) * 0.15 * this.height : Math.sin(this.t * 2) * 0.03 * this.height;
      m.rotation.z = moving ? Math.sin(this.t * 8) * 0.12 : 0;
      if (this.cur === 'attack') m.rotation.x = Math.max(0, Math.sin(this.t * 6)) * 0.35;
      else if (this.cur !== 'death') m.rotation.x = 0;
    }
  }
  faceTo(x, z, dt, speed = 10) {
    const want = Math.atan2(x - this.root.position.x, z - this.root.position.z);
    let d = want - this.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += dt ? d * Math.min(1, dt * speed) : d;
  }
  label(html, cls = 'nameplate', y) {
    if (!this.lbl) {
      const d = document.createElement('div'); d.className = cls;
      this.lbl = new CSS2DObject(d); this.lbl.position.y = y ?? this.height + 0.45; this.root.add(this.lbl);
    }
    this.lbl.element.innerHTML = html; return this.lbl.element;
  }
  dispose() {
    this.mixer.stopAllAction();
    if (this.lbl) { this.lbl.element.remove(); this.lbl.removeFromParent(); }
    if (this.bar) this.bar.removeFromParent();
    this.root.removeFromParent();
  }
  // Barra de vida flotante (sprites)
  hpBar(frac, color = 0xe74c3c, w = 1.4) {
    if (!this.bar) {
      this.bar = new THREE.Group();
      const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.75 }));
      bg.scale.set(w + 0.12, 0.22, 1); this.bar.add(bg);
      const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false }));
      fg.center.set(0, 0.5); fg.position.x = -w / 2; fg.scale.set(w, 0.14, 1); this.bar.add(fg);
      bg.renderOrder = 10; fg.renderOrder = 11;
      this.bar.userData = { fg, w };
      this.bar.position.y = this.height + 0.35; this.root.add(this.bar);
    }
    this.bar.userData.fg.scale.x = Math.max(0.001, this.bar.userData.w * frac);
    this.bar.visible = frac < 0.999;
  }
}

// El cabello de la maga es negro en la paleta de colores del modelo: lo pintamos dorado
// para que combine con la trenza (solo en la copia de la textura de la princesa).
function blondeHair(tex) {
  const img = tex.image, c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const w = c.width / 8, h = c.height / 4;
  const cols = [1]; // columna de la paleta con el negro del cabello (los ojos usan otra y siguen negros)
  for (const col of cols) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffe58a'); gr.addColorStop(0.6, '#f2c043'); gr.addColorStop(1, '#c98a1c');
    g.fillStyle = gr; g.fillRect(col * w, 0, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.magFilter = tex.magFilter; t.minFilter = tex.minFilter;
  return t;
}

// La princesa: maga sin sombrero, vestido rosa, corona y una trenza larguísima.
export function makePrincess() {
  const u = new Unit('chars/Mage', { height: 2.6 });
  u.model.traverse(o => {
    if (!o.isMesh) return;
    if (/Hat/i.test(o.name)) { o.visible = false; return; }
    o.material = o.material.clone();
    if (/Body|Cape/.test(o.name)) { o.material.map = null; o.material.color.set(o.name.includes('Cape') ? 0xffd34e : 0xff7ab8); o.material.needsUpdate = true; }
    else if (/Arm|Leg/.test(o.name)) o.material.color.set(0xffd0e8);
    else if (/Head/.test(o.name) && o.material.map) { o.material.map = blondeHair(o.material.map); o.material.needsUpdate = true; }
  });
  // corona
  let head = null; u.model.traverse(o => { if (o.isBone && /head/i.test(o.name) && !head) head = o; });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd34e, metalness: 0.8, roughness: 0.25, emissive: 0x5a3b00, emissiveIntensity: 0.4 });
  const crown = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.2, 10, 1, true), gold); crown.add(ring);
  for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), gold); const a = i / 5 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.33, 0.18, Math.sin(a) * 0.33); crown.add(sp); }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshStandardMaterial({ color: 0xff2266, emissive: 0xff0044, emissiveIntensity: 0.6 })); gem.position.set(0, 0.04, 0.35); crown.add(gem);
  if (head) {
    // compensamos la escala acumulada del hueso para que la corona mida lo mismo en el mundo
    u.model.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); head.getWorldScale(ws);
    const k = 1 / ws.x;
    crown.scale.setScalar(k * 1.1); crown.position.set(0, k * 0.98, 0); head.add(crown);
  }
  u.head = head;
  return u;
}

// Trenza dorada de tres mechones que cuelga desde la torre hasta el suelo (se mece con el viento)
const BRAID_MAT = new THREE.MeshStandardMaterial({ color: 0xffd75e, roughness: 0.5, emissive: 0x6a4a00, emissiveIntensity: 0.35 });
function braidGeo(center) {
  const geos = [];
  const curve = new THREE.CatmullRomCurve3(center);
  const N = 140;
  for (let s = 0; s < 3; s++) {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const k = i / N, p = curve.getPointAt(k), r = 0.14 * (1 - k * 0.35);
      const a = k * 60 + s * Math.PI * 2 / 3;
      pts.push(new THREE.Vector3(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r));
    }
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.12 * (1 - s * 0.05), 5));
  }
  return geos;
}
export function makeBraid(top, bottomY = 0.2, out = new THREE.Vector3(0, 0, 1)) {
  const pts = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    // sale por encima del almenado y luego cae pegada a la pared
    const push = k < 0.12 ? k / 0.12 * 1.3 : 1.3 + (k - 0.12) * 0.5;
    pts.push(new THREE.Vector3(top.x + out.x * push, top.y + (k < 0.12 ? Math.sin(k / 0.12 * Math.PI) * 0.4 : 0) - (top.y - bottomY) * Math.max(0, (k - 0.08) / 0.92), top.z + out.z * push));
  }
  const group = new THREE.Group();
  const meshes = braidGeo(pts).map(g => { const m = new THREE.Mesh(g, BRAID_MAT); m.castShadow = true; group.add(m); return m; });
  const bow = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.07, 32, 6), new THREE.MeshStandardMaterial({ color: 0xff4f9a }));
  bow.position.copy(pts[n]); group.add(bow);
  group.userData = { base: pts.map(p => p.clone()), t: 0, bow, meshes };
  return group;
}
export function swayBraid(group, dt) {
  const u = group.userData; u.t += dt;
  if ((u.f = (u.f || 0) + 1) % 4) return; // actualizar cada 4 frames basta
  const pts = u.base.map((p, i) => { const k = i / (u.base.length - 1); const w = Math.max(0, k - 0.15); return new THREE.Vector3(p.x + Math.sin(u.t * 1.3 + k * 3) * w * 0.45, p.y, p.z + Math.cos(u.t * 1.1 + k * 2) * w * 0.3); });
  const geos = braidGeo(pts);
  u.meshes.forEach((m, i) => { m.geometry.dispose(); m.geometry = geos[i]; });
  u.bow.position.copy(pts[pts.length - 1]);
}
