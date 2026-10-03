// Partículas (humo, fuego, chispas, corazones, lágrimas…) y textos flotantes.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

function makeTex(draw, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const soft = (inner, outer) => makeTex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
const emoji = (e) => makeTex((g, s) => { g.font = `${s * 0.8}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, s / 2, s / 2 + 4); }, 96);

const TYPES = {
  smoke: { tex: () => soft('rgba(120,120,120,.75)', 'rgba(120,120,120,0)'), blend: THREE.NormalBlending, life: [1.6, 2.6], size: [1.5, 3.5], grow: 1.8, vy: [0.8, 1.8], spread: 0.6, grav: 0 },
  dark: { tex: () => soft('rgba(40,35,35,.8)', 'rgba(40,35,35,0)'), blend: THREE.NormalBlending, life: [1.8, 3], size: [2, 4], grow: 2, vy: [1.2, 2.2], spread: 0.6, grav: 0 },
  fire: { tex: () => soft('rgba(255,220,120,1)', 'rgba(255,80,0,0)'), blend: THREE.AdditiveBlending, life: [0.4, 0.9], size: [0.8, 1.8], grow: -0.6, vy: [1.5, 3], spread: 0.5, grav: 0 },
  spark: { tex: () => soft('rgba(255,255,200,1)', 'rgba(255,180,40,0)'), blend: THREE.AdditiveBlending, life: [0.3, 0.6], size: [0.25, 0.5], grow: -0.5, vy: [2, 6], spread: 4, grav: -12 },
  dust: { tex: () => soft('rgba(170,140,100,.7)', 'rgba(170,140,100,0)'), blend: THREE.NormalBlending, life: [0.8, 1.4], size: [1, 2.2], grow: 1.5, vy: [0.3, 1.2], spread: 2.5, grav: 0 },
  magic: { tex: () => soft('rgba(220,150,255,1)', 'rgba(120,0,255,0)'), blend: THREE.AdditiveBlending, life: [0.5, 1.1], size: [0.5, 1.2], grow: -0.4, vy: [0.5, 2], spread: 1.5, grav: 0 },
  gold: { tex: () => soft('rgba(255,240,150,1)', 'rgba(255,190,0,0)'), blend: THREE.AdditiveBlending, life: [0.8, 1.5], size: [0.3, 0.7], grow: -0.3, vy: [2, 5], spread: 2.5, grav: -5 },
  heal: { tex: () => soft('rgba(150,255,170,1)', 'rgba(0,200,80,0)'), blend: THREE.AdditiveBlending, life: [0.8, 1.4], size: [0.4, 0.9], grow: -0.3, vy: [1.5, 3], spread: 1.5, grav: 0 },
  heart: { tex: () => emoji('💖'), blend: THREE.NormalBlending, life: [1.4, 2.2], size: [0.7, 1.2], grow: 0.2, vy: [1.2, 2.2], spread: 1, grav: 0 },
  tear: { tex: () => emoji('💧'), blend: THREE.NormalBlending, life: [0.6, 1], size: [0.35, 0.5], grow: 0, vy: [0.5, 1], spread: 0.6, grav: -9 },
  star: { tex: () => emoji('⭐'), blend: THREE.NormalBlending, life: [1, 1.6], size: [0.5, 0.9], grow: 0, vy: [3, 6], spread: 3, grav: -8 },
  ice: { tex: () => soft('rgba(200,240,255,1)', 'rgba(80,180,255,0)'), blend: THREE.AdditiveBlending, life: [0.5, 1], size: [0.4, 0.9], grow: -0.3, vy: [0.5, 1.5], spread: 1, grav: 0 },
};
const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(scene) {
    this.scene = scene; this.parts = []; this.pool = {}; this.mats = {};
    for (const [k, t] of Object.entries(TYPES)) this.mats[k] = new THREE.SpriteMaterial({ map: t.tex(), transparent: true, depthWrite: false, blending: t.blend });
    this.labels = [];
  }
  emit(type, pos, n = 1, opts = {}) {
    const T = TYPES[type]; if (!T) return;
    if (this.parts.length > 900) return;
    for (let i = 0; i < n; i++) {
      let s = (this.pool[type] ||= []).pop();
      if (!s) { s = new THREE.Sprite(this.mats[type].clone()); s.renderOrder = 5; }
      const sp = opts.spread ?? T.spread;
      s.position.set(pos.x + rnd(-0.3, 0.3) * (opts.area || 1), pos.y + rnd(0, 0.3), pos.z + rnd(-0.3, 0.3) * (opts.area || 1));
      const size = rnd(...T.size) * (opts.scale || 1);
      s.userData = { type, life: rnd(...T.life) * (opts.life || 1), age: 0, size, v: new THREE.Vector3(rnd(-sp, sp), rnd(...T.vy) * (opts.vy || 1), rnd(-sp, sp)), grav: T.grav, grow: T.grow, rot: rnd(-1, 1) };
      if (opts.vel) s.userData.v.add(opts.vel);
      s.scale.setScalar(size); s.material.opacity = 1; s.material.rotation = rnd(0, 6);
      if (opts.color) s.material.color.set(opts.color); else s.material.color.set(0xffffff);
      this.scene.add(s); this.parts.push(s);
    }
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const s = this.parts[i], u = s.userData;
      u.age += dt;
      if (u.age >= u.life) { this.scene.remove(s); this.parts.splice(i, 1); this.pool[u.type].push(s); continue; }
      u.v.y += u.grav * dt; s.position.addScaledVector(u.v, dt);
      if (u.grav && s.position.y < 0.05) { s.position.y = 0.05; u.v.set(0, 0, 0); }
      const k = u.age / u.life;
      s.scale.setScalar(Math.max(0.01, u.size * (1 + u.grow * k)));
      s.material.opacity = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      s.material.rotation += u.rot * dt;
    }
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i]; l.age += dt;
      l.obj.position.y += dt * l.speed;
      l.obj.element.style.opacity = Math.max(0, 1 - Math.max(0, l.age - l.life * 0.6) / (l.life * 0.4));
      if (l.age > l.life) { l.obj.removeFromParent(); this.labels.splice(i, 1); }
    }
  }
  // Texto que sube y se desvanece (ej. "+5 🏹", "-2%")
  text(pos, txt, cls = '', life = 1.6, speed = 2) {
    const d = document.createElement('div'); d.className = 'ftext ' + cls; d.textContent = txt;
    const o = new CSS2DObject(d); o.position.copy(pos); this.scene.add(o);
    this.labels.push({ obj: o, age: 0, life, speed });
  }
}
