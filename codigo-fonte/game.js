'use strict';
/* =====================================================================
   FORMOL — protótipo jogável (Three.js r158, sem assets externos)
   Sistemas: mapa em grade, lanterna (normal/foco/bateria/calor),
   IA da criatura (patrulha/investigar/caçar/perseguir/recuo/busca),
   ruído, esconderijos, fusíveis, painel, ignição, checkpoint, áudio.
   ===================================================================== */
(() => {
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

/* ---------------------------------------------------------------
   CONFIG — todos os números de balanceamento num só lugar
   --------------------------------------------------------------- */
const CFG = {
  cell: 2, wallH: 3.2,
  player: { walk: 2.6, run: 5.1, crouch: 1.4, radius: 0.3, eye: 1.65, eyeCrouch: 1.0, stamina: 6, breath: 5 },
  noise: { crouch: 1.5, walk: 5, run: 14, hide: 3, gasp: 7, pickup: 10, install: 30, ignition: 80 },
  flash: {
    normalAngle: 0.45, focusAngle: 0.16, normalDist: 16, focusDist: 26,
    normalI: 60, focusI: 260, drainNormal: 1 / 3, drainFocus: 1 / 0.7,
    heatRate: 1 / 4, coolRate: 0.35, overheat: 3, burnRange: 14, burnCone: 0.13,
    burnBase: 0.8, burnStep: 0.3, burnMax: 2.0, bodySlow: 0.8
  },
  creature: {
    patrol: 1.6, investigate: 2.4, hunt: 2.9, chase: 4.3, recoil: 5.2,
    darkMul: 1.15, lightMul: 0.7, killDist: 1.3, fov: 0.96, // ~110°
    recoilTime: 6, lostTime: 3, intuition: 1.5, searchTime: 25, investigateTime: 12,
    levelSpeed: [1, 1, 1.08, 1.16, 1.25], levelHear: [1, 1, 1.2, 1.4, 1.6]
  },
  ignitionTime: 25
};
const CS = CFG.cell;

/* ---------------------------------------------------------------
   MAPA — grade 44 x 34 (células de 2 m), gerada por retângulos
   --------------------------------------------------------------- */
const W = 44, H = 34;
const grid = new Array(W * H).fill('#');
const idx = (x, z) => z * W + x;
const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
const carve = (x0, z0, x1, z1) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[idx(x, z)] = '.'; };
const wallR = (x0, z0, x1, z1) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[idx(x, z)] = '#'; };

// Ala de Pacientes: corredor + 6 celas
carve(1, 5, 14, 7);
[[1, 4], [6, 9], [11, 14]].forEach(([a, b]) => { carve(a, 1, b, 3); carve(a, 9, b, 11); });
carve(2, 4, 2, 4); carve(7, 4, 7, 4); carve(12, 4, 12, 4);
carve(2, 8, 2, 8); carve(7, 8, 7, 8); carve(12, 8, 12, 8);
carve(5, 8, 5, 12);              // passagem até o corredor central
carve(15, 6, 15, 6);             // porta Pacientes ↔ Enfermaria
// Enfermaria
carve(16, 1, 27, 11); carve(21, 12, 22, 12); carve(28, 3, 28, 3);
// Administração: sala de segurança, arquivos, salão
carve(29, 1, 34, 4); carve(36, 1, 42, 4); carve(29, 6, 42, 11);
carve(31, 5, 31, 5); carve(39, 5, 39, 5); carve(35, 12, 36, 12);
// Corredor central
carve(1, 13, 42, 14);
// Necrotério + câmara fria
carve(1, 16, 14, 25); wallR(6, 20, 6, 25); carve(6, 22, 6, 22); carve(7, 15, 8, 15);
// Recepção
carve(16, 16, 27, 25); carve(20, 15, 23, 15); carve(28, 22, 28, 22);
// Autópsia + laboratório
carve(29, 16, 42, 25); wallR(36, 20, 42, 20); carve(38, 20, 38, 20); carve(35, 15, 35, 15);
// Escada e subsolo
carve(10, 26, 11, 26); carve(1, 27, 18, 32);
wallR(12, 27, 12, 30);
// Porta de saída e rua
grid[idx(21, 26)] = 'X'; grid[idx(22, 26)] = 'X';
carve(20, 27, 24, 32);

function regionAt(x, z) {
  if (z >= 27) return x <= 19 ? 'subsolo' : 'rua';
  if (z >= 13 && z <= 14) return 'corredor';
  if (z <= 12) return x <= 15 ? 'pacientes' : x <= 28 ? 'enfermaria' : 'admin';
  if (z === 26 && x >= 20 && x <= 23) return 'recepcao';
  return x <= 15 ? 'necroterio' : x <= 28 ? 'recepcao' : 'autopsia';
}
const REGION_NAME = {
  pacientes: 'Ala de Pacientes', enfermaria: 'Enfermaria', admin: 'Administração e Arquivos',
  corredor: 'Corredor Central', necroterio: 'Necrotério', recepcao: 'Recepção',
  autopsia: 'Autópsia e Laboratório', subsolo: 'Subsolo', rua: 'Saída'
};

const isWall = (x, z) => !inb(x, z) || grid[idx(x, z)] === '#';
const blocked = new Uint8Array(W * H);
function rebuildBlocked() { for (let i = 0; i < W * H; i++) blocked[i] = (grid[i] === '#' || grid[i] === 'X') ? 1 : 0; for (const p of props) if (p.block) blocked[p.i] = 1; }
const cellOf = v => [Math.floor(v.x / CS), Math.floor(v.z / CS)];
const center = (x, z, y = 0) => new THREE.Vector3(x * CS + CS / 2, y, z * CS + CS / 2);

// Linha de visão na grade (só paredes bloqueiam). Retorna nº de paredes cruzadas.
function wallsBetween(ax, az, bx, bz, stopAt = 99) {
  const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
  const steps = Math.ceil(dist / (CS * 0.25)); let n = 0, last = -1;
  for (let s = 1; s < steps; s++) {
    const t = s / steps, x = Math.floor((ax + dx * t) / CS), z = Math.floor((az + dz * t) / CS);
    const i = idx(x, z);
    if (i !== last && (isWall(x, z) || grid[i] === 'X')) { n++; if (n >= stopAt) return n; }
    last = i;
  }
  return n;
}
const los = (a, b) => wallsBetween(a.x, a.z, b.x, b.z, 1) === 0;

/* ---------------------------------------------------------------
   RENDERER / CENA
   --------------------------------------------------------------- */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // tonemapping ACES feito no pós-processamento
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010202);
scene.fog = new THREE.FogExp2(0x020404, 0.052);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 90);
scene.add(camera);
const ambient = new THREE.HemisphereLight(0x2a3a38, 0x080606, 0.55);
scene.add(ambient);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); ppResize(); });

/* ---------------------------------------------------------------
   TEXTURAS PROCEDURAIS (canvas)
   --------------------------------------------------------------- */
function tex(w, h, draw, rx = 1, ry = 1, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; return t;
}
function grime(g, w, h, n, col, rmin, rmax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rand(rmin, rmax);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col.replace('A', alpha)); gr.addColorStop(1, col.replace('A', 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function speckle(g, w, h, n, a) {
  for (let i = 0; i < n; i++) { const v = Math.random() < .5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3)); }
}
const T = {};
T.wall = tex(512, 512, (g, w, h) => {
  g.fillStyle = '#cbc5b1'; g.fillRect(0, 0, w, h);
  const s = 32;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { const v = rand(-10, 10); g.fillStyle = `rgb(${200 + v},${195 + v},${176 + v})`; g.fillRect(x + 1, y + 1, s - 2, s - 2); }
  g.fillStyle = 'rgba(60,55,40,.55)'; for (let y = 0; y < h; y += s) g.fillRect(0, y, w, 1.5); for (let x = 0; x < w; x += s) g.fillRect(x, 0, 1.5, h);
  // faixa inferior em tinta verde-hospital, descascando
  const band = h * 0.6;
  g.fillStyle = '#5c7867'; g.fillRect(0, band, w, h - band);
  g.fillStyle = '#3f5548'; g.fillRect(0, band - 4, w, 6);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(200,192,170,${rand(.5, .95)})`; g.beginPath(); g.ellipse(Math.random() * w, band + Math.random() * (h - band), rand(3, 16), rand(2, 9), Math.random() * 3, 0, 7); g.fill(); }
  // escorridos de água e manchas
  for (let i = 0; i < 26; i++) { const x = Math.random() * w, l = rand(60, 380), gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(70,58,30,.55)'); gr.addColorStop(1, 'rgba(70,58,30,0)'); g.fillStyle = gr; g.fillRect(x, 0, rand(2, 7), l); }
  grime(g, w, h, 40, 'rgba(40,35,20,A)', 20, 90, .35);
  grime(g, w, h, 10, 'rgba(30,45,25,A)', 30, 70, .45);
  const gr = g.createLinearGradient(0, h * .7, 0, h); gr.addColorStop(0, 'rgba(20,15,5,0)'); gr.addColorStop(1, 'rgba(20,15,5,.7)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 3000, .25);
}, 1, 1);
T.floor = tex(512, 512, (g, w, h) => {
  const s = 64;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { const d = ((x + y) / s) % 2 ? 0 : 1, v = rand(-8, 8); g.fillStyle = d ? `rgb(${128 + v},${124 + v},${108 + v})` : `rgb(${78 + v},${82 + v},${74 + v})`; g.fillRect(x, y, s, s); }
  g.fillStyle = 'rgba(20,20,15,.6)'; for (let y = 0; y < h; y += s) g.fillRect(0, y, w, 2); for (let x = 0; x < w; x += s) g.fillRect(x, 0, 2, h);
  grime(g, w, h, 60, 'rgba(25,20,10,A)', 20, 110, .45);
  grime(g, w, h, 6, 'rgba(60,10,5,A)', 10, 40, .5);
  speckle(g, w, h, 5000, .3);
}, W / 2, H / 2);
T.ceil = tex(256, 256, (g, w, h) => {
  g.fillStyle = '#5a5a52'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(15,15,12,.7)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(0, h / 2, w, 2); g.fillRect(w / 2, 0, 2, h);
  grime(g, w, h, 18, 'rgba(70,55,25,A)', 10, 60, .55); speckle(g, w, h, 1500, .3);
}, W, H);
T.concrete = tex(512, 512, (g, w, h) => {
  g.fillStyle = '#4c4d49'; g.fillRect(0, 0, w, h);
  grime(g, w, h, 120, 'rgba(15,15,12,A)', 10, 80, .4); grime(g, w, h, 30, 'rgba(90,60,30,A)', 10, 60, .35);
  speckle(g, w, h, 9000, .35);
}, 1, 1);
T.concreteFloor = tex(512, 512, (g, w, h) => {
  g.fillStyle = '#3a3b38'; g.fillRect(0, 0, w, h);
  grime(g, w, h, 90, 'rgba(8,10,10,A)', 20, 120, .5); speckle(g, w, h, 9000, .3);
}, 10, 4);
T.drawers = tex(512, 512, (g, w, h) => {
  g.fillStyle = '#3d4142'; g.fillRect(0, 0, w, h);
  const cw = w / 3, ch = h / 4;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    const x = c * cw + 8, y = r * ch + 8, v = rand(-12, 12);
    g.fillStyle = `rgb(${138 + v},${145 + v},${146 + v})`; g.fillRect(x, y, cw - 16, ch - 16);
    g.strokeStyle = 'rgba(20,20,20,.8)'; g.lineWidth = 3; g.strokeRect(x, y, cw - 16, ch - 16);
    g.fillStyle = '#222'; g.fillRect(x + cw / 2 - 30, y + ch / 2 + 6, 44, 10);
    g.fillStyle = '#ddd8c4'; g.fillRect(x + 14, y + 14, 34, 22);
    g.fillStyle = '#333'; g.font = 'bold 14px monospace'; g.fillText(String(r * 3 + c + 1), x + 22, y + 31);
  }
  grime(g, w, h, 40, 'rgba(90,50,20,A)', 6, 40, .5); speckle(g, w, h, 3000, .3);
});
T.locker = tex(128, 256, (g, w, h) => {
  g.fillStyle = '#56685f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2b342f'; for (let i = 0; i < 6; i++) g.fillRect(30, 20 + i * 9, 68, 4);
  g.fillStyle = '#9aa'; g.fillRect(96, 120, 8, 30);
  g.strokeStyle = '#2a302c'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
  grime(g, w, h, 25, 'rgba(80,45,15,A)', 4, 30, .6); speckle(g, w, h, 900, .3);
});
T.door = tex(512, 256, (g, w, h) => {
  g.fillStyle = '#5b5f60'; g.fillRect(0, 0, w, h);
  for (let x = -h; x < w; x += 40) { g.fillStyle = '#b8901c'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, h); g.lineTo(x + 20 + 40, h - 40); g.lineTo(x + 40, h - 40); g.fill(); }
  g.fillStyle = '#222'; g.fillRect(0, h - 44, w, 4);
  for (let i = 0; i < 12; i++) { g.fillStyle = '#333'; g.beginPath(); g.arc(20 + i * 43, 20, 5, 0, 7); g.fill(); }
  grime(g, w, h, 50, 'rgba(70,40,15,A)', 8, 50, .55); speckle(g, w, h, 3000, .3);
});
T.paper = tex(64, 64, (g, w, h) => { g.fillStyle = '#d8d2bc'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(40,40,60,.6)'; for (let y = 10; y < h; y += 6) g.fillRect(6, y, rand(30, 52), 1.5); grime(g, w, h, 4, 'rgba(90,60,20,A)', 6, 18, .5); });
T.skin = tex(256, 256, (g, w, h) => {
  g.fillStyle = '#bdb9aa'; g.fillRect(0, 0, w, h);
  grime(g, w, h, 30, 'rgba(90,70,95,A)', 10, 40, .35);
  g.strokeStyle = 'rgba(70,60,60,.55)'; g.lineWidth = 4;
  for (let i = 0; i < 7; i++) { const y = 40 + i * 22; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(w / 4, y - 14, w / 2, y); g.quadraticCurveTo(w * .75, y - 14, w, y); g.stroke(); }
  // incisão em Y costurada
  g.strokeStyle = '#2a1616'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(w * .12, 20); g.lineTo(w * .5, 110); g.lineTo(w * .88, 20); g.moveTo(w * .5, 110); g.lineTo(w * .5, 250); g.stroke();
  g.strokeStyle = '#111'; g.lineWidth = 2;
  for (let y = 115; y < 250; y += 10) { g.beginPath(); g.moveTo(w * .5 - 7, y); g.lineTo(w * .5 + 7, y + 4); g.stroke(); }
  speckle(g, w, h, 1200, .3);
});
T.sheet = tex(128, 128, (g, w, h) => { g.fillStyle = '#b9b4a2'; g.fillRect(0, 0, w, h); grime(g, w, h, 10, 'rgba(90,60,30,A)', 8, 30, .5); grime(g, w, h, 3, 'rgba(80,10,5,A)', 6, 16, .6); speckle(g, w, h, 600, .2); });
T.glow = tex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
T.cookie = null;

function deriveMaps(t, strength, r0, r1) {
  const src = t.image, w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  const nc = document.createElement('canvas'), rc = document.createElement('canvas'); nc.width = rc.width = w; nc.height = rc.height = h;
  const ng = nc.getContext('2d'), rg = rc.getContext('2d'), ni = ng.createImageData(w, h), ri = rg.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, l = L[y * w + ((x + w - 1) % w)], r = L[y * w + ((x + 1) % w)], u = L[((y + h - 1) % h) * w + x], dn = L[((y + 1) % h) * w + x];
    let nx = -(r - l) * strength, ny = (dn - u) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    ni.data[i * 4] = (nx * 0.5 + 0.5) * 255; ni.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; ni.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; ni.data[i * 4 + 3] = 255;
    const rv = (r0 + (r1 - r0) * (1 - L[i])) * 255; ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = rv; ri.data[i * 4 + 3] = 255;
  }
  ng.putImageData(ni, 0, 0); rg.putImageData(ri, 0, 0);
  const mk = c => { const o = new THREE.CanvasTexture(c); o.wrapS = o.wrapT = THREE.RepeatWrapping; o.repeat.copy(t.repeat); o.anisotropy = 4; return o; };
  return { normalMap: mk(nc), roughnessMap: mk(rc) };
}
const M = {
  wall: new THREE.MeshStandardMaterial({ map: T.wall, roughness: 0.82, metalness: 0 }),
  concrete: new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.95 }),
  drawers: new THREE.MeshStandardMaterial({ map: T.drawers, roughness: 0.45, metalness: 0.6 }),
  floor: new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.55, metalness: 0.05 }),
  wet: new THREE.MeshStandardMaterial({ map: T.concreteFloor, roughness: 0.18, metalness: 0.2 }),
  ceil: new THREE.MeshStandardMaterial({ map: T.ceil, roughness: 0.95 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8c9496, roughness: 0.35, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1c1d1d, roughness: 0.7, metalness: 0.4 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.9, metalness: 0.3 }),
  locker: new THREE.MeshStandardMaterial({ map: T.locker, roughness: 0.6, metalness: 0.5 }),
  lockerSide: new THREE.MeshStandardMaterial({ color: 0x4d5d55, roughness: 0.6, metalness: 0.5 }),
  sheet: new THREE.MeshStandardMaterial({ map: T.sheet, roughness: 0.95, side: THREE.DoubleSide }),
  mattress: new THREE.MeshStandardMaterial({ color: 0x6d6a55, roughness: 1 }),
  paper: new THREE.MeshStandardMaterial({ map: T.paper, roughness: 1, side: THREE.DoubleSide }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.85 }),
  bag: new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.35, metalness: 0.1 }),
  door: new THREE.MeshStandardMaterial({ map: T.door, roughness: 0.5, metalness: 0.7 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.3 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb08d47, roughness: 0.3, metalness: 1, emissive: 0x3a2400, emissiveIntensity: 0.6 }),
  skin: new THREE.MeshStandardMaterial({ map: T.skin, color: 0xd7d3c4, roughness: 0.7, emissive: 0x0c0b0a }),
  skinPlain: new THREE.MeshStandardMaterial({ color: 0xc4c0b0, roughness: 0.7, emissive: 0x0c0b0a }),
  joint: new THREE.MeshStandardMaterial({ color: 0x6e5a6a, roughness: 0.7 }),
  cloth: new THREE.MeshStandardMaterial({ color: 0x7a725c, roughness: 1, side: THREE.DoubleSide }),
  mouth: new THREE.MeshStandardMaterial({ color: 0x220707, roughness: 0.4 }),
  tube: new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0x000000, roughness: 0.4 })
};
for (const [m, t, str, r0, r1] of [[M.wall, T.wall, 7, 0.3, 0.95], [M.floor, T.floor, 5, 0.22, 0.85], [M.concrete, T.concrete, 5, 0.7, 1], [M.wet, T.concreteFloor, 3, 0.12, 0.5], [M.ceil, T.ceil, 4, 0.8, 1], [M.drawers, T.drawers, 6, 0.2, 0.7], [M.locker, T.locker, 5, 0.3, 0.85], [M.door, T.door, 5, 0.25, 0.8]]) {
  const r = deriveMaps(t, str, r0, r1); m.normalMap = r.normalMap; m.roughnessMap = r.roughnessMap; m.roughness = 1; m.needsUpdate = true;
}

/* ---------------------------------------------------------------
   GEOMETRIA DO NÍVEL
   --------------------------------------------------------------- */
const level = new THREE.Group(); scene.add(level);
const DRAWER_CELLS = new Set();
for (let x = 1; x <= 6; x++) DRAWER_CELLS.add(idx(x, 15));
for (let x = 9; x <= 14; x++) DRAWER_CELLS.add(idx(x, 15));
for (let z = 20; z <= 25; z++) DRAWER_CELLS.add(idx(0, z));
for (let z = 20; z <= 25; z++) DRAWER_CELLS.add(idx(6, z));

function buildWalls() {
  const lists = { wall: [], concrete: [], drawers: [] };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (grid[idx(x, z)] !== '#') continue;
    let adj = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (inb(nx, nz) && grid[idx(nx, nz)] !== '#') { adj = regionAt(nx, nz); break; } }
    if (!adj) continue;
    const kind = DRAWER_CELLS.has(idx(x, z)) ? 'drawers' : (adj === 'subsolo' || adj === 'rua') ? 'concrete' : 'wall';
    lists[kind].push([x, z]);
  }
  const geo = new THREE.BoxGeometry(CS, CFG.wallH, CS);
  const m4 = new THREE.Matrix4();
  for (const k in lists) {
    const mesh = new THREE.InstancedMesh(geo, M[k], lists[k].length);
    lists[k].forEach(([x, z], i) => { m4.makeTranslation(x * CS + CS / 2, CFG.wallH / 2, z * CS + CS / 2); mesh.setMatrixAt(i, m4); });
    mesh.castShadow = true; mesh.receiveShadow = true; level.add(mesh);
  }
}
buildWalls();
{
  const f = new THREE.Mesh(new THREE.PlaneGeometry(W * CS, H * CS), M.floor);
  f.rotation.x = -Math.PI / 2; f.position.set(W * CS / 2, 0, H * CS / 2); f.receiveShadow = true; level.add(f);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(20 * CS, 6 * CS), M.wet);
  s.rotation.x = -Math.PI / 2; s.position.set(10 * CS, 0.01, 30 * CS); s.receiveShadow = true; level.add(s);
  const r = new THREE.Mesh(new THREE.PlaneGeometry(6 * CS, 7 * CS), M.wet);
  r.rotation.x = -Math.PI / 2; r.position.set(22 * CS + 1, 0.01, 30 * CS + 1); level.add(r);
  const c = new THREE.Mesh(new THREE.PlaneGeometry(W * CS, 27 * CS), M.ceil);
  c.rotation.x = Math.PI / 2; c.position.set(W * CS / 2, CFG.wallH, 27 * CS / 2); level.add(c);
  const c2 = new THREE.Mesh(new THREE.PlaneGeometry(20 * CS, 7 * CS), M.concrete);
  c2.rotation.x = Math.PI / 2; c2.position.set(10 * CS, CFG.wallH, 30.5 * CS); level.add(c2);
}

/* ---------------------------------------------------------------
   PROPS, ESCONDERIJOS E INTERAGÍVEIS
   --------------------------------------------------------------- */
const props = [];        // {i, block}
const interact = [];     // {type, pos, mesh, active, ...}
const hideSpots = [];

function wallDir(x, z) { // direção (dx,dz) para a parede vizinha mais próxima
  for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (isWall(x + d[0], z + d[1])) return d;
  return [0, -1];
}
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true; (parent || level).add(m); return m;
}
function cyl(rt, rb, h, mat, x, y, z, parent, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z);
  m.castShadow = true; (parent || level).add(m); return m;
}

function addLocker(x, z) {
  const [dx, dz] = wallDir(x, z), g = new THREE.Group();
  const c = center(x, z); g.position.set(c.x + dx * 0.62, 0, c.z + dz * 0.62);
  g.rotation.y = Math.atan2(-dx, -dz);
  box(0.95, 2.05, 0.6, M.lockerSide, 0, 1.025, 0, g);
  const door = box(0.9, 1.95, 0.02, M.locker, 0, 1.02, 0.31, g);
  level.add(g);
  props.push({ i: idx(x, z), block: true });
  const face = new THREE.Vector3(-dx, 0, -dz);
  const spot = { type: 'locker', x, z, pos: new THREE.Vector3(g.position.x, 0, g.position.z), face, door, group: g, inside: g.position.clone() };
  hideSpots.push(spot); interact.push({ type: 'hide', spot, pos: center(x, z), active: true });
}
function addBed(x, z, opts = {}) {
  const g = new THREE.Group(), c = center(x, z); g.position.copy(c);
  const [dx, dz] = wallDir(x, z); g.rotation.y = dz !== 0 ? Math.PI / 2 : 0;
  for (const sx of [-0.42, 0.42]) for (const sz of [-0.9, 0.9]) cyl(0.025, 0.025, 0.7, M.steel, sx, 0.35, sz, g, 6);
  box(0.95, 0.06, 1.95, M.steel, 0, 0.66, 0, g);
  box(0.9, 0.16, 1.9, M.mattress, 0, 0.77, 0, g);
  if (opts.body) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.25, 4, 8), M.bag); b.rotation.x = Math.PI / 2; b.position.set(0, 0.98, 0); b.scale.set(1, 1, 0.6); b.castShadow = true; g.add(b); }
  // lençol caído até o chão (esconde quem está embaixo)
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.72), M.sheet); sh.rotation.y = Math.PI / 2; sh.position.set(0.5, 0.48, 0); g.add(sh);
  const sh2 = sh.clone(); sh2.position.x = -0.5; g.add(sh2);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 2.0), M.sheet); top.rotation.x = -Math.PI / 2; top.position.y = 0.86; if (!opts.body) g.add(top);
  level.add(g); props.push({ i: idx(x, z), block: true });
  const face = new THREE.Vector3(dz !== 0 ? -dz : 0, 0, dz === 0 ? 0 : 0);
  // sai pelo lado aberto (oposto à parede)
  face.set(-dx, 0, -dz); if (face.lengthSq() === 0) face.set(0, 0, 1);
  const spot = { type: 'bed', x, z, pos: c.clone(), face, group: g, inside: c.clone(), sheets: [sh, sh2, top] };
  hideSpots.push(spot); interact.push({ type: 'hide', spot, pos: spot.pos, active: true });
}
function addTable(x, z, body) {
  const g = new THREE.Group(), c = center(x, z); g.position.copy(c);
  cyl(0.12, 0.2, 0.85, M.steel, 0, 0.42, 0, g);
  box(0.85, 0.08, 2.0, M.steel, 0, 0.9, 0, g);
  if (body) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), M.sheet); b.rotation.x = Math.PI / 2; b.position.set(0, 1.08, 0); b.scale.set(1.1, 1, 0.55); b.castShadow = true; g.add(b); }
  level.add(g); props.push({ i: idx(x, z), block: true });
}
function addShelf(x, z) {
  const c = center(x, z), g = new THREE.Group(); g.position.copy(c);
  box(1.8, 2.3, 0.5, M.rust, 0, 1.15, 0, g);
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) box(0.12, rand(.3, .42), 0.38, new THREE.MeshStandardMaterial({ color: pick([0x8a7a55, 0x6c5d40, 0x9b8b6a, 0x4f5a62]), roughness: 1 }), -0.8 + i * 0.2, 0.32 + r * 0.55, 0.06, g);
  g.rotation.y = rand(-.05, .05);
  level.add(g); props.push({ i: idx(x, z), block: true });
}
function addDesk(x, z) {
  const c = center(x, z), g = new THREE.Group(); g.position.copy(c);
  box(1.5, 0.06, 0.8, M.wood, 0, 0.76, 0, g);
  box(0.5, 0.74, 0.75, M.wood, -0.48, 0.37, 0, g);
  box(0.06, 0.74, 0.75, M.wood, 0.72, 0.37, 0, g);
  const crt = box(0.42, 0.36, 0.4, M.dark, 0.2, 0.98, 0, g);
  box(0.32, 0.24, 0.01, new THREE.MeshBasicMaterial({ color: 0x0a1612 }), 0.2, 0.98, 0.205, g);
  g.rotation.y = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
  level.add(g); props.push({ i: idx(x, z), block: true });
}
function addWheelchair(x, z, tipped) {
  const c = center(x, z), g = new THREE.Group(); g.position.set(c.x + rand(-.4, .4), 0, c.z + rand(-.4, .4));
  for (const s of [-0.3, 0.3]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 16), M.steel); w.position.set(s, 0.3, 0); w.rotation.y = Math.PI / 2; g.add(w); }
  box(0.55, 0.05, 0.45, M.dark, 0, 0.48, 0.05, g); box(0.55, 0.45, 0.04, M.dark, 0, 0.72, -0.17, g);
  if (tipped) { g.rotation.z = Math.PI / 2.2; g.position.y = 0.3; }
  g.rotation.y = rand(0, 6); level.add(g);
}
function addIV(x, z) { const c = center(x, z); const g = new THREE.Group(); g.position.set(c.x + rand(-.6, .6), 0, c.z + rand(-.6, .6)); cyl(0.015, 0.015, 1.9, M.steel, 0, 0.95, 0, g, 6); cyl(0.25, 0.25, 0.03, M.steel, 0, 0.02, 0, g, 5); box(0.12, 0.2, 0.04, new THREE.MeshStandardMaterial({ color: 0x8a7a5a, transparent: true, opacity: .6 }), 0.08, 1.75, 0, g); g.rotation.z = rand(-.08, .08); level.add(g); }
function addPapers(x, z, n = 5) { const c = center(x, z); for (let i = 0; i < n; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), M.paper); p.rotation.x = -Math.PI / 2; p.rotation.z = rand(0, 6); p.position.set(c.x + rand(-.9, .9), 0.012 + i * 0.001, c.z + rand(-.9, .9)); p.receiveShadow = true; level.add(p); } }
function addBoiler(x, z) { const c = center(x, z); const b = cyl(0.85, 0.85, 2.6, M.rust, c.x, 1.3, c.z, level, 18); b.receiveShadow = true; cyl(0.15, 0.15, 1.2, M.rust, c.x + 0.6, 2.7, c.z, level, 8); props.push({ i: idx(x, z), block: true }); }
function addPipe(x0, z0, x1, z1, y) { const a = center(x0, z0, y), b = center(x1, z1, y), len = a.distanceTo(b); const p = cyl(0.12, 0.12, len, M.rust, (a.x + b.x) / 2, y, (a.z + b.z) / 2, level, 8); p.rotation.z = Math.PI / 2; p.rotation.y = Math.atan2(b.z - a.z, b.x - a.x) * -1; }

function addFuse(n, x, z, y = 0.05) {
  const c = center(x, z); const g = new THREE.Group(); g.position.set(c.x + rand(-.3, .3), y, c.z + rand(-.3, .3));
  const body = cyl(0.05, 0.05, 0.2, M.ceramic, 0, 0.05, 0, g, 12); body.rotation.z = Math.PI / 2;
  for (const s of [-0.11, 0.11]) { const cap = cyl(0.056, 0.056, 0.04, M.brass, s, 0.05, 0, g, 12); cap.rotation.z = Math.PI / 2; }
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffb050, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  glint.scale.set(0.5, 0.5, 0.5); glint.position.y = 0.06; g.add(glint);
  level.add(g);
  const it = { type: 'fuse', n, pos: g.position.clone(), mesh: g, glint, active: true, home: g.position.clone() };
  interact.push(it); return it;
}
function addBattery(x, z) {
  const c = center(x, z); const g = new THREE.Group(); g.position.set(c.x + rand(-.4, .4), 0.03, c.z + rand(-.4, .4));
  const b = cyl(0.035, 0.035, 0.13, M.dark, 0, 0.035, 0, g, 10); b.rotation.z = Math.PI / 2;
  const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0x60ff90, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  tip.scale.set(0.25, 0.25, 0.25); tip.position.y = 0.05; g.add(tip);
  level.add(g); interact.push({ type: 'battery', pos: g.position.clone(), mesh: g, glint: tip, active: true });
}
function addNote(x, z, text) {
  const c = center(x, z); const p = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.32), new THREE.MeshStandardMaterial({ map: T.paper, emissive: 0x302c22, roughness: 1 }));
  p.rotation.x = -Math.PI / 2; p.rotation.z = rand(0, 6); p.position.set(c.x + rand(-.3, .3), 0.015, c.z + rand(-.3, .3)); level.add(p);
  interact.push({ type: 'note', pos: p.position.clone(), mesh: p, text, active: true });
}

// --- distribuição (segue o GDD) ---
// Ala de Pacientes
[[1, 7], [14, 5], [3, 1], [9, 11]].forEach(p => addLocker(...p));
[[8, 2], [13, 2], [3, 10], [8, 10], [1, 2]].forEach(p => addBed(...p));
addPapers(7, 6, 6); addWheelchair(10, 6, true); addPapers(13, 10, 3);
// Enfermaria
[[27, 11], [16, 11], [27, 1]].forEach(p => addLocker(...p));
[[16, 3], [16, 6], [16, 9], [27, 5], [27, 8], [21, 1], [23, 1]].forEach(p => addBed(...p));
addIV(18, 4); addIV(25, 7); addIV(18, 8); addWheelchair(22, 6); addPapers(21, 9, 5);
// Administração
[[42, 6], [29, 11], [34, 1]].forEach(p => addLocker(...p));
[[37, 1], [39, 1], [41, 1], [37, 3], [41, 3]].forEach(p => addShelf(...p));
[[31, 8], [35, 9], [39, 8], [32, 2]].forEach(p => addDesk(...p));
addPapers(36, 7, 8); addPapers(40, 10, 6); addPapers(38, 2, 6);
// Corredor central
addLocker(28, 13); addLocker(10, 13); addWheelchair(34, 14, true); addPapers(18, 14, 4); addIV(3, 14);
// Necrotério
[[14, 16], [1, 16], [5, 25]].forEach(p => addLocker(...p));
[[4, 18], [9, 18], [12, 22], [9, 24]].forEach(p => addBed(p[0], p[1], { body: true }));
addTable(3, 22, true);
// Recepção
addLocker(16, 25); addLocker(27, 25);
addDesk(17, 19); addDesk(26, 19); addPapers(24, 21, 6); addWheelchair(25, 24);
// Autópsia e laboratório
[[42, 25], [29, 16], [36, 21]].forEach(p => addLocker(...p));
addTable(32, 22, true); addTable(34, 24, false); addTable(31, 18, true);
addBed(42, 22, { body: true });
[[37, 17], [40, 17]].forEach(p => addDesk(...p)); addShelf(42, 16);
// Subsolo
addBoiler(5, 29); addBoiler(8, 31); addLocker(1, 27); addLocker(18, 27);
addPipe(1, 28, 18, 28, 2.7); addPipe(1, 31, 18, 31, 2.9);
rebuildBlocked();

/* ---------------------------------------------------------------
   OCLUSÃO DE CANTOS — sombra suave onde parede encontra piso e teto
   (dá peso e escala ao espaço; instanciado, custo quase zero)
   --------------------------------------------------------------- */
{
  const aoTex = tex(16, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,.78)'); gr.addColorStop(0.35, 'rgba(0,0,0,.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const strips = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (isWall(x, z) || grid[idx(x, z)] === 'X') continue;
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (isWall(x + dx, z + dz)) strips.push([x, z, dx, dz]);
  }
  const geo = new THREE.PlaneGeometry(CS, 0.55); geo.translate(0, -0.275, 0);
  const mk = () => new THREE.InstancedMesh(geo, aoMat, strips.length * 2);
  const floorAO = mk(), wallAO = mk(); const o = new THREE.Object3D(); let n = 0;
  for (const [x, z, dx, dz] of strips) {
    const c = center(x, z), ex = c.x + dx * CS / 2, ez = c.z + dz * CS / 2, ry = Math.atan2(-dx, -dz);
    // no piso: começa encostado na parede e esmaece para dentro da sala
    o.position.set(ex - dx * 0.002, 0.003, ez - dz * 0.002); o.rotation.set(0, 0, 0); o.rotation.order = 'YXZ'; o.rotation.y = ry; o.rotation.x = -Math.PI / 2; o.updateMatrix(); floorAO.setMatrixAt(n, o.matrix);
    // no rodapé da parede: esmaece subindo
    o.position.set(ex - dx * 0.006, 0.0, ez - dz * 0.006); o.rotation.set(0, 0, 0); o.rotation.order = 'YXZ'; o.rotation.y = ry; o.rotation.x = Math.PI; o.updateMatrix(); wallAO.setMatrixAt(n, o.matrix);
    n++;
    // no teto: canto superior
    o.position.set(ex - dx * 0.006, CFG.wallH, ez - dz * 0.006); o.rotation.set(0, 0, 0); o.rotation.order = 'YXZ'; o.rotation.y = ry; o.updateMatrix(); wallAO.setMatrixAt(n, o.matrix);
    o.position.set(ex - dx * 0.002, CFG.wallH - 0.003, ez - dz * 0.002); o.rotation.set(0, 0, 0); o.rotation.order = 'YXZ'; o.rotation.y = ry; o.rotation.x = Math.PI / 2; o.updateMatrix(); floorAO.setMatrixAt(n, o.matrix);
    n++;
  }
  floorAO.count = wallAO.count = n; floorAO.renderOrder = wallAO.renderOrder = 2; level.add(floorAO); level.add(wallAO);
}

/* ---------------------------------------------------------------
   DECALS — sangue, arrastos, infiltração, mofo, marcas de mão
   --------------------------------------------------------------- */
const DECAL = {
  blood: tex(256, 256, (g, w, h) => {
    const c = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(58,4,2,${a})`); gr.addColorStop(0.7, `rgba(45,3,2,${a * 0.9})`); gr.addColorStop(1, 'rgba(40,2,1,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    for (let i = 0; i < 9; i++) c(128 + rand(-30, 30), 128 + rand(-30, 30), rand(25, 60), 0.85);
    for (let i = 0; i < 40; i++) { const a = rand(0, 6.3), d = rand(60, 120); c(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rand(2, 7), 0.9); }
  }),
  smear: tex(256, 512, (g, w, h) => {
    for (let k = 0; k < 2; k++) { const x0 = 80 + k * 80; for (let y = 0; y < h; y += 2) { const a = 0.75 * (1 - y / h) * rand(0.6, 1); g.fillStyle = `rgba(50,4,2,${a})`; g.fillRect(x0 + Math.sin(y * 0.02 + k) * 10 + rand(-2, 2), y, rand(16, 34) * (1 - y / h * 0.6), 2); } }
  }),
  stain: tex(256, 256, (g, w, h) => {
    for (let i = 0; i < 4; i++) { const r = rand(60, 120); g.strokeStyle = `rgba(70,52,25,${rand(.3, .55)})`; g.lineWidth = rand(3, 9); g.beginPath(); g.ellipse(128 + rand(-10, 10), 128 + rand(-10, 10), r, r * rand(.6, 1), rand(0, 3), 0, 7); g.stroke(); }
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 120); gr.addColorStop(0, 'rgba(60,45,20,.35)'); gr.addColorStop(1, 'rgba(60,45,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }),
  mold: tex(256, 256, (g, w, h) => { for (let i = 0; i < 260; i++) { const x = 128 + rand(-1, 1) * rand(0, 110), y = 128 + rand(-1, 1) * rand(0, 110), r = rand(2, 14); g.fillStyle = `rgba(${rand(10, 30) | 0},${rand(20, 40) | 0},${rand(12, 25) | 0},${rand(.2, .6)})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }),
  drip: tex(128, 512, (g, w, h) => { for (let i = 0; i < 7; i++) { const x = rand(10, 118), l = rand(150, 500), gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(55,40,18,.7)'); gr.addColorStop(1, 'rgba(55,40,18,0)'); g.fillStyle = gr; g.fillRect(x, 0, rand(3, 10), l); } }),
  hand: tex(256, 256, (g, w, h) => {
    g.fillStyle = 'rgba(60,4,2,.85)';
    const hp = (x, y, s, rot) => { g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.beginPath(); g.ellipse(0, 20, 24, 28, 0, 0, 7); g.fill(); [[-22, -18, -0.3], [-9, -30, -0.1], [5, -32, 0.05], [18, -26, 0.2]].forEach(([fx, fy, r]) => { g.save(); g.translate(fx, fy); g.rotate(r); g.fillRect(-5, -34, 10, 46); g.restore(); }); g.save(); g.translate(28, 18); g.rotate(0.9); g.fillRect(-5, -26, 10, 30); g.restore(); g.restore(); };
    hp(90, 120, 1, -0.2); hp(170, 150, 0.9, 0.25);
    for (let i = 0; i < 6; i++) { g.fillRect(rand(70, 190), rand(150, 200), rand(3, 6), rand(30, 90)); }
  })
};
const decalMats = {}; for (const k in DECAL) decalMats[k] = new THREE.MeshStandardMaterial({ map: DECAL[k], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: k === 'blood' || k === 'smear' || k === 'hand' ? 0.22 : 0.95, metalness: 0 });
const BLOODY = { necroterio: 0.6, autopsia: 0.6, pacientes: 0.45, corredor: 0.3, subsolo: 0.25, enfermaria: 0.25, admin: 0.12, recepcao: 0.15, rua: 0 };
for (let n = 0; n < 110; n++) {
  const i = pick(FREE_CELLS_PRE()), x = i % W, z = (i / W) | 0, rg = regionAt(x, z); if (rg === 'rua') continue;
  const kind = Math.random() < BLOODY[rg] ? (Math.random() < 0.35 ? 'smear' : 'blood') : (Math.random() < 0.7 ? 'stain' : 'mold');
  const sz = kind === 'smear' ? rand(0.6, 1.0) : rand(0.5, 1.9);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, kind === 'smear' ? sz * rand(2, 3.5) : sz), decalMats[kind]);
  const c = center(x, z); m.rotation.x = -Math.PI / 2; m.rotation.z = rand(0, 6.3); m.position.set(c.x + rand(-.7, .7), 0.004 + n * 0.00005, c.z + rand(-.7, .7)); m.receiveShadow = true; m.renderOrder = 1; level.add(m);
}
for (let n = 0; n < 90; n++) {
  const i = pick(FREE_CELLS_PRE()), x = i % W, z = (i / W) | 0, rg = regionAt(x, z); if (rg === 'rua') continue;
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dz]) => isWall(x + dx, z + dz)); if (!dirs.length) continue;
  const [dx, dz] = pick(dirs), roll = Math.random();
  const kind = roll < 0.35 ? 'drip' : roll < 0.6 ? 'mold' : roll < 0.6 + BLOODY[rg] * 0.5 ? (Math.random() < 0.4 ? 'hand' : 'blood') : 'stain';
  const wv = kind === 'drip' ? rand(0.4, 0.9) : rand(0.4, 1.3), hv = kind === 'drip' ? rand(1.2, 2.6) : wv;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wv, hv), decalMats[kind]);
  const c = center(x, z); m.position.set(c.x + dx * (CS / 2 - 0.012) + (dz ? rand(-.6, .6) : 0), kind === 'drip' ? CFG.wallH - hv / 2 - 0.05 : kind === 'hand' ? rand(0.9, 1.6) : rand(0.3, 2.3), c.z + dz * (CS / 2 - 0.012) + (dx ? rand(-.6, .6) : 0));
  m.rotation.y = Math.atan2(-dx, -dz); if (kind !== 'drip') m.rotation.z = rand(-0.5, 0.5); m.renderOrder = 1; level.add(m);
}
function FREE_CELLS_PRE() { if (!FREE_CELLS_PRE.c) { FREE_CELLS_PRE.c = []; for (let i = 0; i < W * H; i++) if (!blocked[i]) FREE_CELLS_PRE.c.push(i); } return FREE_CELLS_PRE.c; }

// Fusíveis (1 por setor, ordem sugerida F1→F5)
const FUSES = [
  addFuse(1, 26, 3, 0.05), addFuse(2, 30, 1, 0.05), addFuse(3, 13, 10, 0.05),
  addFuse(4, 2, 24, 0.05), addFuse(5, 17, 32, 0.05)
];
[[17, 10], [41, 10], [40, 18], [30, 24], [13, 17], [8, 6], [3, 30]].forEach(p => addBattery(...p));
addNote(22, 22, 'PLANTÃO 03/11/87 — Se a luz cair, NÃO desça. Ele arrancou os 5 fusíveis do painel e espalhou pelos setores. Eu sei onde estão: enfermaria, segurança, isolamento, gaveta 7, gerador. — Vigia Osmar');
addNote(20, 5, 'PRONTUÁRIO P-14 — Fotofobia extrema após 9 meses de privação luminosa. Dr. Varela proibiu lanternas na ala. Pupilas não contraem. Paciente sorri no escuro.');
addNote(10, 20, 'Gaveta 7 aberta de novo. POR DENTRO. Etiqueta no pé: P-14. Não fiquem no escuro. Ele enxerga melhor no escuro.');
addNote(10, 29, 'Mirei a lanterna nos olhos dele e ele GRITOU. Fugiu. Mas voltou, e cada vez demora mais para fugir. A lanterna esquenta. Não confie só nela.');

/* ---------------------------------------------------------------
   PAINEL E PORTA DE SAÍDA
   --------------------------------------------------------------- */
/* ---------------------------------------------------------------
   QUADRO GERAL DE FORÇA (QG-1) — caixa de fusíveis da saída
   armário de aço com porta aberta, 5 bases de porcelana com garras de latão,
   etiquetas por setor, lâmpadas-piloto, voltímetro analógico, chave-faca
   --------------------------------------------------------------- */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const panel = { group: new THREE.Group(), sockets: [], fuses: [], needle: null, lever: null, pos: center(18, 16) };
{
  const g = panel.group; g.position.set(18 * CS + 1, 0, 16 * CS + 0.01); level.add(g);
  const paint = tex(512, 512, (c, w, h) => {
    c.fillStyle = '#56645b'; c.fillRect(0, 0, w, h);
    grime(c, w, h, 40, 'rgba(30,35,28,A)', 20, 90, .35);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${rand(90, 130) | 0},${rand(45, 60) | 0},${rand(20, 30) | 0},${rand(.3, .8)})`; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, rand(2, 18), rand(2, 10), rand(0, 3), 0, 7); c.fill(); }
    for (let i = 0; i < 14; i++) { const x = Math.random() * w, l = rand(40, 260), gr = c.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(100,50,20,.6)'); gr.addColorStop(1, 'rgba(100,50,20,0)'); c.fillStyle = gr; c.fillRect(x, rand(0, h * .6), rand(2, 5), l); }
    for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(200,205,195,${rand(.1, .4)})`; c.lineWidth = rand(.5, 1.5); const x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + rand(-30, 30), y + rand(-8, 8)); c.stroke(); }
    speckle(c, w, h, 4000, .25);
  });
  const pm = deriveMaps(paint, 6, 0.35, 0.85);
  const MP = new THREE.MeshStandardMaterial({ map: paint, normalMap: pm.normalMap, roughnessMap: pm.roughnessMap, roughness: 1, metalness: 0.55 });
  const MBack = new THREE.MeshStandardMaterial({ color: 0x1c201e, roughness: 0.8, metalness: 0.3 });
  const MPorc = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.22, metalness: 0 });
  const MBrass = new THREE.MeshStandardMaterial({ color: 0xb08a48, roughness: 0.3, metalness: 1 });
  const MCopper = new THREE.MeshStandardMaterial({ color: 0xb06a3c, roughness: 0.35, metalness: 1 });
  const MCable = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const W = 1.5, Hh = 1.3, D = 0.26, cy = 1.5;
  // carcaça: fundo, laterais, topo e base (aberta na frente)
  box(W, Hh, 0.02, MP, 0, cy, 0.01, g);
  box(0.02, Hh, D, MP, -W / 2, cy, D / 2, g); box(0.02, Hh, D, MP, W / 2, cy, D / 2, g);
  box(W, 0.02, D, MP, 0, cy + Hh / 2, D / 2, g); box(W, 0.02, D, MP, 0, cy - Hh / 2, D / 2, g);
  box(W - 0.08, Hh - 0.08, 0.01, MBack, 0, cy, 0.025, g);
  // porta aberta (dobradiça à esquerda) com diagrama colado por dentro e placa de perigo por fora
  const hinge = new THREE.Group(); hinge.position.set(-W / 2, 0, D); hinge.rotation.y = -1.95; g.add(hinge);
  box(W, Hh, 0.02, MP, W / 2, cy, 0, hinge);
  const diag = tex(256, 340, (c, w, h) => {
    c.fillStyle = '#d6cfb6'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = 'bold 15px monospace'; c.fillText('QUADRO GERAL QG-1', 20, 26); c.font = '11px monospace'; c.fillText('INST. S. LÁZARO — 1979', 20, 44);
    c.strokeStyle = '#333'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(40, 70); c.lineTo(40, 300); c.stroke();
    ['F1 ENFERMARIA', 'F2 SEGURANÇA', 'F3 NECROTÉRIO', 'F4 AUTÓPSIA', 'F5 ALA PACIENTES'].forEach((t, i) => { const y = 90 + i * 44; c.beginPath(); c.moveTo(40, y); c.lineTo(80, y); c.stroke(); c.strokeRect(80, y - 8, 22, 16); c.beginPath(); c.moveTo(102, y); c.lineTo(130, y); c.stroke(); c.fillText(t, 134, y + 4); });
    c.fillStyle = 'rgba(120,20,15,.75)'; c.font = 'bold 13px monospace'; c.fillText('NUNCA DESLIGAR À NOITE', 20, 326);
    grime(c, w, h, 14, 'rgba(110,80,30,A)', 10, 50, .45);
  });
  const dm = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), new THREE.MeshStandardMaterial({ map: diag, roughness: 1 })); dm.position.set(W / 2, cy + 0.12, 0.012); dm.rotation.z = 0.04; hinge.add(dm);
  const warn = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#e1b21d'; c.beginPath(); c.moveTo(128, 14); c.lineTo(244, 214); c.lineTo(12, 214); c.closePath(); c.fill(); c.lineWidth = 10; c.strokeStyle = '#111'; c.stroke();
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(140, 70); c.lineTo(100, 140); c.lineTo(128, 140); c.lineTo(112, 196); c.lineTo(160, 118); c.lineTo(132, 118); c.lineTo(150, 70); c.fill();
    c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.fillText('PERIGO', 128, 245); grime(c, w, h, 12, 'rgba(60,40,10,A)', 10, 40, .5);
  });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshStandardMaterial({ map: warn, transparent: true, roughness: 0.6 })); ws.position.set(W / 2, cy + 0.25, -0.012); ws.rotation.y = Math.PI; hinge.add(ws);
  // trilho das bases de fusível
  const names = ['ENFERMARIA', 'SEGURANÇA', 'NECROTÉRIO', 'AUTÓPSIA', 'ALA PACIENTES'];
  for (let i = 0; i < 5; i++) {
    const x = -0.52 + i * 0.22, y = cy - 0.08;
    box(0.15, 0.3, 0.05, MPorc, x, y, 0.06, g);                       // base de porcelana
    for (const dy of [-0.11, 0.11]) { box(0.07, 0.03, 0.04, MBrass, x, y + dy, 0.1, g); for (const dx of [-0.028, 0.028]) box(0.008, 0.05, 0.04, MBrass, x + dx, y + dy, 0.11, g); }
    for (const dy of [-0.135, 0.135]) { const sc = cyl(0.009, 0.009, 0.012, MBrass, x, y + dy, 0.088, g, 8); sc.rotation.x = Math.PI / 2; }
    // fusível (aparece quando instalado)
    const fz = new THREE.Group(); fz.position.set(x, y, 0.115); g.add(fz); fz.visible = false;
    cyl(0.032, 0.032, 0.17, M.ceramic, 0, 0, 0, fz, 14); cyl(0.036, 0.036, 0.03, MBrass, 0, 0.095, 0, fz, 14); cyl(0.036, 0.036, 0.03, MBrass, 0, -0.095, 0, fz, 14);
    panel.fuses.push(fz);
    // etiqueta do circuito
    const lt = tex(256, 72, (c, w, h) => { c.fillStyle = '#d9d2bc'; c.fillRect(0, 0, w, h); c.strokeStyle = '#333'; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6); c.fillStyle = '#1a1a1a'; c.font = 'bold 26px monospace'; c.textAlign = 'center'; c.fillText('F' + (i + 1), w / 2, 30); c.font = 'bold 17px monospace'; c.fillText(names[i], w / 2, 58); grime(c, w, h, 5, 'rgba(90,60,20,A)', 6, 22, .5); });
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.048), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 })); lb.position.set(x, y + 0.2, 0.031); g.add(lb);
    // lâmpada-piloto (vermelha apagada → verde acesa)
    const lampMat = new THREE.MeshPhysicalMaterial({ color: 0x3a0a08, emissive: 0x000000, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.92 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), lampMat); lamp.rotation.x = Math.PI / 2; lamp.position.set(x, y - 0.23, 0.03); g.add(lamp);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 8, 18), MBrass); bezel.position.set(x, y - 0.23, 0.032); g.add(bezel);
    panel.sockets.push(lamp);
    // cabos de cada circuito subindo pelo fundo
    const cb = cyl(0.008, 0.008, 0.5, MCable, x + 0.05, y + 0.38, 0.035, g, 6);
  }
  // voltímetro
  const gface = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#e6dfca'; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill();
    c.strokeStyle = '#222'; c.lineWidth = 2; c.font = 'bold 15px sans-serif'; c.fillStyle = '#222'; c.textAlign = 'center';
    for (let i = 0; i <= 38; i++) { const a = -Math.PI / 2 - 1.2 + i / 38 * 2.4, r0 = i % 5 ? 92 : 84; c.beginPath(); c.moveTo(128 + Math.cos(a) * r0, 150 + Math.sin(a) * r0); c.lineTo(128 + Math.cos(a) * 100, 150 + Math.sin(a) * 100); c.stroke(); if (i % 5 === 0) c.fillText(String(i * 10), 128 + Math.cos(a) * 70, 156 + Math.sin(a) * 70); }
    c.strokeStyle = '#a81e14'; c.lineWidth = 6; c.beginPath(); c.arc(128, 150, 96, -Math.PI / 2 + 0.75, -Math.PI / 2 + 1.2); c.stroke();
    c.font = 'bold 26px serif'; c.fillText('V', 128, 200); c.font = '11px sans-serif'; c.fillText('ELETROMAR · CA', 128, 222);
    grime(c, w, h, 8, 'rgba(110,80,30,A)', 10, 40, .4);
  });
  const gx = 0.0, gy = cy + 0.43;
  const gb = cyl(0.12, 0.13, 0.05, MBack, gx, gy, 0.05, g, 32); gb.rotation.x = Math.PI / 2;
  const gf = new THREE.Mesh(new THREE.CircleGeometry(0.105, 32), new THREE.MeshStandardMaterial({ map: gface, roughness: 0.7 })); gf.position.set(gx, gy, 0.077); g.add(gf);
  const gr = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 10, 36), MBrass); gr.position.set(gx, gy, 0.078); g.add(gr);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.108, 32), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.12, clearcoat: 1 })); glass.position.set(gx, gy, 0.088); g.add(glass);
  const nd = new THREE.Group(); nd.position.set(gx, gy - 0.023, 0.082); g.add(nd);
  box(0.004, 0.1, 0.002, new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, 0.05, 0, nd); cyl(0.008, 0.008, 0.006, MBrass, 0, 0, 0, nd, 10).rotation.x = Math.PI / 2;
  panel.needle = nd;
  // chave-faca principal (à direita, fora do armário)
  const kx = W / 2 + 0.28, ky = cy;
  box(0.26, 0.46, 0.05, new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.6 }), kx, ky, 0.03, g);   // base de baquelite
  for (const dx of [-0.06, 0.06]) { box(0.025, 0.06, 0.05, MCopper, kx + dx, ky + 0.16, 0.08, g); box(0.03, 0.05, 0.04, MCopper, kx + dx, ky - 0.17, 0.075, g); }
  const lev = new THREE.Group(); lev.position.set(kx, ky - 0.17, 0.08); g.add(lev);
  for (const dx of [-0.06, 0.06]) box(0.012, 0.36, 0.035, MCopper, dx, 0.18, 0, lev);
  box(0.16, 0.025, 0.025, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }), 0, 0.33, 0, lev);
  const hdl = cyl(0.025, 0.025, 0.12, new THREE.MeshStandardMaterial({ color: 0x7a1510, roughness: 0.45 }), 0, 0.33, 0.07, lev, 12); hdl.rotation.x = Math.PI / 2;
  panel.lever = lev; panel.setLever = on => { lev.rotation.x = on ? 0 : 1.15; }; panel.setLever(false);
  // eletrodutos subindo até o teto, caixa de passagem e cabos soltos
  for (let i = 0; i < 3; i++) { cyl(0.035, 0.035, CFG.wallH - (cy + Hh / 2), new THREE.MeshStandardMaterial({ color: 0x6f7470, roughness: 0.5, metalness: 0.8 }), -0.45 + i * 0.45, (CFG.wallH + cy + Hh / 2) / 2, 0.06, g, 12); }
  box(0.3, 0.2, 0.12, MP, 0.9, 2.75, 0.07, g);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0.9, 2.65, 0.1), V3(0.95, 2.3, 0.14), V3(kx + 0.02, ky + 0.35, 0.09), V3(kx, ky + 0.22, 0.07)]), 24, 0.012, 6), MCable); g.add(cable);
  const loose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0.6, cy - Hh / 2, 0.12), V3(0.62, cy - Hh / 2 - 0.35, 0.18), V3(0.5, cy - Hh / 2 - 0.6, 0.15), V3(0.42, 0.15, 0.25)]), 24, 0.01, 6), MCable); g.add(loose);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // faíscas
  panel.sparks = [];
  for (let i = 0; i < 40; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(0.04); sp.visible = false; scene.add(sp); panel.sparks.push({ sp, v: new THREE.Vector3(), life: 0 }); }
  panel.flash = new THREE.PointLight(0xffb060, 0, 4, 2); panel.flash.position.set(g.position.x, cy, g.position.z + 0.4); scene.add(panel.flash);
  panel.spark = (i) => {
    const x = g.position.x - 0.52 + i * 0.22, y = cy - 0.08, z = g.position.z + 0.14;
    for (const s of panel.sparks) { s.life = rand(0.4, 1); s.sp.visible = true; s.sp.position.set(x, y + rand(-0.1, 0.1), z); s.v.set(rand(-1.4, 1.4), rand(-0.2, 2.2), rand(0.3, 1.8)); }
    panel.flash.intensity = 6;
  };
}
interact.push({ type: 'panel', pos: new THREE.Vector3(18 * CS + 1, 0, 16 * CS + 0.6), active: true });
const exitDoor = { mesh: null, open: 0, opening: false };
{
  const d = box(4.0, CFG.wallH, 0.3, M.door, 22 * CS, CFG.wallH / 2, 26 * CS + 1); exitDoor.mesh = d;
  const sign = box(1.0, 0.28, 0.05, new THREE.MeshStandardMaterial({ color: 0x0c2a16, emissive: 0x0a2a14, emissiveIntensity: 0.3 }), 22 * CS, 2.95, 26 * CS + 0.8); exitDoor.sign = sign;
}

/* ---------------------------------------------------------------
   LUZES DO MUNDO (+ grade de luz para a IA)
   --------------------------------------------------------------- */
const LIGHTS = [];
function addLight(cx, cz, color, intensity, range, strength, sector, on, kind = 'fluo') {
  const pos = new THREE.Vector3(cx * CS, CFG.wallH - 0.25, cz * CS);
  const L = new THREE.PointLight(color, on ? intensity : 0, range, 2);
  L.position.copy(pos); scene.add(L);
  let fixture;
  if (kind === 'fluo') {
    fixture = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.2), new THREE.MeshStandardMaterial({ color: 0x222, emissive: new THREE.Color(color), emissiveIntensity: on ? 1.6 : 0.02 }));
    fixture.position.set(pos.x, CFG.wallH - 0.05, pos.z);
  } else {
    fixture = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: new THREE.Color(color), emissiveIntensity: on ? 2 : 0.02 }));
    fixture.position.set(pos.x, CFG.wallH - 0.15, pos.z);
  }
  level.add(fixture);
  const o = { L, fixture, pos, base: intensity, range, strength, sector, on, kind, flick: 1, flickT: 0, broken: kind === 'fluo' ? Math.random() < 0.5 : false };
  LIGHTS.push(o); return o;
}
addLight(19.5, 18.5, 0xcfeee5, 26, 13, 1.3, 'recepcao', true);
addLight(24.5, 22.5, 0xcfeee5, 22, 12, 1.2, 'recepcao', true);
[5.5, 16.5, 27.5, 38.5].forEach(x => addLight(x, 14, 0xff2a18, 5, 7, 0.3, 'corredor', true, 'red'));
const SECTOR_ORDER = ['enfermaria', 'admin', 'necroterio', 'autopsia', 'pacientes'];
addLight(22, 6, 0xbfeee0, 28, 13, 1.2, 'enfermaria', false);
addLight(36, 8.5, 0xd8eedd, 26, 12, 1.2, 'admin', false);
addLight(8, 20, 0x9cc6e8, 26, 12, 1.2, 'necroterio', false);
addLight(35.5, 21.5, 0xcfeee5, 26, 12, 1.2, 'autopsia', false);
addLight(7.5, 6.5, 0xbfe0d0, 22, 11, 1.1, 'pacientes', false);
addLight(16, 31, 0xffa040, 3, 5, 0.35, 'subsolo', true, 'red');
const dawn = addLight(22.5, 30, 0xffa060, 0, 18, 1.5, 'rua', false, 'red');
dawn.fixture.visible = false;

const lightGrid = new Float32Array(W * H);
let blackout = 0;
function computeLightGrid() {
  lightGrid.fill(0);
  for (const l of LIGHTS) {
    if (!l.on) continue;
    if (blackout > 0 && l.sector === 'recepcao') continue;
    const r = l.range * 0.85;
    const x0 = Math.floor((l.pos.x - r) / CS), x1 = Math.floor((l.pos.x + r) / CS), z0 = Math.floor((l.pos.z - r) / CS), z1 = Math.floor((l.pos.z + r) / CS);
    for (let z = Math.max(0, z0); z <= Math.min(H - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      if (isWall(x, z)) continue;
      const c = center(x, z), d = Math.hypot(c.x - l.pos.x, c.z - l.pos.z);
      if (d > r) continue;
      if (wallsBetween(l.pos.x, l.pos.z, c.x, c.z, 1)) continue;
      lightGrid[idx(x, z)] = Math.min(1, lightGrid[idx(x, z)] + l.strength * (1 - d / r));
    }
  }
}
computeLightGrid();
const lightAt = v => { const [x, z] = cellOf(v); return inb(x, z) ? lightGrid[idx(x, z)] : 0; };

/* ---------------------------------------------------------------
   LANTERNA
   --------------------------------------------------------------- */
const flash = new THREE.SpotLight(0xffe6bf, CFG.flash.normalI, CFG.flash.normalDist, CFG.flash.normalAngle, 0.55, 1.6);
flash.castShadow = true; flash.shadow.mapSize.set(1024, 1024); flash.shadow.camera.near = 0.2; flash.shadow.camera.far = 30; flash.shadow.bias = -0.0008;
flash.shadow.mapSize.set(2048, 2048);
// "cookie" da lente: centro quente, anel, sujeira — o padrão irregular de uma lanterna real
flash.map = tex(256, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.18, '#f4f0e8'); gr.addColorStop(0.3, '#b9b4aa'); gr.addColorStop(0.36, '#e8e2d6'); gr.addColorStop(0.42, '#8a857c'); gr.addColorStop(0.75, '#4a4640'); gr.addColorStop(0.86, '#6a655c'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(0,0,0,${rand(.05, .25)})`; g.beginPath(); g.arc(rand(30, 226), rand(30, 226), rand(2, 12), 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 90); g.lineTo(200, 160); g.stroke();
});
const fl = { on: true, focus: false, battery: 100, heat: 0, overheat: 0, deadFlicker: 0 };
// modelo da lanterna em 1ª pessoa
/* ---------------------------------------------------------------
   VIEWMODEL — mão + lanterna de alumínio (anos 80) em 1ª pessoa.
   Renderizada numa segunda passada (cena própria, profundidade limpa)
   para nunca atravessar paredes; iluminada pela luz do ambiente ao redor.
   --------------------------------------------------------------- */
const vmScene = new THREE.Scene();
const vmRoot = new THREE.Group(); vmRoot.matrixAutoUpdate = false; vmScene.add(vmRoot);
const vmHemi = new THREE.HemisphereLight(0x8899aa, 0x080606, 0.2); vmScene.add(vmHemi);
const vmKey = new THREE.DirectionalLight(0xffffff, 0.3); vmKey.position.set(-0.4, 1, 0.3); vmScene.add(vmKey);
const vmBounce = new THREE.PointLight(0xffd7a8, 0, 0.9, 2); vmScene.add(vmBounce);
const hand = new THREE.Group(); vmRoot.add(hand); hand.position.set(0.2, -0.2, -0.36);
const handAnchor = new THREE.Group(); camera.add(handAnchor);   // cópia invisível da mão na cena principal (carrega o SpotLight)
const carried = new THREE.Group(); vmRoot.add(carried); carried.position.set(-0.26, -0.26, -0.42);
handAnchor.add(flash); flash.position.set(0, 0, -0.12); handAnchor.add(flash.target); flash.target.position.set(-0.2, 0.2, -6);
const TORCH = buildTorch(); hand.add(TORCH.root);
function buildTorch() {
  const T2 = {};
  // --- texturas ---
  const anod = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#1d1e21'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = rand(20, 50) | 0; g.fillStyle = `rgba(${v},${v},${v + 4},.5)`; g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), 1); }
    for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(${rand(120, 190) | 0},${rand(120, 190) | 0},${rand(125, 195) | 0},${rand(.15, .55)})`; g.lineWidth = rand(.4, 1.2); const x = Math.random() * w, y = Math.random() * h, a = rand(0, 6.3), l = rand(4, 40); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(170,170,175,${rand(.2, .5)})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(1, 6), rand(1, 3), rand(0, 3), 0, 7); g.fill(); }
  });
  const barrelTex = tex(512, 256, (g, w, h) => {
    g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, w, h);
    // recartilhado (padrão diamante) no meio do corpo
    g.strokeStyle = '#3a3c41'; g.lineWidth = 2;
    for (let k = -h; k < w + h; k += 9) { g.beginPath(); g.moveTo(k, 30); g.lineTo(k + (h - 60), h - 30); g.stroke(); g.beginPath(); g.moveTo(k, h - 30); g.lineTo(k + (h - 60), 30); g.stroke(); }
    g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, w, 30); g.fillRect(0, h - 30, w, 30);
    g.fillStyle = '#0c0c0d'; g.fillRect(0, 28, w, 3); g.fillRect(0, h - 31, w, 3);
    // desgaste: alumínio aparecendo nas bordas
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(175,175,182,${rand(.15, .6)})`; g.fillRect(Math.random() * w, Math.random() < .5 ? rand(0, 34) : rand(h - 34, h), rand(1, 7), rand(1, 2)); }
    // etiqueta de patrimônio colada (desgastada)
    g.save(); g.translate(300, 60); g.rotate(-0.01);
    g.fillStyle = '#cfc6a8'; g.fillRect(0, 0, 150, 136);
    g.fillStyle = 'rgba(90,70,30,.35)'; for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(rand(0, 150), rand(0, 136), rand(4, 20), 0, 7); g.fill(); }
    g.fillStyle = '#2a2622'; g.font = 'bold 15px monospace'; g.fillText('INST. S. LÁZARO', 8, 24); g.font = '13px monospace'; g.fillText('PATRIMÔNIO', 8, 50); g.font = 'bold 26px monospace'; g.fillText('Nº 0347', 8, 84); g.font = '12px monospace'; g.fillText('MANUTENÇÃO', 8, 110);
    g.fillStyle = 'rgba(27,28,31,.85)'; g.beginPath(); g.moveTo(120, 0); g.lineTo(150, 0); g.lineTo(150, 40); g.fill(); g.fillRect(0, 126, 40, 10);
    g.restore();
  }, 1, 1);
  const skinTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#b98a6e'; g.fillRect(0, 0, w, h);
    grime(g, w, h, 60, 'rgba(160,80,70,A)', 6, 30, .25); grime(g, w, h, 20, 'rgba(90,100,130,A)', 8, 30, .12);
    grime(g, w, h, 18, 'rgba(60,45,30,A)', 6, 26, .35); speckle(g, w, h, 2500, .12);
    g.strokeStyle = 'rgba(110,30,25,.6)'; g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const x = rand(20, 230), y = rand(20, 230); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(10, 30), y + rand(-6, 6)); g.stroke(); }
    for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(95,105,140,${rand(.18, .3)})`; g.lineWidth = rand(2, 4); let x = rand(0, w), y = 0; g.beginPath(); g.moveTo(x, y); while (y < h) { x += rand(-14, 14); y += rand(14, 30); g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,40,30,${rand(.05, .15)})`; g.fillRect(rand(0, w), rand(0, h), 1, 1); }
  });
  const fabricTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#2f3a3f'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(0,0,0,${rand(.15, .3)})`; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(255,255,255,${rand(.02, .06)})`; g.fillRect(x, 0, 1, h); }
    grime(g, w, h, 25, 'rgba(20,18,12,A)', 10, 50, .4); grime(g, w, h, 6, 'rgba(90,80,60,A)', 8, 30, .25);
  }, 2, 2);
  const nm = (t, str, r0, r1) => deriveMaps(t, str, r0, r1);
  const anodMaps = nm(anod, 3, 0.25, 0.55), barMaps = nm(barrelTex, 9, 0.3, 0.6), skinMaps = nm(skinTex, 2.5, 0.5, 0.7), fabMaps = nm(fabricTex, 6, 0.85, 1);
  const MA = new THREE.MeshStandardMaterial({ map: anod, normalMap: anodMaps.normalMap, roughnessMap: anodMaps.roughnessMap, roughness: 1, metalness: 0.85 });
  const MB = new THREE.MeshStandardMaterial({ map: barrelTex, normalMap: barMaps.normalMap, roughnessMap: barMaps.roughnessMap, roughness: 1, metalness: 0.8 });
  MB.normalScale.set(1.6, 1.6);
  const MR = new THREE.MeshStandardMaterial({ color: 0xd9d9dc, metalness: 1, roughness: 0.08, side: THREE.DoubleSide });
  const MRub = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
  const MSkin = new THREE.MeshPhysicalMaterial({ map: skinTex, normalMap: skinMaps.normalMap, roughness: 0.55, sheen: 0.2, sheenColor: new THREE.Color(0xff9078), sheenRoughness: 0.8 });
  const MNail = new THREE.MeshStandardMaterial({ color: 0xc9a796, roughness: 0.35 });
  const MFab = new THREE.MeshStandardMaterial({ map: fabricTex, normalMap: fabMaps.normalMap, roughness: 1, side: THREE.DoubleSide });
  const root = new THREE.Group(); T2.root = root;
  // alinha o eixo da lanterna com a direção do feixe
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-0.2, 0.2, -6).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.95));
  const toZ = geo => { geo.translate(0, -0.14, 0); geo.rotateX(-Math.PI / 2); return geo; };
  const lathe = (pts, mat, seg = 40) => { const m = new THREE.Mesh(toZ(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)), mat); root.add(m); return m; };
  // tampa traseira, corpo recartilhado, cabeça com refletor
  lathe([[0, 0], [0.012, 0], [0.0168, 0.0018], [0.0193, 0.0065], [0.0197, 0.03], [0.0186, 0.032], [0.0186, 0.037]], MA);
  const barrel = new THREE.Mesh(toZ(new THREE.CylinderGeometry(0.019, 0.019, 0.129, 40, 1, true).translate(0, 0.1005, 0)), MB);
  barrel.rotation.z = 2.3; root.add(barrel);
  const head = new THREE.Group(); root.add(head); T2.head = head;
  const headMesh = new THREE.Mesh(toZ(new THREE.LatheGeometry([[0.0186, 0.165], [0.0196, 0.168], [0.022, 0.18], [0.026, 0.198], [0.0282, 0.205], [0.0285, 0.244], [0.0293, 0.2475], [0.0293, 0.258], [0.028, 0.2622], [0.0246, 0.2622]].map(([r, y]) => new THREE.Vector2(r, y)), 40)), MA);
  head.add(headMesh);
  for (let i = 0; i < 6; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0016, 0.03), MA); const a = i / 6 * Math.PI * 2; rib.position.set(Math.cos(a) * 0.0287, Math.sin(a) * 0.0287, -0.085); rib.rotation.z = a; head.add(rib); }
  const refl = new THREE.Mesh(toZ(new THREE.LatheGeometry([[0.0001, 0.239], [0.006, 0.2405], [0.012, 0.2465], [0.019, 0.2545], [0.0245, 0.2615]].map(([r, y]) => new THREE.Vector2(r, y)), 32)), MR); head.add(refl);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffd8a0, emissiveIntensity: 0 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 10, 8), bulbMat); bulb.position.set(0, 0, -0.106); head.add(bulb); T2.bulb = bulb;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0246, 32), new THREE.MeshPhysicalMaterial({ color: 0xdde8ee, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1 }));
  lens.position.z = -0.1215; lens.rotation.y = Math.PI; head.add(lens);
  // anel de vedação e anel de fita (lanyard)
  const oring = new THREE.Mesh(new THREE.TorusGeometry(0.0189, 0.0013, 8, 40), MRub); oring.position.z = -0.025; root.add(oring);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.0011, 6, 16), MR); ring.position.set(0, -0.004, 0.1435); ring.rotation.y = Math.PI / 2; root.add(ring);
  // botão de borracha (liga/desliga)
  const swA = -2.93, sw = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.011, 0.016), MRub); sw.position.set(Math.cos(swA) * 0.0205, Math.sin(swA) * 0.0205, -0.016); sw.rotation.z = swA; root.add(sw); T2.sw = sw; T2.swA = swA;
  // cordão (lanyard) balançando
  const lan = new THREE.Group(); lan.position.set(0, -0.004, 0.146); root.add(lan); T2.lan = lan;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.004, -0.03, 0.012), new THREE.Vector3(0.002, -0.075, 0.006), new THREE.Vector3(-0.004, -0.09, -0.004), new THREE.Vector3(-0.004, -0.05, -0.006), new THREE.Vector3(0, 0, 0)], true);
  lan.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0018, 6, true), new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.9 })));
  T2.lanX = 0; T2.lanVX = 0; T2.lanZ = 0; T2.lanVZ = 0;

  // --- mão direita (empunhadura por cima: dedos envolvem o corpo, polegar no botão) ---
  // dedos e polegar são tubos contínuos e afunilados ao longo de uma curva (sem "segmentos" visíveis),
  // com dobras de pele nas articulações, unhas curvas e tendões no dorso
  const grip = new THREE.Group(); root.add(grip);
  const Rb = 0.019;
  const P3 = (deg, r, z) => new THREE.Vector3(Math.cos(deg * Math.PI / 180) * r, Math.sin(deg * Math.PI / 180) * r, z);
  const fingerTex = tex(256, 128, (c, w, h) => {
    c.fillStyle = '#bb8b70'; c.fillRect(0, 0, w, h);
    grime(c, w, h, 30, 'rgba(170,90,80,A)', 4, 18, .25); grime(c, w, h, 10, 'rgba(70,50,35,A)', 4, 14, .3);
    // dobras nas articulações (eixo u = comprimento do dedo)
    for (const u of [0.05, 0.4, 0.7]) for (let k = 0; k < 6; k++) { c.strokeStyle = `rgba(95,55,45,${rand(.25, .5)})`; c.lineWidth = rand(.8, 1.6); const x = u * w + rand(-6, 6); c.beginPath(); c.moveTo(x, rand(0, h * .3)); c.quadraticCurveTo(x + rand(-4, 4), h * .5, x + rand(-3, 3), rand(h * .7, h)); c.stroke(); }
    speckle(c, w, h, 1800, .1);
  });
  const fMaps = deriveMaps(fingerTex, 5, 0.42, 0.7);
  const MFing = new THREE.MeshPhysicalMaterial({ map: fingerTex, normalMap: fMaps.normalMap, roughness: 0.55, sheen: 0.2, sheenColor: new THREE.Color(0xff8c74), sheenRoughness: 0.8 });
  const tube = (pts, radii, mat = MFing, seg = 28, rs = 14) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, seg, 1, rs, false), pos = geo.attributes.position, tmp = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, c = curve.getPointAt(t), fi = t * (radii.length - 1), i0 = Math.floor(fi), i1 = Math.min(radii.length - 1, i0 + 1), f = fi - i0;
      const r = radii[i0] * (1 - f) + radii[i1] * f;
      for (let j = 0; j <= rs; j++) { const k = i * (rs + 1) + j; tmp.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, tmp.x, tmp.y, tmp.z); }
    }
    geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); grip.add(m);
    const end = curve.getPointAt(1), tip = new THREE.Mesh(new THREE.SphereGeometry(radii[radii.length - 1], 14, 10), mat); tip.position.copy(end); grip.add(tip);
    return { m, curve };
  };
  const ball = (p, r, mat = MSkin, sc) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat); m.position.copy(p); if (sc) m.scale.copy(sc); grip.add(m); return m; };
  const nailAt = (curve, t, r, outward) => {
    const p = curve.getPointAt(t), tg = curve.getTangentAt(t), n = outward.clone().sub(tg.clone().multiplyScalar(outward.dot(tg))).normalize();
    const nail = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), MNail);
    nail.scale.set(r * 0.95, r * 0.55, r * 1.25); nail.position.copy(p).addScaledVector(n, r * 0.45);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); nail.quaternion.copy(q);
    const zl = new THREE.Vector3(0, 0, 1).applyQuaternion(q); nail.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(zl, tg.clone().sub(n.clone().multiplyScalar(tg.dot(n))).normalize()));
    grip.add(nail);
  };
  const fingers = [
    { z: -0.012, r: 0.0086, a: [12, 46, 80, 106, 128, 148, 162] },
    { z: 0.0085, r: 0.0091, a: [10, 46, 82, 108, 132, 152, 168] },
    { z: 0.0285, r: 0.0087, a: [8, 44, 78, 104, 127, 146, 161] },
    { z: 0.046, r: 0.0076, a: [6, 38, 70, 92, 113, 131, 145] }
  ];
  for (const f of fingers) {
    const rr = Rb + f.r + 0.0042;
    // raio por ponto: nó do dedo (MCP) largo, afunila, leves bossas nas articulações
    const pts = f.a.map((d, i) => P3(d, i === 0 ? Rb + 0.017 : i === f.a.length - 1 ? Rb + f.r * 0.98 : rr, f.z + i * 0.0006));
    const R = [1.22, 1.06, 1.04, 0.97, 0.95, 0.88, 0.8].map(k => k * f.r);
    const { curve } = tube(pts, R);
    nailAt(curve, 0.93, f.r * 0.82, P3(f.a[6], 1, 0).setZ(0).normalize());
    ball(pts[0], f.r * 1.32, MSkin, new THREE.Vector3(1, 1.15, 1));                  // nó do dedo
  }
  // dorso da mão: volume principal + 4 tendões + veias na textura
  const back = ball(P3(-14, Rb + 0.02, 0.018), 1, MSkin, new THREE.Vector3(0.018, 0.052, 0.043)); back.rotation.z = -14 * Math.PI / 180;
  ball(P3(-58, Rb + 0.022, 0.03), 1, MSkin, new THREE.Vector3(0.02, 0.03, 0.034)).rotation.z = -58 * Math.PI / 180;
  for (const f of fingers) {
    const t0 = P3(f.a[0] - 6, Rb + 0.031, f.z * 0.85 + 0.003), t1 = P3(-50, Rb + 0.036, 0.03 + f.z * 0.35);
    tube([t0, t0.clone().lerp(t1, 0.5).add(P3(-30, 0.0025, 0)), t1], [0.0032, 0.0036, 0.0025], MSkin, 12, 8);
  }
  // pulso e antebraço contínuos
  const wrist = P3(-70, Rb + 0.03, 0.07), elbowDir = new THREE.Vector3(0.35, -0.55, 1).normalize();
  const fore = wrist.clone().add(elbowDir.clone().multiplyScalar(0.42));
  tube([P3(-52, Rb + 0.024, 0.034), P3(-64, Rb + 0.028, 0.055), wrist, wrist.clone().add(elbowDir.clone().multiplyScalar(0.12)), fore], [0.026, 0.024, 0.023, 0.028, 0.036], MSkin, 24, 18);
  // polegar: eminência tenar + falanges contínuas até o botão
  ball(P3(-88, Rb + 0.02, 0.03), 1, MSkin, new THREE.Vector3(0.017, 0.022, 0.026)).rotation.z = -88 * Math.PI / 180;
  const th = [P3(-72, Rb + 0.021, 0.036), P3(-98, Rb + 0.018, 0.022), P3(-122, Rb + 0.015, 0.009), P3(-142, Rb + 0.013, -0.003), P3(-158, Rb + 0.012, -0.012), P3(-168, Rb + 0.0115, -0.018)];
  const thc = tube(th, [0.0125, 0.0115, 0.0105, 0.0098, 0.0092, 0.0085]).curve;
  nailAt(thc, 0.9, 0.0072, P3(-168, 1, 0).setZ(0).normalize());
  // relógio de pulso (anos 80): pulseira de couro, caixa de aço, ponteiros com a hora real
  const watchAt = wrist.clone().add(elbowDir.clone().multiplyScalar(0.035));
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.0255, 0.0045, 8, 32), new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.7 })); strap.scale.set(1, 1, 2.2); strap.position.copy(watchAt); strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), elbowDir); grip.add(strap);
  const up = new THREE.Vector3(0, 1, 0).sub(elbowDir.clone().multiplyScalar(elbowDir.y)).normalize();
  const wcase = new THREE.Group(); wcase.position.copy(watchAt).addScaledVector(up, 0.028); wcase.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up); grip.add(wcase);
  const wc = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.008, 24), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 1, roughness: 0.25 })); wc.rotation.x = Math.PI / 2; wcase.add(wc);
  const wface = tex(128, 128, (c, w, h) => { c.fillStyle = '#e8e2cf'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.save(); c.translate(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); c.rotate(a); c.fillRect(-2, -6, 4, 12); c.restore(); } c.strokeStyle = 'rgba(80,60,20,.4)'; c.lineWidth = 3; c.beginPath(); c.arc(64, 64, 58, 0.4, 1.4); c.stroke(); });
  const wf = new THREE.Mesh(new THREE.CircleGeometry(0.0125, 24), new THREE.MeshStandardMaterial({ map: wface, roughness: 0.6 })); wf.position.z = 0.0042; wcase.add(wf);
  T2.hHour = new THREE.Group(); T2.hMin = new THREE.Group(); [T2.hHour, T2.hMin].forEach((hg, i) => { hg.position.z = 0.0046 + i * 0.0003; wcase.add(hg); const hm = new THREE.Mesh(new THREE.BoxGeometry(0.0012, i ? 0.0105 : 0.007, 0.0004), new THREE.MeshBasicMaterial({ color: 0x111111 })); hm.position.y = (i ? 0.0105 : 0.007) / 2; hg.add(hm); });
  const wg = new THREE.Mesh(new THREE.CircleGeometry(0.0128, 24), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.02, clearcoat: 1 })); wg.position.z = 0.0052; wcase.add(wg);
  T2.thumbTip = th[th.length - 1];
  // manga do casaco de trabalho + punho canelado
  const sleeveStart = wrist.clone().add(elbowDir.clone().multiplyScalar(0.05));
  const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.058, 0.42, 20, 4, true), MFab);
  sl.position.copy(sleeveStart).add(elbowDir.clone().multiplyScalar(0.21)); sl.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), elbowDir); grip.add(sl);
  for (let i = 0; i < 3; i++) { const cf = new THREE.Mesh(new THREE.TorusGeometry(0.044 + i * 0.0006, 0.0055, 8, 24), MFab); cf.position.copy(sleeveStart).add(elbowDir.clone().multiplyScalar(0.004 + i * 0.008)); cf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), elbowDir); grip.add(cf); }
  grip.rotation.z = 0; T2.grip = grip;
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  T2.clickT = 0; T2.tapT = 0; T2.twist = 0; T2.aim = 0;
  return T2;
}
function updateViewmodelLight(dt) {
  // luz ambiente estimada a partir das lâmpadas próximas (a mão fica vermelha no corredor, fria na recepção)
  let r = 0, g = 0, b = 0, sum = 0; const cp = camera.position;
  for (const l of LIGHTS) {
    if (l.L.intensity <= 0.01) continue; const d = l.pos.distanceTo(cp); if (d > l.range) continue;
    if (wallsBetween(l.pos.x, l.pos.z, cp.x, cp.z, 1)) continue;
    const w = l.L.intensity / (d * d + 2); r += l.L.color.r * w; g += l.L.color.g * w; b += l.L.color.b * w; sum += w;
  }
  const k = clamp(sum * 0.35, 0.02, 1.6);
  if (sum > 0) vmHemi.color.setRGB(r / sum, g / sum, b / sum); else vmHemi.color.set(0x445566);
  vmHemi.intensity = lerp(vmHemi.intensity, k, Math.min(1, dt * 6)); vmKey.intensity = vmHemi.intensity * 0.9; vmKey.color.copy(vmHemi.color);
  // luz que vaza do refletor e volta das superfícies à frente ilumina os dedos
  const fI = flash.intensity / CFG.flash.normalI;
  vmBounce.intensity = fI * 0.018; vmBounce.color.copy(flash.color);
  vmBounce.position.set(0, 0.02, -0.2).applyMatrix4(hand.matrix).applyMatrix4(vmRoot.matrix);
  { const d = new Date(); TORCH.hMin.rotation.z = -(d.getMinutes() + d.getSeconds() / 60) / 60 * Math.PI * 2; TORCH.hHour.rotation.z = -((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2; }
  TORCH.bulb.material.emissiveIntensity = fI * 6; TORCH.bulb.material.emissive.copy(flash.color);
}
// feixe volumétrico (cone aditivo) — visível na poeira e na névoa
const beamDirLocal = new THREE.Vector3(-0.2, 0.2, -6).normalize();
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 }, uCol: { value: new THREE.Color(0xffe2b8) } },
  vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform float uI; uniform vec3 uCol; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(1. - abs(dot(vN, vV)), 1.5); float a = smoothstep(1.0, 0.9, vT) * pow(vT, 1.3); gl_FragColor = vec4(uCol * uI * e * a, 1.); }',
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
});
const beamGeo = new THREE.ConeGeometry(1, 1, 32, 1, true); beamGeo.translate(0, -0.5, 0); beamGeo.rotateX(Math.PI / 2);
const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = false; beam.position.set(0, 0, -0.12); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), beamDirLocal); beam.frustumCulled = false; handAnchor.add(beam);
// poeira em suspensão: só brilha dentro do cone da lanterna
const DUST_N = 1600, dustPos = new Float32Array(DUST_N * 3), dustSeed = new Float32Array(DUST_N);
for (let i = 0; i < DUST_N; i++) { dustPos[i * 3] = rand(0, 12); dustPos[i * 3 + 1] = rand(0, 3.1); dustPos[i * 3 + 2] = rand(0, 12); dustSeed[i] = Math.random(); }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3)); dustGeo.setAttribute('seed', new THREE.BufferAttribute(dustSeed, 1));
const dustMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uLens: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uTan: { value: 0.5 }, uLen: { value: 10 }, uI: { value: 1 }, uPx: { value: 1 } },
  vertexShader: `attribute float seed; uniform float uTime, uTan, uLen, uI, uPx; uniform vec3 uCam, uLens, uDir; varying float vB;
    void main(){
      vec3 p = position + vec3(sin(uTime*0.11 + seed*40.)*0.6, sin(uTime*0.07 + seed*23.)*0.25 - uTime*0.02, cos(uTime*0.09 + seed*31.)*0.6);
      vec3 w = vec3(mod(p.x - uCam.x + 6., 12.) - 6. + uCam.x, mod(p.y, 3.1), mod(p.z - uCam.z + 6., 12.) - 6. + uCam.z);
      vec3 d = w - uLens; float t = dot(d, uDir); float r = length(d - uDir * t);
      float cone = step(0.05, t) * (1. - smoothstep(uTan * t * 0.55, uTan * t, r)) * (1. - smoothstep(uLen * 0.45, uLen, t));
      vB = uI * cone * (0.35 + 0.65 * fract(seed * 7.3)) / (1. + t * 0.25);
      vec4 mv = modelViewMatrix * vec4(w, 1.); gl_Position = projectionMatrix * mv;
      gl_PointSize = (1.2 + seed * 2.2) * uPx * (2.2 / max(0.3, -mv.z));
    }`,
  fragmentShader: 'varying float vB; void main(){ if (vB < 0.004) discard; float d = length(gl_PointCoord - 0.5); float a = 1. - smoothstep(0.0, 0.5, d); gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * vB * a * 0.9, 1.); }',
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
});
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);

/* ---------------------------------------------------------------
   JOGADOR
   --------------------------------------------------------------- */
const START = center(21, 21);
function spotVisual(s, hiddenIn) { if (!s) return; if (s.door) s.door.visible = !hiddenIn; if (s.sheets) s.sheets.forEach(m => m.visible = !hiddenIn); }
const P = {
  pos: START.clone(), yaw: 0, eyeH: 1.65, pitch: 0, crouch: false, stamina: 1, exhausted: 0,
  hidden: null, hideT: 0, holdBreath: false, breathLock: 0, installedIds: [],
  carry: [], installed: 0, dead: false, won: false, region: '', noiseLevel: 0
};
const keys = {};
/* ---------------------------------------------------------------
   CÂMERA CORPORAL — passada (bob vertical + balanço lateral + roll),
   impacto do pé (mola), respiração, tremor por trauma/medo, atraso da mão
   --------------------------------------------------------------- */
const SHAKE_LEVELS = [[1.0, 'ALTO'], [0.6, 'MÉDIO'], [0.3, 'BAIXO'], [0, 'DESLIGADO']];
const CAM = { level: 1.0, li: 0, amp: 0, phase: 0, run: false, kick: 0, kickV: 0, trauma: 0, floor: 0, t: 0, pyaw: 0, ppitch: 0, hy: 0, hx: 0 };
function addTrauma(v) { CAM.trauma = Math.min(1, CAM.trauma + v); }
function cycleShake() { CAM.li = (CAM.li + 1) % SHAKE_LEVELS.length; CAM.level = SHAKE_LEVELS[CAM.li][0]; if (typeof OPT !== 'undefined') { OPT.shake = CAM.li; applyOpts(); } const t = 'BALANÇO DA CÂMERA: ' + SHAKE_LEVELS[CAM.li][1]; const b = document.getElementById('shakeBtn'); if (b) b.textContent = t; return t; }
function footfall(mode) {
  SFX.step(mode); emitNoise(P.pos, CFG.noise[mode] * (P.region === 'subsolo' ? 1.5 : 1), 1);
  CAM.kickV -= (mode === 'run' ? 0.6 : mode === 'crouch' ? 0.1 : 0.26);
  if (mode === 'run') addTrauma(0.06);
}
function applyCamera(dt, bx, by, bz, gait) {
  CAM.t += dt; const time = CAM.t, k = CAM.level;
  const a = gait ? CAM.amp * k : 0, ph = CAM.phase, s = Math.sin(ph), as = Math.abs(s), run = CAM.run;
  const V = run ? 0.085 : 0.05, LAT = run ? 0.045 : 0.028, ROLL = run ? 0.024 : 0.012, NOD = run ? 0.02 : 0.009;
  let y = (as - 0.64) * V * a, x = s * LAT * a, roll = -s * ROLL * a, pitch = (0.64 - as) * NOD * a, yawG = Math.cos(ph) * 0.006 * a;
  // mola do impacto do pé
  CAM.kickV += (-170 * CAM.kick - 15 * CAM.kickV) * dt; CAM.kick += CAM.kickV * dt;
  y += CAM.kick * 0.1 * Math.max(k, 0.2); pitch += CAM.kick * 0.05 * k;
  // respiração (mais pesada com o fôlego baixo; some ao prender a respiração)
  const br = P.holdBreath ? 0.15 : 1 + (1 - P.stamina) * 2.5, bf = P.stamina < 0.5 ? 3.0 : 1.6;
  y += Math.sin(time * bf) * 0.006 * br * Math.max(k, 0.3); pitch += Math.sin(time * bf + 0.7) * 0.003 * br * Math.max(k, 0.3);
  // tremor por trauma (gritos, impactos) + piso de medo (proximidade da criatura, perseguição, ignição)
  CAM.trauma = Math.max(CAM.floor, CAM.trauma - dt * 0.75);
  const sh = CAM.trauma * CAM.trauma * Math.max(k, 0.25);
  const n = (f, o) => Math.sin(time * f + o) * 0.55 + Math.sin(time * f * 1.93 + o * 1.7) * 0.3 + Math.sin(time * f * 3.71 + o * 2.3) * 0.15;
  const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  camera.position.set(bx + rx * x + n(9, 3) * 0.02 * sh, by + y + n(11, 5) * 0.02 * sh, bz + rz * x);
  camera.rotation.set(P.pitch + pitch + n(19, 4) * 0.035 * sh, P.yaw + yawG + n(17, 1) * 0.035 * sh, roll + n(13, 7) * 0.055 * sh, 'YXZ');
  // mão/lanterna: balança com a passada e atrasa em relação ao giro da cabeça (o feixe "pesa")
  let dyaw = P.yaw - CAM.pyaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
  const dpit = P.pitch - CAM.ppitch; CAM.pyaw = P.yaw; CAM.ppitch = P.pitch;
  const lagK = 0.25 + 0.75 * Math.max(k, 0.3);
  CAM.hy = lerp(CAM.hy, clamp(-dyaw / Math.max(dt, 1e-3) * 0.018 * lagK, -0.16, 0.16), Math.min(1, dt * 9));
  CAM.hx = lerp(CAM.hx, clamp(-dpit / Math.max(dt, 1e-3) * 0.018 * lagK, -0.12, 0.12), Math.min(1, dt * 9));
  const fear = CAM.floor;
  hand.position.set(0.2 - s * 0.014 * a + n(23, 2) * 0.003 * fear, -0.2 + (as - 0.64) * 0.03 * a - CAM.kick * 0.04 + n(29, 6) * 0.003 * fear, -0.36);
  hand.rotation.set(CAM.hx + (as - 0.64) * 0.05 * a + n(31, 8) * 0.012 * fear, CAM.hy + s * 0.035 * a + n(27, 9) * 0.012 * fear, -s * 0.03 * a);
  // pose: mirar (foco) traz a lanterna à frente; correr abaixa; batida quando a bateria falha
  TORCH.aim = lerp(TORCH.aim, fl.focus ? 1 : 0, Math.min(1, dt * 7));
  const runK = run ? CAM.amp : 0;
  hand.position.x -= 0.07 * TORCH.aim; hand.position.y += 0.06 * TORCH.aim - 0.035 * runK; hand.position.z -= 0.04 * TORCH.aim;
  hand.rotation.x += -0.05 * TORCH.aim + 0.22 * runK; hand.rotation.y += 0.06 * TORCH.aim;
  if (TORCH.tapT > 0) { TORCH.tapT -= dt; const tp = Math.sin((1 - TORCH.tapT / 0.35) * Math.PI); hand.position.y -= tp * 0.035; hand.rotation.x -= tp * 0.25; }
  // cabeça gira ao focar (como uma lanterna de foco ajustável), botão afunda ao clicar
  TORCH.twist = lerp(TORCH.twist, fl.focus ? 1.2 : 0, Math.min(1, dt * 8)); TORCH.head.rotation.z = TORCH.twist;
  if (TORCH.clickT > 0) TORCH.clickT -= dt;
  const pr = TORCH.clickT > 0 ? 0.0014 : 0; TORCH.sw.position.set(Math.cos(TORCH.swA) * (0.0205 - pr), Math.sin(TORCH.swA) * (0.0205 - pr), -0.016);
  // cordão: pêndulo com mola, reage ao giro e à passada
  const tx = -CAM.hx * 3 + (as - 0.64) * 0.6 * a + TORCH.aim * 0.2, tz = CAM.hy * 3 + s * 0.35 * a;
  TORCH.lanVX += (-(TORCH.lanX - tx) * 60 - TORCH.lanVX * 3) * dt; TORCH.lanX += TORCH.lanVX * dt;
  TORCH.lanVZ += (-(TORCH.lanZ - tz) * 60 - TORCH.lanVZ * 3) * dt; TORCH.lanZ += TORCH.lanVZ * dt;
  TORCH.lan.rotation.set(clamp(TORCH.lanX, -1, 1), 0, clamp(TORCH.lanZ, -1, 1));
  handAnchor.position.copy(hand.position); handAnchor.quaternion.copy(hand.quaternion);
}
let mouseFocus = false, eHeld = false, installT = 0, playing = false, paused = false;
const stats = { deaths: 0, burns: 0, t0: 0 };
let checkpoint = { installed: 0, battery: 100 };

/* ---------------------------------------------------------------
   CRIATURA — modelo procedural articulado
   --------------------------------------------------------------- */
function limb(len, r0, r1, mat) { const p = new THREE.Group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 8), mat); m.position.y = -len / 2; m.castShadow = true; p.add(m); return p; }
const C = { root: new THREE.Group() };
{
  const r = C.root; scene.add(r);
  C.hips = new THREE.Group(); C.hips.position.y = 1.25; r.add(C.hips);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), M.skinPlain); pelvis.scale.set(1.2, 0.7, 0.8); pelvis.castShadow = true; C.hips.add(pelvis);
  C.spine = new THREE.Group(); C.hips.add(C.spine);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.11, 0.9, 12), M.skin); torso.position.y = 0.45; torso.scale.z = 0.62; torso.rotation.y = Math.PI; torso.castShadow = true; C.spine.add(torso);
  // costelas salientes
  for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.012, 0.011, 4, 14, Math.PI * 1.25), M.skinPlain); rib.rotation.x = Math.PI / 2; rib.rotation.z = -Math.PI * 0.12; rib.scale.y = 0.65; rib.position.y = 0.72 - i * 0.08; C.spine.add(rib); }
  C.neck = new THREE.Group(); C.neck.position.y = 0.88; C.spine.add(C.neck);
  const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.28, 8), M.skinPlain); nk.position.y = 0.12; nk.castShadow = true; C.neck.add(nk);
  C.head = new THREE.Group(); C.head.position.y = 0.26; C.neck.add(C.head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), M.skinPlain); skull.scale.set(0.85, 1.3, 1.0); skull.position.y = 0.15; skull.castShadow = true; C.head.add(skull);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.03, 6, 16, Math.PI * 1.3), M.cloth); band.rotation.x = Math.PI / 2 + 0.3; band.rotation.z = 0.6; band.position.y = 0.27; C.head.add(band);
  C.jaw = new THREE.Group(); C.jaw.position.set(0, 0.06, 0.03); C.head.add(C.jaw);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.11), M.skinPlain); jaw.position.set(0, -0.1, 0.04); jaw.castShadow = true; C.jaw.add(jaw);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.02), M.mouth); mouth.position.set(0, -0.08, 0.1); C.jaw.add(mouth);
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4), M.ceramic); t.position.set(-0.04 + i * 0.016, -0.005, 0.105); t.rotation.x = Math.PI; C.jaw.add(t); }
  C.eyeMat = new THREE.MeshBasicMaterial({ color: 0xbfc8b8 });
  C.eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), C.eyeMat); e.position.set(s * 0.058, 0.2, 0.118); C.head.add(e); C.eyes.push(e);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x050505 })); pu.position.set(0, 0, 0.026); e.add(pu); e.userData.pupil = pu;
  }
  C.eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xdfffe8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  C.eyeGlow.scale.set(0.5, 0.25, 1); C.eyeGlow.position.set(0, 0.2, 0.16); C.head.add(C.eyeGlow);
  // braços longos
  C.arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.22, 0.8, 0); C.spine.add(sh);
    const up = limb(0.74, 0.045, 0.035, M.skinPlain); sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.74; up.add(el);
    const jn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.joint); el.add(jn);
    const fo = limb(0.8, 0.035, 0.025, M.skinPlain); el.add(fo);
    const hd = new THREE.Group(); hd.position.y = -0.8; fo.add(hd);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.03), M.skinPlain); palm.position.y = -0.05; hd.add(palm);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.004, 0.26, 4), M.joint); f.position.set(-0.03 + i * 0.02, -0.23, 0); f.rotation.z = (i - 1.5) * 0.08; hd.add(f); }
    C.arms.push({ sh, up, el, fo, hd, s });
  }
  // correias da camisa de força penduradas
  C.straps = [];
  for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.006), M.cloth); st.geometry.translate(0, -0.45, 0); st.position.set(0, -0.2 - i * 0.1, 0.03); C.arms[0].up.add(st); C.straps.push(st); }
  const rag = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.45, 10, 1, true), M.cloth); rag.position.y = -0.05; rag.scale.z = 0.7; C.hips.add(rag);
  C.legs = [];
  for (const s of [-1, 1]) {
    const th = limb(0.63, 0.06, 0.045, M.skinPlain); th.position.set(s * 0.1, 0, 0); C.hips.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.63; th.children[0].parent.add(kn);
    const kj = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.joint); kn.add(kj);
    const sn = limb(0.6, 0.045, 0.03, M.skinPlain); kn.add(sn);
    const ft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.24), M.skinPlain); ft.position.set(0, -0.62, 0.07); sn.add(ft);
    C.legs.push({ th, kn: sn, s });
  }
  // eu: kn grupo é o joelho; reorganiza referência
  C.legs.forEach(l => { l.knee = l.th.children[1]; });
}
// vapor (partículas simples)
const steam = [];
for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xcfd6d0, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; scene.add(s); steam.push({ s, life: 0, v: new THREE.Vector3() }); }
let DANGER = 0; const HAZE = { x: 0.5, y: 0.5, i: 0, r: 0.4, on: 0 };
function puff(p, n = 2, hot = false, faint = false) {
  for (let k = 0; k < n; k++) { const s = steam.find(o => o.life <= 0); if (!s) return; s.life = 1; s.s.visible = true; s.s.position.copy(p).add(new THREE.Vector3(rand(-.08, .08), rand(-.05, .05), rand(-.08, .08))); s.v.set(rand(-.2, .2), rand(.4, .9), rand(-.2, .2)); s.s.material.color.set(hot ? 0xffb070 : 0xcfd6d0); s.s.scale.setScalar(0.15); s.faint = faint; if (faint) s.v.set(rand(-.05, .05), rand(.05, .15), rand(-.05, .05)); }
}

/* ---------------------------------------------------------------
   ÁUDIO (WebAudio procedural, espacial HRTF)
   --------------------------------------------------------------- */
const A = { ctx: null };
function audioInit() {
  if (A.ctx) { A.ctx.resume(); return; }
  const ctx = A.ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(ctx.destination);
  A.master = ctx.createGain(); A.master.gain.value = 0.9; A.master.connect(comp);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; A.noise = nb;
  const bb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), b = bb.getChannelData(0); let last = 0;
  for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; } A.brown = bb;
  // reverb simples (impulso sintético)
  const ir = ctx.createBuffer(2, ctx.sampleRate * 2.4, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3.2); }
  A.verb = ctx.createConvolver(); A.verb.buffer = ir; A.verbGain = ctx.createGain(); A.verbGain.gain.value = 0.35; A.verb.connect(A.verbGain).connect(A.master);
  // ambiência
  const amb = loopNoise(A.brown); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; A.ambG = ctx.createGain(); A.ambG.gain.value = 0.22; amb.connect(lp).connect(A.ambG).connect(A.master);
  A.hum = ctx.createGain(); A.hum.gain.value = 0; A.hum.connect(A.master);
  for (const f of [60, 120, 180]) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = f === 60 ? 0.5 : 0.18; o.connect(g).connect(A.hum); o.start(); }
  // tensão / perseguição
  A.tension = ctx.createGain(); A.tension.gain.value = 0; A.tension.connect(A.master);
  for (const f of [55, 58.3, 82.4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 420; o.connect(f2).connect(A.tension); o.start(); }
  A.chase = ctx.createGain(); A.chase.gain.value = 0; A.chase.connect(A.master);
  // criatura: cadeia espacial
  A.cPan = ctx.createPanner(); Object.assign(A.cPan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 2.2, rolloffFactor: 1.3, maxDistance: 70 });
  A.cFilt = ctx.createBiquadFilter(); A.cFilt.type = 'lowpass'; A.cFilt.frequency.value = 8000;
  A.cIn = ctx.createGain(); A.cIn.connect(A.cFilt).connect(A.cPan); A.cPan.connect(A.master); A.cPan.connect(A.verb);
  // respiração/rosnado contínuo da criatura
  A.growlG = ctx.createGain(); A.growlG.gain.value = 0; A.growlG.connect(A.cIn);
  const go = ctx.createOscillator(); go.type = 'sawtooth'; go.frequency.value = 46; const gf = ctx.createBiquadFilter(); gf.type = 'bandpass'; gf.frequency.value = 320; gf.Q.value = 3;
  const gn = loopNoise(A.noise); const gnf = ctx.createBiquadFilter(); gnf.type = 'bandpass'; gnf.frequency.value = 700; gnf.Q.value = 1.5; const gng = ctx.createGain(); gng.gain.value = 0.5;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35; const lfoG = ctx.createGain(); lfoG.gain.value = 0.5; const breath = ctx.createGain(); breath.gain.value = 0.5; lfo.connect(lfoG).connect(breath.gain); lfo.start();
  go.connect(gf).connect(breath); gn.connect(gnf).connect(gng).connect(breath); breath.connect(A.growlG); go.start(); A.growlOsc = go; A.breathLfo = lfo;
  // correias arrastando
  A.dragG = ctx.createGain(); A.dragG.gain.value = 0; const dn = loopNoise(A.noise); const df = ctx.createBiquadFilter(); df.type = 'bandpass'; df.frequency.value = 1800; df.Q.value = 0.8; dn.connect(df).connect(A.dragG).connect(A.cIn);
  // chiado de queimadura
  A.sizzleG = ctx.createGain(); A.sizzleG.gain.value = 0; const sn = loopNoise(A.noise); const sf = ctx.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 3500; sn.connect(sf).connect(A.sizzleG).connect(A.cIn);
  // lanterna em foco (zumbido que sobe com o calor)
  A.focusG = ctx.createGain(); A.focusG.gain.value = 0; A.focusOsc = ctx.createOscillator(); A.focusOsc.type = 'triangle'; A.focusOsc.frequency.value = 220; A.focusOsc.connect(A.focusG).connect(A.master); A.focusOsc.start();
  // sirene
  A.sirenG = ctx.createGain(); A.sirenG.gain.value = 0; const so = ctx.createOscillator(); so.type = 'square'; so.frequency.value = 700; const sl = ctx.createOscillator(); sl.frequency.value = 0.6; const slg = ctx.createGain(); slg.gain.value = 180; sl.connect(slg).connect(so.frequency); sl.start(); const sfl = ctx.createBiquadFilter(); sfl.type = 'lowpass'; sfl.frequency.value = 1400; so.connect(sfl).connect(A.sirenG).connect(A.master); A.sirenG.connect(A.verb); so.start();
  A.nextClank = 6; A.nextBeat = 0; A.nextKick = 0;
}
function loopNoise(buf) { const s = A.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
function env(g, t, a, peak, dcy) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy); }
function burst({ f = 800, q = 1, type = 'bandpass', peak = 0.5, a = 0.003, d = 0.15, dest, rate = 1 }) {
  if (!A.ctx) return; const t = A.ctx.currentTime;
  const s = A.ctx.createBufferSource(); s.buffer = A.noise; s.playbackRate.value = rate;
  const fl = A.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = A.ctx.createGain(); env(g, t, a, peak, d); s.connect(fl).connect(g).connect(dest || A.master); s.start(t, Math.random()); s.stop(t + a + d + 0.05);
}
function tone({ f = 100, f2, type = 'sine', peak = 0.4, a = 0.005, d = 0.2, dest }) {
  if (!A.ctx) return; const t = A.ctx.currentTime; const o = A.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = A.ctx.createGain(); env(g, t, a, peak, d); o.connect(g).connect(dest || A.master); o.start(t); o.stop(t + a + d + 0.05);
}
function spatialOneShot(pos, fn) { // cria panner temporário em uma posição
  if (!A.ctx) return; const p = A.ctx.createPanner(); Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 3, rolloffFactor: 1, maxDistance: 80 });
  p.positionX.value = pos.x; p.positionY.value = pos.y || 1.5; p.positionZ.value = pos.z; p.connect(A.master); p.connect(A.verb); fn(p); setTimeout(() => p.disconnect(), 5000);
}
const SFX = {
  step(mode) {
    const wet = P.region === 'subsolo' || P.region === 'rua';
    const set = A.steps && (wet ? (mode === 'run' ? A.steps.wetrun || A.steps.wet : A.steps.wet) : (mode === 'run' ? A.steps.tilerun || A.steps.tile : A.steps.tile));
    if (set && set.length) {
      // amostras reais (ElevenLabs): variação sem repetir, pitch e volume aleatórios, pé esquerdo/direito no estéreo
      let k; do { k = (Math.random() * set.length) | 0; } while (set.length > 1 && k === SFX._lastStep); SFX._lastStep = k;
      const t = A.ctx.currentTime, src = A.ctx.createBufferSource(); src.buffer = set[k]; src.playbackRate.value = rand(0.93, 1.07) * (mode === 'crouch' ? 0.92 : 1);
      const g = A.ctx.createGain(); g.gain.value = (mode === 'run' ? 0.95 : mode === 'crouch' ? 0.22 : 0.6) * rand(0.85, 1.1);
      const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = mode === 'crouch' ? 1800 : 12000;
      const pan = A.ctx.createStereoPanner(); SFX._foot = -(SFX._foot || 0.12); pan.pan.value = SFX._foot;
      const send = A.ctx.createGain(); send.gain.value = P.region === 'corredor' || P.region === 'subsolo' ? 0.35 : 0.18;
      src.connect(lp).connect(g).connect(pan).connect(A.master); g.connect(send).connect(A.verb); src.start(t);
      // roupa/equipamento: farfalhar curto
      if (mode !== 'crouch') burst({ f: 2600, q: 0.7, peak: mode === 'run' ? 0.05 : 0.02, a: 0.01, d: 0.12 });
      return;
    }
    const pk = mode === 'run' ? 0.5 : mode === 'crouch' ? 0.08 : 0.22; burst({ f: wet ? 900 : 260, q: wet ? 2 : 1.2, peak: pk, d: wet ? 0.18 : 0.09, rate: rand(.8, 1.2) }); if (!wet) burst({ f: 3000, type: 'highpass', peak: pk * 0.15, d: 0.03 });
  },
  cStep(chase) {
    if (A.steps && A.steps.flesh && A.steps.flesh.length) { const src = A.ctx.createBufferSource(); src.buffer = pick(A.steps.flesh); src.playbackRate.value = rand(0.8, 0.95) * (chase ? 1.15 : 1); const g = A.ctx.createGain(); g.gain.value = chase ? 1.2 : 0.75; src.connect(g).connect(A.cIn); src.start(); return; }
    burst({ f: chase ? 380 : 180, q: 1.5, peak: chase ? 0.9 : 0.5, d: chase ? 0.07 : 0.16, dest: A.cIn, rate: rand(.7, 1) }); if (chase) burst({ f: 4000, type: 'highpass', peak: 0.25, d: 0.02, dest: A.cIn }); },
  scream(len = 1.2) {
    { const d = AI.pos.distanceTo(P.pos); if (d < 22) addTrauma(0.5 * (1 - d / 22)); }
    if (!A.ctx) return; const t = A.ctx.currentTime;
    for (const det of [0, 7, -12]) { const o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(260 + det, t); o.frequency.exponentialRampToValueAtTime(820 + det * 3, t + 0.25); o.frequency.exponentialRampToValueAtTime(330, t + len);
      const v = A.ctx.createOscillator(); v.frequency.value = 9; const vg = A.ctx.createGain(); vg.gain.value = 40; v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + len);
      const bp = A.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 2; const g = A.ctx.createGain(); env(g, t, 0.05, 0.35, len); o.connect(bp).connect(g).connect(A.cIn); o.start(t); o.stop(t + len + 0.1); }
    burst({ f: 2200, q: 0.7, peak: 0.5, a: 0.04, d: len, dest: A.cIn });
  },
  click() { tone({ f: 2400, type: 'square', peak: 0.06, d: 0.02 }); burst({ f: 5000, type: 'highpass', peak: 0.12, d: 0.02 }); },
  pickup() { tone({ f: 1800, f2: 900, type: 'square', peak: 0.08, d: 0.05 }); burst({ f: 3000, q: 4, peak: 0.25, d: 0.12 }); },
  zap() { addTrauma(0.3); burst({ f: 2500, type: 'highpass', peak: 0.6, d: 0.35 }); tone({ f: 50, type: 'square', peak: 0.25, d: 0.6 }); setTimeout(() => tone({ f: 70, f2: 35, peak: 0.9, d: 0.5 }), 350); },
  clank(pos) { spatialOneShot(pos, p => { const f = rand(300, 1400); for (let i = 0; i < 3; i++) burst({ f: f * (1 + i * 0.37), q: 25, peak: rand(.3, .7), d: rand(.5, 1.4), dest: p }); burst({ f: 200, q: 1, peak: 0.4, d: 0.2, dest: p }); }); },
  heart(v) { tone({ f: 58, f2: 40, peak: 0.5 * v, d: 0.12 }); setTimeout(() => tone({ f: 52, f2: 38, peak: 0.35 * v, d: 0.14 }), 170); },
  gasp() { burst({ f: 1100, q: 1, peak: 0.45, a: 0.02, d: 0.5 }); },
  breathIn() { burst({ f: 900, q: 0.8, peak: 0.18, a: 0.25, d: 0.4 }); },
  door() { addTrauma(0.45); tone({ f: 40, type: 'sawtooth', peak: 0.3, a: 0.3, d: 3.5 }); burst({ f: 300, q: 3, peak: 0.3, a: 0.2, d: 3 }); },
  kick() { tone({ f: 70, f2: 30, peak: 0.55, d: 0.25, dest: A.chase }); },
  birds() { for (let i = 0; i < 8; i++) setTimeout(() => tone({ f: rand(2500, 4200), f2: rand(1800, 5000), peak: 0.08, d: rand(.06, .16) }), i * rand(150, 400)); },
  tick() { tone({ f: 3200, f2: 2600, peak: 0.08, d: 0.05, dest: A.cIn }); }
};

/* ---------------------------------------------------------------
   RUÍDO → IA
   --------------------------------------------------------------- */
function emitNoise(pos, radius, prio = 1) {
  P.noiseLevel = Math.max(P.noiseLevel, radius / 30);
  AI.hear(pos, radius, prio);
}

/* ---------------------------------------------------------------
   PATHFINDING A* na grade (8 direções, sem cortar quinas)
   --------------------------------------------------------------- */
function astar(sx, sz, tx, tz, avoidLight) {
  if (!inb(tx, tz) || blocked[idx(tx, tz)]) { const n = nearestFree(tx, tz); if (!n) return null; [tx, tz] = n; }
  const start = idx(sx, sz), goal = idx(tx, tz);
  const g = new Float32Array(W * H).fill(1e9), f = new Float32Array(W * H).fill(1e9), from = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
  const open = [start]; g[start] = 0; f[start] = Math.hypot(tx - sx, tz - sz);
  let it = 0;
  while (open.length && it++ < 4000) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi]; open.splice(bi, 1);
    if (cur === goal) { const path = []; let c = cur; while (c !== -1 && c !== start) { path.push(c); c = from[c]; } return path.reverse(); }
    closed[cur] = 1; const cx = cur % W, cz = (cur / W) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (!inb(nx, nz)) continue; const ni = idx(nx, nz);
      if (blocked[ni] || closed[ni]) continue;
      if (dx && dz && (blocked[idx(cx + dx, cz)] || blocked[idx(cx, cz + dz)])) continue;
      let cost = (dx && dz) ? 1.414 : 1; if (avoidLight) cost += lightGrid[ni] * 7;
      const ng = g[cur] + cost;
      if (ng < g[ni]) { g[ni] = ng; f[ni] = ng + Math.hypot(tx - nx, tz - nz); from[ni] = cur; if (!open.includes(ni)) open.push(ni); }
    }
  }
  return null;
}
function nearestFree(x, z) { for (let r = 1; r < 5; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, nz = z + dz; if (inb(nx, nz) && !blocked[idx(nx, nz)]) return [nx, nz]; } return null; }
const FREE_CELLS = []; for (let i = 0; i < W * H; i++) if (!blocked[i]) FREE_CELLS.push(i);

/* ---------------------------------------------------------------
   IA DA CRIATURA — máquina de estados
   --------------------------------------------------------------- */
const AI = {
  pos: center(9, 30), yaw: 0, state: 'patrol', t: 0, path: [], pathT: 0, target: null, speed: 0,
  suspicion: 0, lastKnown: null, lastSeenT: 99, canSee: false, burnAcc: 0, burns: 0, level: 1,
  slow: 1, pause: 0, searchPts: [], checkSpot: null, checkT: 0, seenEnter: null, grace: 25,
  stalkT: 0, phase: 0, lastStepPhase: 0, anim: { lean: 0.35, hipY: 1.25, arm: 0, burn: 0, jaw: 0.1 },
  noise: null, sinceNear: 0, awayUntil: 0, lastScream: 0, recoilTo: null, ignition: false,

  setState(s) { if (this.state === s) return; this.state = s; this.t = 0; this.path = []; this.pause = 0; if (s === 'chase') { if (performance.now() / 1000 - this.lastScream > 6) { SFX.scream(1.1); this.lastScream = performance.now() / 1000; } } },
  levelMul() { return CFG.creature.levelSpeed[this.level]; },
  goTo(v, avoid = true) { const [sx, sz] = cellOf(this.pos), [tx, tz] = cellOf(v); this.path = astar(sx, sz, tx, tz, avoid) || []; this.target = v.clone(); },
  hear(pos, radius, prio) {
    if (this.grace > 0 || this.state === 'recoil' || P.dead) return;
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    const walls = wallsBetween(this.pos.x, this.pos.z, pos.x, pos.z, 4);
    const eff = radius * CFG.creature.levelHear[this.level] * Math.pow(0.6, walls);
    if (d > eff) return;
    if (this.state === 'chase') return;
    this.lastKnown = pos.clone();
    if (prio >= 3) { this.setState('hunt'); this.goTo(pos, false); this.searchPts = []; return; }
    if (prio >= 2 || this.state === 'investigate' || this.state === 'hunt' || this.state === 'search') { this.setState('hunt'); this.goTo(pos); this.searchPts = []; return; }
    this.setState('investigate'); this.goTo(pos);
  },
  headPos(out) { return C.head.getWorldPosition(out); },

  perceive(dt) {
    this.canSee = false;
    if (this.grace > 0 || P.hidden || P.dead || this.state === 'recoil') return;
    const eye = camera.position, hp = this.headPos(_v1);
    const dx = eye.x - hp.x, dz = eye.z - hp.z, d = Math.hypot(dx, dz);
    const lp = lightAt(P.pos);
    let range = fl.on && fl.battery > 0 ? 25 : (P.crouch ? 4.5 : 9);
    range = Math.max(range, 6 + 14 * lp);
    if (lp < 0.3 && !(fl.on && fl.battery > 0)) range *= 1.0; // no escuro ele vê, mas você é só silhueta
    if (d > range) return;
    const fwdX = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    const dot = (dx * fwdX + dz * fwdZ) / (d || 1);
    const close = d < 3.5 && (this.state === 'chase' || this.state === 'hunt');
    if (!close && dot < Math.cos(CFG.creature.fov)) return;
    if (!los(hp, eye)) return;
    this.canSee = true;
    const rate = d < 6 ? 140 : lerp(90, 25, (d - 6) / 19);
    this.suspicion = Math.min(100, this.suspicion + rate * dt);
  },

  update(dt) {
    if (this.grace > 0) this.grace -= dt;
    this.t += dt; this.lastSeenT += dt;
    this.perceive(dt);
    const pd = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    if (this.canSee) { this.lastKnown = P.pos.clone(); this.lastSeenT = 0; }
    else this.suspicion = Math.max(0, this.suspicion - 8 * dt);
    if (pd < 15) this.sinceNear = 0; else this.sinceNear += dt;

    // transições por visão
    if (this.canSee && this.state !== 'chase' && this.state !== 'recoil') {
      if (this.suspicion >= 100 || pd < 5 || (this.suspicion >= 70 && this.state !== 'patrol')) this.setState('chase');
      else if (this.suspicion >= 30 && (this.state === 'patrol')) { this.setState('investigate'); this.goTo(P.pos); }
    }
    if (this.ignition && this.state !== 'recoil' && this.state !== 'chase') this.setState('chase');

    const sp = CFG.creature; let speed = 0; const lvl = this.levelMul();
    switch (this.state) {
      case 'patrol': {
        speed = sp.patrol;
        if (this.pause > 0) { this.pause -= dt; speed = 0; break; }
        if (!this.path.length) {
          // diretor de tensão: muito tempo longe → dica da região do jogador
          if (this.sinceNear > 110 && !P.hidden && P.region !== 'recepcao') { this.sinceNear = 0; const t = randomCellNear(P.pos, 9); if (t) { this.setState('investigate'); this.goTo(t); break; } }
          this.goTo(choosePatrol()); this.pause = rand(0.8, 3);
        }
        break;
      }
      case 'investigate': {
        speed = sp.investigate;
        if (!this.path.length) { speed = 0; this.pause += dt; if (this.pause > 3.2) { this.pause = 0; this.setState('patrol'); } }
        if (this.t > sp.investigateTime) this.setState('patrol');
        break;
      }
      case 'hunt':
      case 'search': {
        speed = this.state === 'hunt' ? sp.hunt : sp.hunt * 0.9;
        if (this.checkSpot) {
          if (!this.path.length) {
            speed = 0; this.checkT += dt; animOpenSpot(this.checkSpot, this.checkT);
            if (this.checkT > 1.6 && P.hidden === this.checkSpot && !P.holdBreath) { killPlayer('pull'); return; }
            if (this.checkT > 3.4) { closeSpot(this.checkSpot); this.checkSpot = null; }
          }
          break;
        }
        if (!this.path.length) {
          if (this.pause > 0) { this.pause -= dt; speed = 0; break; }
          if (!this.searchPts.length && this.lastKnown && this.t < 2) this.searchPts = buildSearch(this.lastKnown);
          const nxt = this.searchPts.shift();
          if (nxt === 'spot') {
            const s = nearestSpot(this.lastKnown || this.pos, 9);
            if (s) { this.checkSpot = s; this.checkT = 0; const out = spotFront(s); this.goTo(out); }
          } else if (nxt) { this.goTo(nxt); this.pause = rand(0.6, 1.8); }
          else { this.pause = 1.5; this.searchPts = buildSearch(this.lastKnown || this.pos); }
        }
        if (this.t > sp.searchTime + this.level * 5 && !this.checkSpot) { this.setState('patrol'); this.awayUntil = performance.now() / 1000 + 40; }
        break;
      }
      case 'chase': {
        speed = sp.chase;
        // se o jogador se escondeu na frente dele, vai até o esconderijo
        if (P.hidden) {
          if (this.seenEnter === P.hidden) {
            if (!this.checkSpot) { this.checkSpot = P.hidden; this.goTo(spotFront(P.hidden), false); }
            if (!this.path.length) { killPlayer('pull'); return; }
          } else { this.setState('search'); this.searchPts = buildSearch(this.lastKnown || P.pos); }
          break;
        }
        const intuition = this.lastSeenT < sp.intuition || this.ignition;
        if (intuition) this.lastKnown = P.pos.clone();
        this.pathT -= dt;
        if (this.pathT <= 0) {
          this.pathT = 0.3; this.goTo(this.lastKnown || P.pos, false);
          // não entra em luz forte (exceto na ignição): para na borda
          if (!this.ignition) {
            const cut = this.path.findIndex(i => lightGrid[i] > 0.72);
            if (cut >= 0) { this.path.length = cut; this.stalking = true; } else this.stalking = false;
          }
        }
        if (this.stalking && !this.path.length) {
          speed = 0; this.stalkT += dt;
          if (this.stalkT > 2 && Math.random() < dt * 0.3) SFX.scream(0.8);
          if (this.stalkT > 7) { this.stalkT = 0; this.stalking = false; this.setState('search'); this.searchPts = buildSearch(this.pos); }
        } else this.stalkT = 0;
        if (this.lastSeenT > sp.lostTime && !this.ignition && !this.stalking) { this.setState('search'); this.searchPts = buildSearch(this.lastKnown || this.pos); }
        break;
      }
      case 'recoil': {
        speed = sp.recoil;
        if (!this.path.length && this.t < 0.3) {
          const dst = fleeTarget(); this.goTo(dst, false);
        }
        if (this.t > (this.ignition ? 3.5 : sp.recoilTime)) { this.lastKnown = P.pos.clone(); this.setState(this.ignition ? 'chase' : 'search'); this.searchPts = buildSearch(this.lastKnown); }
        break;
      }
    }
    // modificadores de velocidade: escuro, luz, feixe no corpo, nível
    const L = lightAt(this.pos);
    let lightMul = L < 0.3 ? sp.darkMul : L > 0.7 ? (this.ignition ? 0.85 : sp.lightMul) : lerp(sp.darkMul, sp.lightMul, (L - 0.3) / 0.4);
    if (this.state === 'recoil') lightMul = 1;
    speed *= lightMul * lvl * this.slow;
    this.speed = lerp(this.speed, speed, Math.min(1, dt * 5));
    this.move(dt);

    // contato = morte
    if (!P.hidden && !P.dead && this.state !== 'recoil' && this.grace <= 0 && pd < CFG.creature.killDist) killPlayer('grab');
  },
  move(dt) {
    let tgt = null;
    if (this.path.length) { const i = this.path[0]; tgt = center(i % W, (i / W) | 0); if (this.path.length === 1 && this.target && this.state === 'chase') tgt = this.target; }
    if (tgt) {
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.25) this.path.shift();
      else {
        const step = Math.min(d, this.speed * dt); this.pos.x += dx / d * step; this.pos.z += dz / d * step;
        const want = Math.atan2(dx, dz); this.yaw = angLerp(this.yaw, want, Math.min(1, dt * 7));
      }
    } else if (this.state === 'chase' || this.state === 'hunt') {
      const want = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z); if (this.canSee || this.stalking) this.yaw = angLerp(this.yaw, want, Math.min(1, dt * 5));
    }
  }
};
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
function angLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function randomCellNear(v, r) {
  for (let k = 0; k < 30; k++) { const x = Math.floor((v.x + rand(-r, r)) / CS), z = Math.floor((v.z + rand(-r, r)) / CS); if (inb(x, z) && !blocked[idx(x, z)] && regionAt(x, z) !== 'rua') return center(x, z); }
  return null;
}
function choosePatrol() {
  const now = performance.now() / 1000; let best = null, bs = -1e9;
  for (let k = 0; k < 14; k++) {
    const i = pick(FREE_CELLS), x = i % W, z = (i / W) | 0, rg = regionAt(x, z);
    if (rg === 'rua' || rg === 'recepcao' || blocked[i]) continue;
    const c = center(x, z), dp = Math.hypot(c.x - P.pos.x, c.z - P.pos.z), da = Math.hypot(c.x - AI.pos.x, c.z - AI.pos.z);
    let s = (1 - lightGrid[i]) * 2 + Math.random() * 1.5 + Math.min(da, 30) / 30;
    if (AI.level >= 2) s += (1 - Math.min(dp, 40) / 40) * (AI.level - 1) * 0.9;
    if (now < AI.awayUntil) s += Math.min(dp, 40) / 20;
    if (rg === 'corredor') s += 0.6;
    if (s > bs) { bs = s; best = c; }
  }
  return best || center(5, 14);
}
function buildSearch(v) { const pts = []; const n = 3 + ((Math.random() * 3) | 0); for (let i = 0; i < n; i++) { const c = randomCellNear(v, 10); if (c) pts.push(c); if (i === 1) pts.push('spot'); } return pts; }
function nearestSpot(v, r) { let best = null, bd = r; for (const s of hideSpots) { const c = center(s.x, s.z); const d = Math.hypot(c.x - v.x, c.z - v.z) + wallsBetween(c.x, c.z, v.x, v.z, 2) * 10; if (d < bd && Math.random() < 0.85) { bd = d; best = s; } } return best; }
function spotFront(s) { const c = center(s.x, s.z); const fx = s.x + Math.round(s.face.x), fz = s.z + Math.round(s.face.z); if (inb(fx, fz) && !blocked[idx(fx, fz)]) return center(fx, fz); const n = nearestFree(s.x, s.z); return n ? center(n[0], n[1]) : c; }
function fleeTarget() {
  let best = null, bs = -1e9;
  for (let k = 0; k < 40; k++) {
    const c = randomCellNear(AI.pos, 15); if (!c) continue; const i = idx(...cellOf(c));
    const dp = Math.hypot(c.x - P.pos.x, c.z - P.pos.z); const s = dp - lightGrid[i] * 10 + (wallsBetween(c.x, c.z, P.pos.x, P.pos.z, 2) ? 6 : 0);
    if (s > bs) { bs = s; best = c; }
  }
  return best || center(5, 14);
}
function animOpenSpot(s, t) { if (s.type === 'locker' && s.door) { s.door.rotation.y = -Math.min(1.4, t * 1.2); s.door.position.x = -Math.sin(Math.min(1.4, t * 1.2)) * 0.45; } }
function closeSpot(s) { if (s.type === 'locker' && s.door) { s.door.rotation.y = 0; s.door.position.x = 0; } }

/* ---------------------------------------------------------------
   ANIMAÇÃO PROCEDURAL DA CRIATURA
   --------------------------------------------------------------- */
function animateCreature(dt, time) {
  const st = AI.state, a = AI.anim;
  const chase = st === 'chase' && AI.speed > 2.5, recoil = st === 'recoil';
  const burning = AI.burnAcc > 0.05 || (recoil && AI.t < 0.9);
  const tLean = chase ? 1.12 : recoil ? 0.9 : st === 'patrol' ? 0.38 : 0.55;
  const tHip = chase ? 0.92 : recoil ? 1.0 : 1.22;
  a.lean = lerp(a.lean, tLean, dt * 4); a.hipY = lerp(a.hipY, tHip, dt * 4);
  a.burn = lerp(a.burn, burning ? 1 : 0, dt * 8);
  const spd = AI.speed; AI.phase += dt * (chase ? spd * 2.1 : spd * 3.2);
  const ph = AI.phase, sw = Math.min(1, spd / 1.5);
  C.root.position.set(AI.pos.x, 0, AI.pos.z); C.root.rotation.y = AI.yaw;
  C.hips.position.y = a.hipY + Math.abs(Math.sin(ph)) * 0.05 * sw;
  C.spine.rotation.x = a.lean + Math.sin(ph * 2) * 0.04 * sw;
  C.spine.rotation.z = Math.sin(ph) * 0.06 * sw;
  // cabeça: compensa a inclinação para olhar à frente; tremores; vira para ouvir
  const look = (st === 'investigate' || st === 'search' || st === 'hunt') && spd < 0.5 ? Math.sin(time * 1.4) * 1.1 : 0;
  C.neck.rotation.x = -a.lean * 0.75 - a.burn * 0.6;
  C.head.rotation.y = look + (Math.random() - 0.5) * 0.04;
  C.head.rotation.z = 0.32 * (st === 'patrol' ? 1 : 0.3) + Math.sin(time * 0.7) * 0.08 + (Math.random() - .5) * 0.03 + a.burn * Math.sin(time * 40) * 0.12;
  C.head.rotation.x = a.burn * -0.3;
  a.jaw = lerp(a.jaw, (chase ? 0.55 : 0.12) + a.burn * 0.6 + (AI.stalking ? 0.5 : 0), dt * 6);
  C.jaw.rotation.x = a.jaw;
  // pernas
  C.legs.forEach((l, i) => { const p = ph + (i ? Math.PI : 0); l.th.rotation.x = Math.sin(p) * (chase ? 0.85 : 0.45) * sw - (chase ? 0.4 : 0); l.knee.rotation.x = Math.max(0, -Math.sin(p)) * (chase ? 1.4 : 0.8) * sw + (chase ? 0.5 : 0.05); });
  // braços: pendurados / galope / cobrindo o rosto
  C.arms.forEach((ar, i) => {
    const p = ph + (i ? 0 : Math.PI);
    let sx = chase ? -(a.lean + 0.25) + Math.sin(p) * 0.75 : Math.sin(p) * 0.25 * sw + 0.05;
    let el = chase ? -0.15 + Math.max(0, Math.sin(p)) * -0.5 : -0.12;
    sx = lerp(sx, -a.lean - 2.5, a.burn); el = lerp(el, -1.9, a.burn);
    ar.sh.rotation.x = sx; ar.sh.rotation.z = ar.s * (0.12 + a.burn * 0.35); ar.el.rotation.x = el;
  });
  C.straps.forEach((s, i) => { s.rotation.x = Math.sin(time * 2 + i) * 0.15 - AI.anim.lean * 0.3; });
  // passos audíveis
  const stepPh = Math.floor(ph / Math.PI);
  if (stepPh !== AI.lastStepPhase && spd > 0.3) { AI.lastStepPhase = stepPh; SFX.cStep(chase); }
}

/* ---------------------------------------------------------------
   INPUT
   --------------------------------------------------------------- */
addEventListener('keydown', e => {
  if (e.code === 'Tab') { e.preventDefault(); if (playing) showMap(true); }
  if (e.repeat) return;
  keys[e.code] = true;
  if (!playing || paused || P.dead) return;
  if (e.code === 'Escape' && document.pointerLockElement !== canvas) { pauseGame(); return; }
  if (e.code === 'KeyF' && !P.hidden) { fl.on = !fl.on; SFX.click(); TORCH.clickT = 0.16; }
  if (e.code === 'KeyC' || e.code === 'ControlLeft') P.crouch = !P.crouch;
  if (e.code === 'KeyV') msg(cycleShake(), 1.5);
  if (e.code === 'KeyE') { eHeld = true; pressInteract(); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE') { eHeld = false; installT = 0; } if (e.code === 'Tab') showMap(false); });
addEventListener('mousedown', e => { if (e.button === 2) mouseFocus = true; });
addEventListener('mouseup', e => { if (e.button === 2) mouseFocus = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  const locked = document.pointerLockElement === canvas;
  if (!playing || paused || P.dead || (!locked && !(noLock && (e.buttons & 1)))) return;
  const sens = 0.0022 * OPT.sens / 100; P.yaw -= e.movementX * sens; P.pitch = clamp(P.pitch - e.movementY * sens, -1.35, 1.35);
  if (P.hidden) { const base = Math.atan2(-P.hidden.face.x, -P.hidden.face.z); let d = P.yaw - base; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; P.yaw = base + clamp(d, -0.6, 0.6); P.pitch = clamp(P.pitch, -0.4, 0.3); }
});
let noLock = false, hadLock = false;
function lock() {
  if (noLock) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(lockFail); } catch (e) { lockFail(); }
}
function lockFail() { if (noLock) return; noLock = true; msg('Captura do mouse indisponível aqui: segure o botão esquerdo e arraste para olhar.', 7); }
document.addEventListener('pointerlockerror', lockFail);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas; if (locked) hadLock = true;
  if (!locked && hadLock && playing && !P.dead && !P.won && !paused) pauseGame();
});
canvas.addEventListener('click', () => { if (playing && !paused && document.pointerLockElement !== canvas) lock(); });
$('retry').onclick = () => { $('dead').style.display = 'none'; respawn(); lock(); };
$('again').onclick = () => location.reload();

/* =====================================================================
   FRONT-END: tela inicial, menu principal, opções, intro cinematográfica
   ===================================================================== */
let MODE = 'splash';           // splash | menu | intro | game
function loadJ(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function saveJ(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
const OPT = Object.assign({ vol: 80, sens: 100, bright: 100, shake: 0, subs: true, narr: true }, loadJ('formol_opts') || {});
function applyOpts() {
  CAM.li = OPT.shake; CAM.level = SHAKE_LEVELS[OPT.shake][0];
  if (A.master) A.master.gain.setTargetAtTime(OPT.vol / 100 * 0.9, A.ctx.currentTime, 0.05);
  $('o_vol').value = OPT.vol; $('o_sens').value = OPT.sens; $('o_bright').value = OPT.bright;
  $('o_shake').textContent = SHAKE_LEVELS[OPT.shake][1]; $('o_subs').textContent = OPT.subs ? 'LIGADAS' : 'DESLIGADAS'; $('o_narr').textContent = OPT.narr ? 'LIGADA' : 'DESLIGADA';
  saveJ('formol_opts', OPT);
}
$('o_vol').oninput = e => { OPT.vol = +e.target.value; applyOpts(); };
$('o_sens').oninput = e => { OPT.sens = +e.target.value; applyOpts(); };
$('o_bright').oninput = e => { OPT.bright = +e.target.value; applyOpts(); };
$('o_shake').onclick = () => { OPT.shake = (OPT.shake + 1) % SHAKE_LEVELS.length; applyOpts(); uiSfx('sel'); };
$('o_subs').onclick = () => { OPT.subs = !OPT.subs; applyOpts(); uiSfx('sel'); };
$('o_narr').onclick = () => { OPT.narr = !OPT.narr; applyOpts(); uiSfx('sel'); };

/* ---------- narrador: falas gravadas (ElevenLabs, voz masculina) embutidas como MP3 ---------- */
const sleep = ms => new Promise(r => { const t0 = performance.now(); const iv = setInterval(() => { if (CINE.skip || performance.now() - t0 >= ms) { clearInterval(iv); r(); } }, 30); });
let narrSrc = null;
function say(text, idx) {
  return new Promise(res => {
    let done = false; const buf = A.narr && A.narr[idx];
    const est = buf ? buf.duration * 1000 + 150 : (1.0 + text.length * 0.072) * 1000;
    const fin = () => { if (done) return; done = true; clearInterval(iv); if (narrSrc) { try { narrSrc.stop(); } catch (e) { } narrSrc = null; } if (A.ambG) A.ambG.gain.setTargetAtTime(0.22, A.ctx.currentTime, 0.6); res(); };
    const iv = setInterval(() => { if (CINE.skip) fin(); }, 30);
    $('subs').textContent = text; $('subs').style.opacity = OPT.subs ? 1 : 0;
    if (OPT.narr && buf && A.ctx) {
      const src = A.ctx.createBufferSource(); src.buffer = buf;
      const g = A.ctx.createGain(); g.gain.value = 1.15;
      const warm = A.ctx.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 180; warm.gain.value = 3;
      const send = A.ctx.createGain(); send.gain.value = 0.12;
      src.connect(warm).connect(g).connect(A.master); g.connect(send).connect(A.verb);
      src.onended = fin; src.start(); narrSrc = src;
      if (A.ambG) A.ambG.gain.setTargetAtTime(0.07, A.ctx.currentTime, 0.3);
    }
    setTimeout(fin, est + (buf ? 400 : 0));
  });
}
async function decodeAssets() {
  if (!A.ctx || A.assetsLoaded) return; A.assetsLoaded = true;
  const dec = async b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return await A.ctx.decodeAudioData(u.buffer); };
  const ASSETS = window.FORMOL_AUDIO || {};
  A.narr = []; A.steps = {};
  const keys = Object.keys(ASSETS), bufs = await Promise.all(keys.map(k => dec(ASSETS[k]).catch(e => { console.warn('audio', k, e); return null; })));
  for (let ki = 0; ki < keys.length; ki++) {
    const k = keys[ki];
    try {
      const buf = bufs[ki]; if (!buf) continue;
      const m = k.match(/^narr(\d+)$/); if (m) { A.narr[+m[1]] = buf; continue; }
      const st = k.match(/^step_(\w+?)_\d+$/); if (st) { (A.steps[st[1]] = A.steps[st[1]] || []).push(buf); continue; }
      A[k] = buf;
    } catch (e) { console.warn('audio', k, e); }
  }
}

/* ---------- sons de interface e trilha do menu ---------- */
function uiSfx(k) {
  if (!A.ctx) return;
  if (k === 'hover') { tone({ f: 1800, f2: 1400, type: 'sine', peak: 0.025, d: 0.05 }); burst({ f: 6000, type: 'highpass', peak: 0.03, d: 0.03 }); }
  if (k === 'sel') { tone({ f: 90, f2: 45, peak: 0.35, d: 0.35 }); burst({ f: 500, q: 0.8, peak: 0.12, a: 0.01, d: 0.4 }); }
  if (k === 'start') { tone({ f: 55, f2: 28, peak: 0.6, d: 1.6 }); burst({ f: 180, q: 0.6, peak: 0.3, a: 0.05, d: 1.8 }); burst({ f: 3000, q: 8, peak: 0.08, a: 0.2, d: 2.5 }); }
}
const MUSIC = { on: false, next: 0 };
function menuMusic(dt) {
  if (!A.ctx || !MUSIC.on) return;
  MUSIC.next -= dt; if (MUSIC.next > 0) return;
  MUSIC.next = rand(1.6, 4.2);
  const scale = [110, 130.8, 146.8, 155.6, 174.6, 196, 207.7, 220, 261.6, 311.1];
  const play = (f, pk, d) => { const t = A.ctx.currentTime, o = A.ctx.createOscillator(), o2 = A.ctx.createOscillator(), g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter(); o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.003; lp.type = 'lowpass'; lp.frequency.value = 1800; env(g, t, 0.01, pk, d); o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(A.master); g.connect(A.verb); o.start(t); o2.start(t); o.stop(t + d + 0.1); o2.stop(t + d + 0.1); };
  play(pick(scale) * (Math.random() < 0.3 ? 2 : 1), 0.05, rand(3, 5));
  if (Math.random() < 0.3) setTimeout(() => play(pick(scale) * 2, 0.03, 4), rand(200, 600));
}
function rainStart() { if (!A.ctx || A.rainG) return; const s = loopNoise(A.noise), hp = A.ctx.createBiquadFilter(), bp = A.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; bp.type = 'lowpass'; bp.frequency.value = 5000; A.rainG = A.ctx.createGain(); A.rainG.gain.value = 0; s.connect(hp).connect(bp).connect(A.rainG).connect(A.master); A.rainG.gain.setTargetAtTime(0.11, A.ctx.currentTime, 1.5); }
function rainStop() { if (A.rainG) A.rainG.gain.setTargetAtTime(0, A.ctx.currentTime, 2); }
function thunder() { if (!A.ctx) return; burst({ f: 90, type: 'lowpass', q: 0.5, peak: 0.9, a: 0.08, d: 4 }); setTimeout(() => burst({ f: 220, type: 'lowpass', q: 0.5, peak: 0.5, a: 0.02, d: 2.5 }), 250); }
function boom() { if (!A.ctx) return; tone({ f: 48, f2: 26, peak: 1, d: 1.4 }); burst({ f: 160, type: 'lowpass', peak: 0.9, a: 0.005, d: 1.2 }); burst({ f: 1200, q: 6, peak: 0.25, d: 1.8 }); addTrauma(0.6); }
function updateListenerOnly() {
  if (!A.ctx) return; const l = A.ctx.listener, f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  if (l.positionX) { l.positionX.value = camera.position.x; l.positionY.value = camera.position.y; l.positionZ.value = camera.position.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
  const hp = AI.headPos(_v1); A.cPan.positionX.value = hp.x; A.cPan.positionY.value = hp.y; A.cPan.positionZ.value = hp.z;
  A.growlG.gain.setTargetAtTime(MODE === 'intro' ? 0.3 : 0.12, A.ctx.currentTime, 0.3); A.dragG.gain.setTargetAtTime(Math.min(1, AI.speed / 3) * 0.12, A.ctx.currentTime, 0.2);
}

/* ---------- navegação de menus (mouse + teclado) ---------- */
function bindList(ul, onAct) {
  const items = () => [...ul.querySelectorAll('li')].filter(li => !li.classList.contains('dis'));
  const setSel = li => { ul.querySelectorAll('li').forEach(x => x.classList.toggle('sel', x === li)); };
  ul.querySelectorAll('li').forEach(li => {
    li.addEventListener('mouseenter', () => { if (li.classList.contains('dis') || li.classList.contains('sel')) return; setSel(li); uiSfx('hover'); });
    li.addEventListener('click', () => { if (!li.classList.contains('dis')) { uiSfx('sel'); onAct(li.dataset.act); } });
  });
  return {
    move(d) { const it = items(); let i = it.findIndex(x => x.classList.contains('sel')); i = (i + d + it.length) % it.length; setSel(it[i]); uiSfx('hover'); },
    enter() { const li = ul.querySelector('li.sel'); if (li) { uiSfx('sel'); onAct(li.dataset.act); } },
    first() { setSel(items()[0]); }
  };
}
let openPanel = null;
function showPanel(id) { ['p_opts', 'p_ctrls', 'p_credits'].forEach(p => $(p).style.display = 'none'); openPanel = id; $('menu').style.zIndex = MODE === 'game' ? 27 : ''; if (id) { $(id).style.display = 'block'; if (MODE === 'game') { $('menu').style.display = 'block'; $('menu').querySelector('.side').style.visibility = 'hidden'; $('menu').querySelector('.foot').style.visibility = 'hidden'; $('menu').style.background = 'none'; } } else if (MODE === 'game') $('menu').style.display = 'none'; }
const mainNav = bindList($('mainItems'), act => {
  if (act === 'new') newGame();
  if (act === 'cont') continueGame();
  if (act === 'opts') showPanel('p_opts');
  if (act === 'ctrls') showPanel('p_ctrls');
  if (act === 'credits') showPanel('p_credits');
});
const pauseNav = bindList($('pauseItems'), act => {
  if (act === 'resume') resumeGame();
  if (act === 'opts') showPanel('p_opts');
  if (act === 'ctrls') showPanel('p_ctrls');
  if (act === 'quit') { saveJ('formol_save', P.installedIds && P.installedIds.length ? { ids: P.installedIds } : loadJ('formol_save')); location.reload(); }
});
function refreshContinue() {
  const sv = loadJ('formol_save'), li = $('contItem');
  if (sv && sv.ids && sv.ids.length) { li.classList.remove('dis'); $('contInfo').textContent = `${sv.ids.length}/5 FUSÍVEIS INSTALADOS`; }
  else { li.classList.add('dis'); $('contInfo').textContent = 'NENHUM PROGRESSO SALVO'; }
}
function enterMenu() {
  if (MODE !== 'splash') return; MODE = 'menu';
  audioInit(); decodeAssets(); applyOpts(); MUSIC.on = true; MUSIC.next = 0.5;
  $('splash').style.display = 'none'; $('menu').style.display = 'block'; refreshContinue(); mainNav.first(); uiSfx('start');
}
$('splash').addEventListener('click', enterMenu);
function resumeGame() { document.body.classList.remove('paused'); paused = false; $('pause').style.display = 'none'; showPanel(null); lock(); A.ctx && A.ctx.resume(); }
let pausedAt = 0;
function pauseGame() { pausedAt = performance.now(); paused = true; document.body.classList.add('paused'); $('pause').style.display = 'block'; pauseNav.first();  }
addEventListener('keydown', e => {
  if (MODE === 'splash') { if (e.code !== 'Tab') enterMenu(); return; }
  if (MODE === 'intro') { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { CINE.holding = true; $('skip').style.opacity = 0.9; } return; }
  const nav = MODE === 'menu' ? mainNav : (paused && $('pause').style.display === 'block') ? pauseNav : null;
  if (!nav) return;
  if (openPanel) { if (e.code === 'Escape' || e.code === 'Backspace') { showPanel(null); uiSfx('hover'); } return; }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') nav.move(1);
  if (e.code === 'ArrowUp' || e.code === 'KeyW') nav.move(-1);
  if (e.code === 'Enter' || e.code === 'Space') nav.enter();
  if (e.code === 'Escape' && MODE === 'game' && paused && performance.now() - pausedAt > 200) resumeGame();
});
addEventListener('keyup', e => { if (MODE === 'intro' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) CINE.holding = false; });

/* ---------- progresso salvo ---------- */
function applyProgress(ids) {
  for (const n of ids) {
    const f = FUSES.find(x => x.n === n); if (!f || !f.active) continue;
    f.active = false; f.mesh.visible = false; P.installed++; P.installedIds.push(n);
    const sk = panel.sockets[P.installed - 1].material; sk.color.set(0x0a3a12); sk.emissive.set(0x40ff70); sk.emissiveIntensity = 2.2; panel.fuses[P.installed - 1].visible = true;
    LIGHTS.filter(l => l.sector === SECTOR_ORDER[P.installed - 1]).forEach(l => { l.on = true; });
  }
  computeLightGrid(); AI.level = P.installed >= 3 ? 3 : P.installed >= 1 ? 2 : 1;
  checkpoint = { installed: P.installed, battery: 100 };
}

/* ---------- câmera cinematográfica ---------- */
const CINE = { shot: null, t: 0, skip: false, holding: false, hold: 0 };
function shot(s) { CINE.shot = s; CINE.t = 0; if (s.init) s.init(); }
function updateCine(dt, time) {
  const rdt = Math.min(0.25, (performance.now() - (CINE.lastT || performance.now())) / 1000); CINE.lastT = performance.now();
  if (CINE.holding) { CINE.hold += rdt; if (CINE.hold > 1.0 && !CINE.skip) { CINE.skip = true;  } } else CINE.hold = Math.max(0, CINE.hold - rdt * 2);
  $('skipRing').setAttribute('stroke-dashoffset', (56.5 * (1 - Math.min(1, CINE.hold))).toFixed(1));
  const s = CINE.shot; if (!s) return;
  CINE.t += dt; const k = clamp(CINE.t / s.dur, 0, 1), e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(s.from, s.to, e);
  camera.lookAt(_v2.lerpVectors(s.look, s.look2 || s.look, e));
  // câmera "na mão": respiração e micro-tremor
  camera.rotateX(Math.sin(time * 0.9) * 0.004 + Math.sin(time * 2.3) * 0.0015); camera.rotateY(Math.sin(time * 0.6) * 0.004); camera.rotateZ(Math.sin(time * 0.5) * 0.006);
  const sh = CAM.trauma * CAM.trauma; CAM.trauma = Math.max(0, CAM.trauma - dt * 0.8);
  camera.rotateX((Math.random() - 0.5) * 0.05 * sh); camera.rotateZ((Math.random() - 0.5) * 0.06 * sh);
  if (s.update) s.update(CINE.t, dt, time);
}
function setTorch(I, angle = CFG.flash.normalAngle, dist = CFG.flash.normalDist) { flash.intensity = I; flash.angle = angle; flash.distance = dist; }
function card(html, show = true) { $('cardTxt').innerHTML = html; $('card').style.opacity = show ? 1 : 0; }
async function typeCard(lines, speed = 55) {
  $('card').style.opacity = 1; const full = lines.join('\n'), t0 = performance.now(); let shown = 0;
  while (shown < full.length && !CINE.skip) {
    await sleep(25); const n = Math.min(full.length, Math.floor((performance.now() - t0) / speed));
    if (n > shown) { if (full[n - 1] !== ' ' && full[n - 1] !== '\n') tone({ f: rand(1800, 2400), type: 'square', peak: 0.012, d: 0.015 }); shown = n; $('cardTxt').textContent = full.slice(0, n); }
  }
}

/* ---------- a intro ---------- */
const INTRO_LINES = [
  'Novembro de mil novecentos e oitenta e sete. Três e doze da manhã.',
  'Me chamaram por causa de uma pane elétrica no Instituto São Lázaro.',
  'O velho sanatório que a prefeitura transformou em necrotério… e depois tentou esquecer.',
  'Ninguém me disse por que o vigia parou de atender o telefone.',
  'Nem o que o doutor Varela fazia com os pacientes… no escuro.',
  'Assim que eu entrei, a energia caiu. E a porta blindada se fechou atrás de mim.',
  'Cinco fusíveis. Era tudo o que eu precisava pra sair dali.',
  'Mas eu não estava sozinho.',
  'E aquilo… odiava a luz.'
];
async function runIntro() {
  MODE = 'intro'; MUSIC.on = false; CINE.skip = false; CINE.hold = 0; CINE.holding = false;
  $('menu').style.display = 'none'; $('cine').style.display = 'block'; $('subs').style.opacity = 0; card('', true);
  const recLights = LIGHTS.filter(l => l.sector === 'recepcao');
  const restore = () => { recLights.forEach(l => { l.on = true; }); exitDoor.mesh.position.y = CFG.wallH / 2; computeLightGrid(); };
  try {
    const chk = () => { if (CINE.skip) throw 'skip'; };
    rainStart(); await sleep(900); chk();
    setTimeout(thunder, 600);
    await Promise.all([typeCard(['INSTITUTO SÃO LÁZARO', 'NOVEMBRO DE 1987 · 03:12']), sleep(400).then(() => say(INTRO_LINES[0], 0))]); chk();
    await sleep(800); chk();
    // 1 — recepção, porta ainda aberta
    exitDoor.mesh.position.y = CFG.wallH / 2 + CFG.wallH - 0.4; AI.pos.set(10, 0, 62);
    shot({ from: V3(44, 1.55, 51), to: V3(42.5, 1.5, 44), look: V3(37, 1.6, 33), look2: V3(36, 1.45, 32), dur: 9, init: () => setTorch(0) });
    $('cine').classList.add('on'); card('', false); $('subs').style.opacity = 0;
    await sleep(1200); chk(); await say(INTRO_LINES[1], 1); chk(); rainStop(); await sleep(500); chk();
    // 2 — corredor vermelho
    shot({ from: V3(78, 1.6, 28), to: V3(62, 1.55, 28), look: V3(20, 1.5, 28), dur: 10, init: () => setTorch(0) });
    await sleep(600); chk(); await say(INTRO_LINES[2], 2); chk(); await sleep(600); chk();
    // 3 — necrotério, gavetas, lanterna
    shot({ from: V3(5, 1.45, 41), to: V3(22, 1.4, 40), look: V3(7, 1.5, 31), look2: V3(25, 1.4, 31), dur: 13, init: () => setTorch(55, 0.32, 18) });
    await sleep(500); chk(); await say(INTRO_LINES[3], 3); chk(); await sleep(400); chk(); await say(INTRO_LINES[4], 4); chk(); await sleep(500); chk();
    // 4 — a porta se fecha, a luz cai
    let slammed = false;
    shot({ from: V3(44, 1.6, 42), to: V3(44, 1.58, 44.5), look: V3(44, 1.7, 53), dur: 9, init: () => setTorch(0),
      update: t => { if (t > 2.2 && !slammed) { slammed = true; exitDoor.slam = true; } if (exitDoor.slam && exitDoor.mesh.position.y > CFG.wallH / 2) { exitDoor.mesh.position.y = Math.max(CFG.wallH / 2, exitDoor.mesh.position.y - 0.016 * 60 * 0.12 * 3); if (exitDoor.mesh.position.y <= CFG.wallH / 2) { exitDoor.slam = false; boom(); recLights.forEach(l => { l.flickT = 0.6; }); setTimeout(() => { recLights.forEach(l => { l.on = false; }); computeLightGrid(); }, 600); } } } });
    await sleep(700); chk(); await say(INTRO_LINES[5], 5); chk(); await sleep(1200); chk();
    // 5 — o painel vazio, só a lanterna
    shot({ from: V3(38.2, 1.5, 35.6), to: V3(37.4, 1.48, 34.1), look: V3(37, 1.4, 32.2), dur: 8, init: () => setTorch(70, 0.36, 16) });
    await sleep(400); chk(); await say(INTRO_LINES[6], 6); chk(); await sleep(700); chk();
    // 6 — ele, no fim do corredor
    let lit = false;
    shot({ from: V3(14, 1.55, 28), to: V3(17, 1.5, 28), look: V3(40, 1.6, 27.6), dur: 12,
      init: () => { setTorch(0); AI.pos.set(38, 0, 27.4); AI.yaw = -Math.PI / 2; AI.state = 'investigate'; AI.speed = 0; AI.burnAcc = 0; },
      update: (t, dt) => {
        if (!lit) { AI.speed = t > 3 ? 0.9 : 0; AI.pos.x -= AI.speed * dt; }
        if (lit) { flash.intensity = lerp(flash.intensity, 220, dt * 10); flash.angle = 0.2; flash.distance = 30; AI.burnAcc = t - CINE.litT < 1.1 ? 1 : 0; if (t - CINE.litT > 1.1) { AI.state = 'recoil'; AI.t = 1; AI.speed = 5; AI.pos.x += 5 * dt; AI.yaw = Math.PI / 2; } }
      } });
    await sleep(900); chk(); await say(INTRO_LINES[7], 7); chk(); await sleep(900); chk();
    const p8 = say(INTRO_LINES[8], 8); await sleep(1700); chk();
    lit = true; CINE.litT = CINE.t; SFX.click(); setTimeout(() => SFX.scream(1.6), 250); addTrauma(0.5); chk();
    await p8; chk(); await sleep(1700); chk();
    // título
    $('subs').style.opacity = 0; card('<div class="big">FORMOL</div>', true); boom(); await sleep(3600); chk();
  } catch (e) { /* pulado */ }
  
  rainStop(); restore(); setTorch(0);
  finishIntro();
}
function finishIntro() {
  CINE.shot = null; $('subs').style.opacity = 0; $('skip').style.opacity = 0; $('cine').classList.remove('on');
  card('', true); setTimeout(() => { $('cine').style.display = 'none'; }, 1700);
  startGame(); setTimeout(() => card('', false), 300);
}
function startGame() {
  MODE = 'game'; MUSIC.on = false; document.body.classList.add('ingame');
  AI.pos.copy(center(9, 30)); AI.state = 'patrol'; AI.path = []; AI.speed = 0; AI.burnAcc = 0; AI.grace = 25;
  P.pos.copy(START); P.yaw = 0; P.pitch = 0; fl.on = true;
  playing = true; stats.t0 = performance.now(); P.region = '';
  if (document.pointerLockElement !== canvas) { lock(); if (!noLock) msg('Clique na tela para controlar a câmera.', 4); }
  setTimeout(() => msg(P.installed ? `Checkpoint carregado: ${P.installed}/5 fusíveis no painel.` : 'A porta está travada. O painel precisa de 5 fusíveis.', 5), 1200);
}
function newGame() { saveJ('formol_save', null); uiSfx('start'); lock(); runIntro(); }
function continueGame() { const sv = loadJ('formol_save'); if (!sv) return; applyProgress(sv.ids || []); uiSfx('start'); lock(); $('menu').style.display = 'none'; $('fade').style.opacity = 1; setTimeout(() => { startGame(); $('fade').style.opacity = 0; }, 900); }
applyOpts();


/* ---------------------------------------------------------------
   INTERAÇÃO
   --------------------------------------------------------------- */
let focusItem = null;
function findInteract() {
  if (P.hidden) return { type: 'unhide' };
  let best = null, bd = 1e9;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  for (const it of interact) {
    if (!it.active) continue;
    const dx = it.pos.x - P.pos.x, dz = it.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    const maxD = it.type === 'hide' ? 2.4 : it.type === 'panel' ? 1.8 : 1.6;
    if (d > maxD) continue;
    const dot = (dx * fx + dz * fz) / (d || 1); if (dot < 0.45 && d > 0.6) continue;
    const sc = d - dot; if (sc < bd) { bd = sc; best = it; }
  }
  return best;
}
function promptFor(it) {
  if (!it) return '';
  switch (it.type) {
    case 'unhide': return '[E] sair    [SHIFT] prender a respiração';
    case 'fuse': return '[E] pegar fusível';
    case 'battery': return '[E] pegar bateria';
    case 'note': return '[E] ler bilhete';
    case 'hide': return it.spot.type === 'locker' ? '[E] entrar no armário' : '[E] esconder debaixo da maca';
    case 'panel':
      if (P.installed >= 5) return AI.ignition ? (exitDoor.opening ? 'A PORTA ESTÁ ABRINDO — CORRA' : 'IGNIÇÃO EM ANDAMENTO… SOBREVIVA') : '[E] puxar a alavanca de ignição';
      return P.carry.length ? `[segure E] instalar fusível (${P.carry.length} na mão)` : `Painel principal — ${P.installed}/5 fusíveis`;
  }
  return '';
}
function pressInteract() {
  const it = findInteract(); if (!it) return;
  if (it.type === 'unhide') return unhide();
  if (it.type === 'fuse') { it.active = false; it.mesh.visible = false; P.carry.push(it); SFX.pickup(); emitNoise(it.pos, CFG.noise.pickup, 2); msg(`Fusível ${it.n} — leve ao painel na recepção.`, 3); updateCarried(); silenceAmbience(1); }
  if (it.type === 'battery') { it.active = false; it.mesh.visible = false; fl.battery = Math.min(100, fl.battery + 35); SFX.pickup(); msg('+35% de bateria', 2); }
  if (it.type === 'note') { msg(it.text, 9); SFX.click(); }
  if (it.type === 'hide') hide(it.spot);
  if (it.type === 'panel' && P.installed >= 5 && !AI.ignition) startIgnition();
}
function updateCarried() {
  while (carried.children.length) carried.remove(carried.children[0]);
  P.carry.forEach((f, i) => { const m = f.mesh.clone(); m.children.forEach(c => { if (c.isSprite) c.visible = false; }); m.position.set(i * 0.05, i * 0.02, 0); m.rotation.set(0.3, 0.6, 0); m.scale.setScalar(0.8); carried.add(m); m.visible = true; m.traverse(o => { o.castShadow = false; }); });
}
function hide(s) {
  P.hidden = s; P.hideT = 0; P.prevPos = P.pos.clone(); fl.wasOn = fl.on; fl.on = false;
  P.yaw = Math.atan2(-s.face.x, -s.face.z); P.pitch = 0;
  // ele te viu entrar?
  AI.seenEnter = (AI.state === 'chase' && AI.lastSeenT < 0.6) ? s : null;
  emitNoise(s.pos, CFG.noise.hide, 1); SFX.click();
  $('hide').className = 'ov' + (s.type === 'bed' ? ' bed' : ''); $('hide').style.opacity = 1; spotVisual(s, true);
}
function unhide() {
  const s = P.hidden; P.hidden = null; P.holdBreath = false; $('hide').style.opacity = 0; spotVisual(s, false);
  P.pos.copy(spotFront(s)); fl.on = fl.wasOn; emitNoise(P.pos, CFG.noise.hide, 1); SFX.click();
}

/* ---------------------------------------------------------------
   FUSÍVEIS, PAINEL, IGNIÇÃO, CHECKPOINT
   --------------------------------------------------------------- */
function installOne() {
  const f = P.carry.shift(); P.installed++; updateCarried(); P.installedIds.push(f.n); saveJ('formol_save', { ids: P.installedIds });
  { const sk = panel.sockets[P.installed - 1].material; sk.color.set(0x0a3a12); sk.emissive.set(0x40ff70); sk.emissiveIntensity = 2.2; panel.fuses[P.installed - 1].visible = true; panel.spark(P.installed - 1); }
  SFX.zap(); emitNoise(panel.pos, CFG.noise.install, 3);
  const sector = SECTOR_ORDER[P.installed - 1];
  setTimeout(() => { LIGHTS.filter(l => l.sector === sector).forEach(l => { l.on = true; l.flickT = 1.2; }); computeLightGrid(); msg(`Energia restaurada: ${REGION_NAME[sector]}`, 3); }, 700);
  AI.level = P.installed >= 3 ? 3 : 2;
  setTimeout(() => SFX.scream(1.4), 1500);
  checkpoint = { installed: P.installed, battery: Math.max(fl.battery, 40) };
  if (P.installed >= 5) msg('5/5. Puxe a alavanca de ignição. Ele vai ouvir.', 5);
}
function startIgnition() {
  AI.ignition = true; AI.level = 4; AI.ignT = 0; AI.grace = 0;
  panel.setLever(true); SFX.zap(); panel.spark(2);
  AI.lastKnown = P.pos.clone(); AI.setState('chase');
  A.sirenG && A.sirenG.gain.setTargetAtTime(0.06, A.ctx.currentTime, 0.5);
  exitDoor.sign.material.emissive.set(0x20ff60); exitDoor.sign.material.emissiveIntensity = 1.5;
  msg('IGNIÇÃO INICIADA — 25 SEGUNDOS', 4);
}
function killPlayer(kind) {
  if (P.dead) return; P.dead = true; stats.deaths++;
  if (P.hidden) { spotVisual(P.hidden, false); P.pos.copy(spotFront(P.hidden)); P.hidden = null; $('hide').style.opacity = 0; }
  SFX.scream(1.6); burst({ f: 200, q: 0.5, peak: 0.9, d: 0.6 });
  P.deathT = 0;
}
function respawn() {
  if (P.vel) P.vel.set(0, 0, 0); CAM.trauma = 0;
  P.dead = false; P.pos.copy(START); P.yaw = 0; P.pitch = 0; P.crouch = false; P.stamina = 1;
  P.installed = checkpoint.installed; fl.battery = checkpoint.battery; fl.heat = 0; fl.overheat = 0; fl.on = true;
  P.carry.forEach(f => { f.active = true; f.mesh.visible = true; }); P.carry = []; updateCarried();
  const spawns = [center(9, 30), center(2, 6), center(40, 24), center(38, 3)];
  let far = spawns[0], fd = 0; for (const s of spawns) { const d = s.distanceTo(P.pos); if (d > fd) { fd = d; far = s; } }
  AI.pos.copy(far); AI.state = 'patrol'; AI.path = []; AI.suspicion = 0; AI.grace = 8; AI.burnAcc = 0; AI.checkSpot = null; AI.seenEnter = null; AI.stalking = false;
  AI.ignition = false; AI.level = P.installed >= 3 ? 3 : P.installed >= 1 ? 2 : 1;
  panel.setLever(false); A.sirenG && A.sirenG.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2);
  $('fade').style.opacity = 0; paused = false;
  hideSpots.forEach(closeSpot);
  exitDoor.opening = false; exitDoor.open = 0; exitDoor.mesh.position.y = CFG.wallH / 2; grid[idx(21, 26)] = 'X'; grid[idx(22, 26)] = 'X'; rebuildBlocked();
  dawn.on = false; dawn.L.intensity = 0; computeLightGrid(); exitDoor.sign.material.emissiveIntensity = 0.3; exitDoor.sign.material.emissive.set(0x0a2a14);
  msg(P.installed ? `Checkpoint: ${P.installed}/5 fusíveis instalados. Os que você carregava voltaram ao lugar.` : 'Os fusíveis que você carregava voltaram ao lugar.', 4);
}
function win() {
  P.won = true; document.exitPointerLock(); saveJ('formol_save', null);
  const t = (performance.now() - stats.t0) / 1000;
  $('win_sub').textContent = `TEMPO ${Math.floor(t / 60)}m${String(Math.floor(t % 60)).padStart(2, '0')}s · MORTES ${stats.deaths} · QUEIMADURAS ${stats.burns}`;
  $('win').style.display = 'flex'; SFX.birds(); setInterval(SFX.birds, 2500);
  if (A.ctx) { A.sirenG.gain.value = 0; A.tension.gain.value = 0; A.chase.gain.value = 0; A.growlG.gain.value = 0; A.ambG.gain.value = 0.05; }
}

/* ---------------------------------------------------------------
   UI
   --------------------------------------------------------------- */
let msgT = 0;
function msg(t, dur = 3) { $('msg').textContent = t; $('msg').style.opacity = 1; msgT = dur; }
let zoneT = 0;
function silenceAmbience(sec) { if (!A.ctx) return; const t = A.ctx.currentTime; A.ambG.gain.cancelScheduledValues(t); A.ambG.gain.setValueAtTime(0.02, t); A.ambG.gain.linearRampToValueAtTime(0.22, t + sec + 1); }
function showMap(on) {
  $('map').style.display = on ? 'flex' : 'none'; if (!on) return;
  const c = $('mapc'), g = c.getContext('2d'), s = 10; g.fillStyle = '#0b0f0e'; g.fillRect(0, 0, c.width, c.height);
  const col = { pacientes: '#3b2b2b', enfermaria: '#2a3b33', admin: '#3a3726', corredor: '#3b1d1d', necroterio: '#22303b', recepcao: '#2b3a44', autopsia: '#33363a', subsolo: '#2a2420', rua: '#3a2c1c' };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const v = grid[idx(x, z)]; if (v === '#') continue; g.fillStyle = v === 'X' ? '#b8901c' : col[regionAt(x, z)]; g.fillRect(x * s, z * s, s, s); }
  g.fillStyle = '#9ab'; g.font = '10px monospace';
  [['ALA DE PACIENTES', 2, 6.5], ['ENFERMARIA', 18, 6.5], ['ADMINISTRAÇÃO', 32, 9.6], ['CORREDOR CENTRAL', 16, 14.3], ['NECROTÉRIO', 2, 19], ['RECEPÇÃO', 19, 21], ['AUTÓPSIA / LAB', 30, 23], ['SUBSOLO', 3, 33.3], ['SAÍDA', 21, 33.3]].forEach(([t, x, z]) => g.fillText(t, x * s, z * s));
  g.fillStyle = '#f0b35a'; g.fillRect(17.6 * s, 15.6 * s, 8, 8); g.fillText(`PAINEL ${P.installed}/5`, 19 * s, 17 * s);
  const [px, pz] = [P.pos.x / CS, P.pos.z / CS]; g.fillStyle = '#fff'; g.beginPath(); g.arc(px * s, pz * s, 4, 0, 7); g.fill();
  g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(px * s, pz * s); g.lineTo(px * s - Math.sin(P.yaw) * 12, pz * s - Math.cos(P.yaw) * 12); g.stroke();
}
// grão de filme

/* ---------------------------------------------------------------
   PÓS-PROCESSAMENTO — HDR, bloom, aberração cromática, distorção de lente,
   gradação de cor, ACES, vinheta, grão de filme, adaptação do olho
   --------------------------------------------------------------- */
const rtMain = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const rtA = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }), rtB = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; quadScene.add(quad);
const VQ = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const ppOpt = { depthTest: false, depthWrite: false };
const brightMat = new THREE.ShaderMaterial({ ...ppOpt, uniforms: { tD: { value: null } }, vertexShader: VQ, fragmentShader: 'uniform sampler2D tD; varying vec2 vUv; void main(){ vec3 c = texture2D(tD, vUv).rgb; if (!(c.r < 1e4)) c.r = 0.; if (!(c.g < 1e4)) c.g = 0.; if (!(c.b < 1e4)) c.b = 0.; c = min(c, vec3(40.)); float l = dot(c, vec3(.2126,.7152,.0722)); gl_FragColor = vec4(c * smoothstep(0.55, 1.5, l), 1.); }' });
const blurMat = new THREE.ShaderMaterial({ ...ppOpt, uniforms: { tD: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VQ, fragmentShader: 'uniform sampler2D tD; uniform vec2 uDir; varying vec2 vUv; void main(){ vec3 c = texture2D(tD, vUv).rgb * .227; c += (texture2D(tD, vUv + uDir*1.38).rgb + texture2D(tD, vUv - uDir*1.38).rgb) * .316; c += (texture2D(tD, vUv + uDir*3.23).rgb + texture2D(tD, vUv - uDir*3.23).rgb) * .07; gl_FragColor = vec4(c, 1.); }' });
const finalMat = new THREE.ShaderMaterial({ ...ppOpt,
  uniforms: { tD: { value: null }, tB: { value: null }, uT: { value: 0 }, uExp: { value: 1.6 }, uCA: { value: 0.002 }, uGrain: { value: 0.06 }, uRes: { value: new THREE.Vector2(1, 1) }, uDanger: { value: 0 }, uHaze: { value: new THREE.Vector4() }, uAsp: { value: 1 } },
  vertexShader: VQ,
  fragmentShader: `uniform sampler2D tD, tB; uniform float uT, uExp, uCA, uGrain, uDanger, uAsp; uniform vec2 uRes; uniform vec4 uHaze; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
    void main(){
      vec2 c = vUv - .5; float r2 = dot(c, c);
      vec2 uv = .5 + c * (0.965 + 0.07 * r2);                // distorção de lente (barril leve)
      float ca = uCA * (0.25 + r2 * 4.);                       // aberração cromática radial
      vec3 col = vec3(texture2D(tD, .5 + (uv - .5) * (1. + ca)).r, texture2D(tD, uv).g, texture2D(tD, .5 + (uv - .5) * (1. - ca)).b);
      if (!(col.r < 1e4)) col.r = 40.; if (!(col.g < 1e4)) col.g = 40.; if (!(col.b < 1e4)) col.b = 40.; col = min(col, vec3(40.));
      col += texture2D(tB, uv).rgb * 0.7;                      // bloom
      // dispersão do feixe na névoa/poeira (luz "volumétrica" barata em espaço de tela)
      vec2 hd = (uv - uHaze.xy) * vec2(uAsp, 1.); float hr = max(uHaze.w, 0.05);
      col += vec3(1.0, 0.86, 0.66) * uHaze.z * 0.0065 * exp(-dot(hd, hd) / (hr * hr)) * (1. + 0.5 * exp(-dot(hd, hd) / (hr * hr * 0.15)));
      col *= uExp;
      float l = dot(col, vec3(.2126, .7152, .0722));
      col = mix(vec3(l), col, 0.8);                            // dessatura
      col += vec3(-0.006, 0.004, 0.009) * (1. - smoothstep(0., .25, l)); // sombras frias, esverdeadas
      col = aces(col);
      col *= mix(1., 1. - smoothstep(0.18, 0.95, length(c * vec2(1.25, 1.))), 0.88 + uDanger * 0.1); // vinheta
      col.r += uDanger * 0.05 * smoothstep(0.2, 0.7, length(c));
      float g = hash(floor(vUv * uRes) + fract(uT * 7.13) * 113.7) - .5;
      col += g * uGrain * (1.2 - dot(col, vec3(.33)));          // grão (mais forte no escuro)
      gl_FragColor = vec4(pow(max(col, 0.), vec3(1. / 2.2)), 1.);
    }` });
function ppResize() {
  const pr = renderer.getPixelRatio(), w = Math.floor(innerWidth * pr), h = Math.floor(innerHeight * pr);
  rtMain.setSize(w, h); rtA.setSize(w >> 2, h >> 2); rtB.setSize(w >> 2, h >> 2); finalMat.uniforms.uRes.value.set(w, h);
}
ppResize();
let EXPO = 2.7;
function renderFrame(time, dt = 0.016) {
  // adaptação do olho: no escuro e sem lanterna a exposição sobe devagar; com luz cai rápido
  const tgt = (fl.on && fl.battery > 0 && !P.hidden) ? 2.7 : 2.7 + 1.1 * (1 - lightAt(P.pos));
  EXPO = lerp(EXPO, tgt * OPT.bright / 100, Math.min(1, dt * (tgt > EXPO ? 0.35 : 2.5)));
  renderer.setRenderTarget(rtMain); renderer.render(scene, camera);
  if (playing && !P.dead && !P.won) {
    vmRoot.matrix.copy(camera.matrixWorld); vmRoot.updateMatrixWorld(true); updateViewmodelLight(dt);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, camera); renderer.autoClear = true;
  }
  quad.material = brightMat; brightMat.uniforms.tD.value = rtMain.texture; renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam);
  quad.material = blurMat;
  for (let i = 0; i < 2; i++) {
    blurMat.uniforms.tD.value = rtA.texture; blurMat.uniforms.uDir.value.set(1 / rtA.width, 0); renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam);
    blurMat.uniforms.tD.value = rtB.texture; blurMat.uniforms.uDir.value.set(0, 1 / rtA.height); renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam);
  }
  quad.material = finalMat; const u = finalMat.uniforms;
  u.tD.value = rtMain.texture; u.tB.value = rtA.texture; u.uT.value = time; u.uExp.value = EXPO;
  u.uCA.value = 0.0018 + DANGER * 0.006 + CAM.trauma * 0.01; u.uDanger.value = DANGER; u.uGrain.value = 0.026; u.uHaze.value.set(HAZE.x, HAZE.y, HAZE.on * HAZE.i, HAZE.r); u.uAsp.value = innerWidth / innerHeight;
  renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
}

/* ---------------------------------------------------------------
   LOOP PRINCIPAL
   --------------------------------------------------------------- */
function collide(nx, nz) {
  const r = CFG.player.radius;
  for (const [ox, oz] of [[r, r], [r, -r], [-r, r], [-r, -r], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const x = Math.floor((nx + ox) / CS), z = Math.floor((nz + oz) / CS);
    if (!inb(x, z) || blocked[idx(x, z)]) return true;
  }
  return false;
}
function updatePlayer(dt) {
  if (P.dead) return;
  const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  if (P.hidden) {
    P.hideT += dt;
    const want = keys.ShiftLeft || keys.ShiftRight;
    if (want && P.breathLock <= 0 && P.stamina > 0) { if (!P.holdBreath) SFX.breathIn(); P.holdBreath = true; P.stamina -= dt / CFG.player.breath; if (P.stamina <= 0) { P.holdBreath = false; P.breathLock = 2.5; SFX.gasp(); emitNoise(P.hidden.pos, CFG.noise.gasp, 1); } }
    else { if (P.holdBreath) { P.holdBreath = false; const d = AI.pos.distanceTo(P.hidden.pos); if (d < 3) { SFX.gasp(); emitNoise(P.hidden.pos, 4, 1); } } P.stamina = Math.min(1, P.stamina + dt * 0.25); }
    P.breathLock -= dt;
    // ofegar perto da criatura sem prender o fôlego denuncia
    if (!P.holdBreath && AI.pos.distanceTo(P.hidden.pos) < 2.6 && AI.state !== 'patrol' && Math.random() < dt * 0.5) emitNoise(P.hidden.pos, 3, 1);
    const s = P.hidden, base = s.type === 'bed' ? 0.32 : 1.55;
    const inside = s.type === 'locker' ? s.pos.clone().add(s.face.clone().multiplyScalar(0.1)) : s.pos.clone().add(s.face.clone().multiplyScalar(0.25));
    CAM.amp = 0; applyCamera(dt, inside.x, base, inside.z, false);
    return;
  }
  let mx = 0, mz = 0;
  if (keys.KeyW) mz += 1; if (keys.KeyS) mz -= 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
  const moving = mx || mz;
  let run = (keys.ShiftLeft || keys.ShiftRight) && moving && mz > 0 && P.stamina > 0 && P.exhausted <= 0;
  if (run) P.crouch = false;
  if (run) { P.stamina -= dt / CFG.player.stamina; if (P.stamina <= 0) { P.exhausted = 2; SFX.gasp(); } }
  else P.stamina = Math.min(1, P.stamina + dt * (moving ? 0.14 : 0.22));
  P.exhausted -= dt;
  const speed = run ? CFG.player.run : P.crouch ? CFG.player.crouch : CFG.player.walk;
  const dir = fwd.clone().multiplyScalar(mz).add(right.clone().multiplyScalar(mx)); if (dir.lengthSq()) dir.normalize();
  // aceleração suave (o corpo tem massa)
  P.vel = P.vel || new THREE.Vector3();
  P.vel.lerp(dir.multiplyScalar(speed), Math.min(1, dt * (moving ? 9 : 12)));
  const ox = P.pos.x, oz = P.pos.z;
  const nx = P.pos.x + P.vel.x * dt, nz = P.pos.z + P.vel.z * dt;
  if (!collide(nx, P.pos.z)) P.pos.x = nx; else P.vel.x = 0;
  if (!collide(P.pos.x, nz)) P.pos.z = nz; else P.vel.z = 0;
  // passada: a fase avança pela distância real percorrida; cada meia-volta é um pé tocando o chão
  const moved = Math.hypot(P.pos.x - ox, P.pos.z - oz), mode = run ? 'run' : P.crouch ? 'crouch' : 'walk';
  const stepLen = run ? 1.35 : P.crouch ? 0.55 : 0.8;
  const prevStep = Math.floor(CAM.phase / Math.PI);
  CAM.phase += moved / stepLen * Math.PI; CAM.run = run;
  const tAmp = moved / dt > 0.3 ? (run ? 1 : P.crouch ? 0.45 : 0.65) : 0;
  CAM.amp = lerp(CAM.amp, tAmp, Math.min(1, dt * (tAmp > CAM.amp ? 5 : 3)));
  if (Math.floor(CAM.phase / Math.PI) !== prevStep) footfall(mode);
  if (run && Math.random() < dt * 1.2) SFX.breathIn();
  P.eyeH = lerp(P.eyeH, P.crouch ? CFG.player.eyeCrouch : CFG.player.eye, Math.min(1, dt * 8));
  applyCamera(dt, P.pos.x, P.eyeH, P.pos.z, true);
  // região
  const [cx, cz] = cellOf(P.pos); const rg = regionAt(cx, cz);
  if (rg !== P.region) { P.region = rg; $('zone').textContent = REGION_NAME[rg]; $('zone').style.opacity = 0.8; zoneT = 3; }
  // instalar (segurar E)
  const it = focusItem;
  if (eHeld && it && it.type === 'panel' && P.carry.length && P.installed < 5) {
    installT += dt; $('prog').style.display = 'block'; $('prog').firstChild.style.width = (installT / 3 * 100) + '%';
    if (Math.random() < dt * 6) burst({ f: 4000, type: 'highpass', peak: 0.1, d: 0.04 });
    if (installT >= 3) { installT = 0; installOne(); }
  } else { if (!eHeld) installT = 0; $('prog').style.display = 'none'; }
  // vitória
  if (exitDoor.open > 0.8 && P.pos.z > 28 * CS) win();
}
function updateFlashlight(dt, time) {
  const F = CFG.flash;
  const usable = fl.on && !P.hidden && !P.dead;
  let focusing = usable && mouseFocus && fl.overheat <= 0 && fl.battery > 0;
  if (fl.overheat > 0) fl.overheat -= dt;
  if (focusing) { fl.heat += dt * F.heatRate; if (fl.heat >= 1) { fl.heat = 1; fl.overheat = F.overheat; focusing = false; burst({ f: 3000, type: 'highpass', peak: 0.3, d: 0.6 }); msg('Lanterna superaquecida', 1.5); } }
  else fl.heat = Math.max(0, fl.heat - dt * F.coolRate);
  if (usable && fl.battery > 0) fl.battery = Math.max(0, fl.battery - dt * (focusing ? F.drainFocus : F.drainNormal));
  fl.focus = focusing;
  let I = 0;
  if (usable) {
    if (fl.battery > 0) { I = focusing ? F.focusI : F.normalI; I *= 0.55 + 0.45 * clamp(fl.battery / 30, 0, 1); if (fl.battery < 15 && Math.random() < 0.08) { I *= rand(0.05, 0.5); if (Math.random() < 0.06 && TORCH.tapT <= 0) { TORCH.tapT = 0.35; burst({ f: 900, q: 3, peak: 0.12, d: 0.05 }); } } if (fl.overheat > 0 && Math.random() < 0.3) I *= rand(0.1, 0.6); }
    else { fl.deadFlicker += dt; const ph = fl.deadFlicker % 10; I = ph < 2 ? F.normalI * 0.25 * (Math.random() < 0.6 ? 1 : 0.2) : 0; }
  }
  const ang = focusing ? F.focusAngle : F.normalAngle, dist = focusing ? F.focusDist : F.normalDist;
  flash.intensity = lerp(flash.intensity, I, Math.min(1, dt * 20)); flash.angle = lerp(flash.angle, ang, Math.min(1, dt * 10)); flash.distance = lerp(flash.distance, dist, Math.min(1, dt * 10));
  flash.penumbra = focusing ? 0.25 : 0.55;
  { const t = 1 - clamp(fl.battery / 30, 0, 1); flash.color.setRGB(1, lerp(0.9, 0.62, t), lerp(0.75, 0.32, t)); }
  hand.visible = !P.hidden;
  // feixe volumétrico e poeira acompanham a lanterna
  const fogK = (P.region === 'necroterio' || P.region === 'subsolo') ? 1.8 : 1;
  camera.updateMatrixWorld(true); _v1.set(0, 0, -0.12).applyMatrix4(handAnchor.matrixWorld); dustMat.uniforms.uLens.value.copy(_v1);
  const bL = flash.distance * 0.55, bT = Math.tan(flash.angle * 0.85);
  beam.scale.set(bT * bL, bT * bL, bL); beamMat.uniforms.uI.value = (flash.intensity / F.normalI) * 0.028 * fogK * (focusing ? 0.7 : 1);
  beam.visible = false;
  { const tip = _v3.copy(beamDirLocal).transformDirection(handAnchor.matrixWorld).multiplyScalar(4).add(dustMat.uniforms.uLens.value).project(camera); HAZE.x = tip.x * 0.5 + 0.5; HAZE.y = tip.y * 0.5 + 0.5; HAZE.on = tip.z < 1 ? 1 : 0; HAZE.i = flash.intensity / F.normalI * fogK; HAZE.r = Math.tan(flash.angle) * 0.9; }
 dustMat.uniforms.uDir.value.copy(beamDirLocal).transformDirection(handAnchor.matrixWorld);
  dustMat.uniforms.uTan.value = Math.tan(flash.angle); dustMat.uniforms.uLen.value = flash.distance * 0.7; dustMat.uniforms.uI.value = flash.intensity / F.normalI * fogK;
  dustMat.uniforms.uTime.value = time; dustMat.uniforms.uCam.value.copy(camera.position); dustMat.uniforms.uPx.value = renderer.getPixelRatio() * innerHeight / 700;
  if (A.ctx) { A.focusG.gain.setTargetAtTime(focusing ? 0.025 : 0, A.ctx.currentTime, 0.05); A.focusOsc.frequency.setTargetAtTime(220 + fl.heat * 500, A.ctx.currentTime, 0.1); }

  // efeito na criatura
  AI.slow = 1; let burning = false; let beamOnEyes = 0;
  if (I > 1 && !P.dead) {
    const hp = AI.headPos(_v2), cp = camera.position;
    const v = _v3.copy(hp).sub(cp), d = v.length(); v.normalize();
    const cf = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const angle = Math.acos(clamp(v.dot(cf), -1, 1));
    if (d < dist && angle < ang * 1.1 && los(cp, hp)) {
      beamOnEyes = 1 - angle / (ang * 1.1);
      if (AI.state !== 'recoil') AI.slow = F.bodySlow;
      if (focusing && d < F.burnRange && angle < F.burnCone) {
        burning = true; AI.burnAcc += dt;
        if (Math.random() < dt * 20) puff(hp, 1, true);
        const thr = clamp(F.burnBase + F.burnStep * AI.burns - 0.3 * P.installed, F.burnBase, F.burnMax);
        if (AI.state === 'patrol' || AI.state === 'investigate') { AI.lastKnown = P.pos.clone(); AI.suspicion = 100; }
        if (AI.burnAcc >= thr && AI.state !== 'recoil') {
          AI.burns++; stats.burns++; AI.burnAcc = 0; AI.setState('recoil'); SFX.scream(1.5); puff(hp, 12, false); msg('Ele recuou. Vai voltar.', 2);
        }
      }
    }
  }
  if (!burning) AI.burnAcc = Math.max(0, AI.burnAcc - dt * 0.5);
  // olhos: pupilas contraem com luz, brilho reflexivo
  C.eyes.forEach(e => e.userData.pupil.scale.setScalar(lerp(e.userData.pupil.scale.x, beamOnEyes > 0 ? 0.25 : 1.1, dt * 6)));
  C.eyeGlow.material.opacity = beamOnEyes * 0.9 + (lightAt(AI.pos) < 0.2 ? 0.08 : 0);
  C.eyeMat.color.setRGB(0.75 + beamOnEyes * 0.25, 0.78 + beamOnEyes * 0.2, 0.72 + beamOnEyes * 0.2);
  if (A.ctx) A.sizzleG.gain.setTargetAtTime(burning ? 0.35 : 0, A.ctx.currentTime, 0.04);
  // HUD
  $('batt').firstChild.style.width = fl.battery + '%'; $('batt_t').textContent = Math.ceil(fl.battery) + '%';
  $('batt').firstChild.style.background = fl.battery < 15 ? '#c23a2c' : '#d9e6d0';
  $('heat').firstChild.style.width = (fl.heat * 100) + '%';
  $('heat').firstChild.style.opacity = fl.overheat > 0 ? (Math.sin(time * 20) > 0 ? 1 : 0.3) : 1;
}
function updateLights(dt, time) {
  // blackout ocasional na recepção quando ele está furioso
  if (AI.level >= 3 && !AI.ignition && blackout <= 0 && Math.random() < dt / 120 && AI.pos.distanceTo(P.pos) < 25) { blackout = 7; computeLightGrid(); msg('As luzes da recepção apagaram…', 2.5); }
  if (blackout > 0) { blackout -= dt; if (blackout <= 0) computeLightGrid(); }
  for (const l of LIGHTS) {
    let k = l.on ? 1 : 0;
    if (l.on && l.broken && Math.random() < dt * 0.6) l.flickT = rand(0.05, 0.4);
    if (l.flickT > 0) { l.flickT -= dt; k *= Math.random() < 0.5 ? 0.05 : 1; }
    if (l.on && AI.pos.distanceTo(l.pos) < 7 && l.sector !== 'rua') k *= Math.random() < 0.35 ? 0.1 : 1; // interferência quando ele passa
    if (blackout > 0 && l.sector === 'recepcao') k = Math.random() < 0.02 ? 0.4 : 0;
    if (AI.ignition && l.sector !== 'rua' && l.sector !== 'corredor') k *= 0.55 + 0.45 * (Math.sin(time * 9 + l.pos.x) > -0.3 ? 1 : 0);
    l.L.intensity = l.base * k;
    l.fixture.material.emissiveIntensity = l.on ? (l.kind === 'red' ? 2 : 1.6) * k + 0.02 : 0.02;
  }
}
function updateDanger() {
  const st = AI.state, d = AI.pos.distanceTo(P.pos);
  DANGER = clamp((st === 'chase' ? 1 : st === 'hunt' || st === 'search' ? 0.6 : 0.3) * (1 - clamp((d - 3) / 22, 0, 1)), 0, 1);
  CAM.floor = Math.min(0.55, DANGER * 0.38 + (AI.ignition ? 0.22 : 0) + (P.exhausted > 0 ? 0.12 : 0) + (st === 'chase' && d < 8 ? 0.12 : 0));
}
function updateAudio(dt, time) {
  if (!A.ctx) return; const ctx = A.ctx, t = ctx.currentTime, l = ctx.listener;
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  if (l.positionX) { l.positionX.value = camera.position.x; l.positionY.value = camera.position.y; l.positionZ.value = camera.position.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z; }
  else { l.setPosition(camera.position.x, camera.position.y, camera.position.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  const hp = AI.headPos(_v1); A.cPan.positionX.value = hp.x; A.cPan.positionY.value = hp.y; A.cPan.positionZ.value = hp.z;
  const walls = wallsBetween(hp.x, hp.z, camera.position.x, camera.position.z, 3);
  A.cFilt.frequency.setTargetAtTime(walls ? 900 / walls : 9000, t, 0.1);
  const hideMuffle = P.hidden ? 0.5 : 1;
  const st = AI.state;
  const growl = (st === 'chase' ? 0.9 : st === 'hunt' || st === 'search' ? 0.55 : st === 'recoil' ? 0.3 : 0.35) * hideMuffle;
  A.growlG.gain.setTargetAtTime(growl, t, 0.2); A.growlOsc.frequency.setTargetAtTime(st === 'chase' ? 62 : 44, t, 0.3); A.breathLfo.frequency.setTargetAtTime(st === 'chase' ? 2.2 : 0.35, t, 0.3);
  A.dragG.gain.setTargetAtTime(Math.min(1, AI.speed / 3) * 0.25 * hideMuffle, t, 0.1);
  if ((st === 'investigate' || st === 'search') && AI.speed < 0.5 && Math.random() < dt * 2) SFX.tick();
  // perigo → coração, tensão, perseguição
  const d = AI.pos.distanceTo(P.pos);
  const danger = clamp((st === 'chase' ? 1 : st === 'hunt' || st === 'search' ? 0.6 : 0.3) * (1 - clamp((d - 3) / 22, 0, 1)), 0, 1);
  DANGER = danger;
  CAM.floor = Math.min(0.55, danger * 0.38 + (AI.ignition ? 0.22 : 0) + (P.exhausted > 0 ? 0.12 : 0) + (st === 'chase' && d < 8 ? 0.12 : 0));
  A.tension.gain.setTargetAtTime(danger * 0.07, t, 0.6);
  A.chase.gain.setTargetAtTime(st === 'chase' && !P.dead ? 0.6 : 0, t, 0.8);
  A.nextBeat -= dt; if (danger > 0.15 && A.nextBeat <= 0) { SFX.heart(0.4 + danger * 0.8); A.nextBeat = lerp(1.1, 0.42, danger); }
  A.nextKick -= dt; if (st === 'chase' && A.nextKick <= 0) { SFX.kick(); A.nextKick = 0.34; }
  // zumbido das lâmpadas próximas
  let hum = 0; for (const lt of LIGHTS) if (lt.on && lt.kind === 'fluo') hum = Math.max(hum, 1 - lt.pos.distanceTo(camera.position) / 8);
  A.hum.gain.setTargetAtTime(Math.max(0, hum) * 0.025, t, 0.2);
  // prédio vivo: batidas metálicas distantes
  A.nextClank -= dt; if (A.nextClank <= 0) { A.nextClank = rand(14, 40); const a = rand(0, 6.28); SFX.clank({ x: camera.position.x + Math.cos(a) * rand(15, 30), y: 2, z: camera.position.z + Math.sin(a) * rand(15, 30) }); }
  if (AI.ignition) A.sirenG.gain.setTargetAtTime(0.06, t, 0.5);
  // tela
  $('danger').style.opacity = (danger * 0.9 + (st === 'chase' ? Math.sin(time * 8) * 0.1 : 0)).toFixed(2);
}
let last = performance.now(), grainTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; const time = now / 1000;
  if (MODE === 'intro') {
    updateCine(dt, time); animateCreature(dt, time); updateLights(dt, time); updateListenerOnly();
    for (const s of steam) if (s.life > 0) { s.life -= dt * 0.8; s.s.position.addScaledVector(s.v, dt); s.s.material.opacity = s.life * 0.3; if (s.life <= 0) s.s.visible = false; }
    if (AI.burnAcc > 0.5 && Math.random() < dt * 25) puff(AI.headPos(_v3), 1, true);
    DANGER = 0; renderFrame(time, dt); return;
  }
  if (!playing) { // câmera de menu
    menuMusic(dt); updateListenerOnly();
    camera.position.set(9, 1.55, 28); camera.rotation.set(Math.sin(time * 0.2) * 0.03, -Math.PI / 2 + Math.sin(time * 0.13) * 0.05, 0, 'YXZ');
    const mx = 31 + Math.sin(time * 0.09) * 5; AI.yaw = Math.cos(time * 0.09) > 0 ? Math.PI / 2 : -Math.PI / 2;
    AI.pos.set(mx, 0, 27.4); AI.state = 'patrol'; AI.speed = 1.1;
    animateCreature(dt, time); updateLights(dt, time); flash.intensity = 30; beam.visible = false;
    renderFrame(time, dt); return;
  }
  if (paused || P.won) { renderFrame(time, dt); return; }
  if (P.dead) {
    P.deathT += dt; const hp = AI.headPos(_v1);
    AI.anim.jaw = lerp(AI.anim.jaw, 1.0, dt * 4); C.jaw.rotation.x = AI.anim.jaw;
    const lookAt = new THREE.Matrix4().lookAt(camera.position, hp, new THREE.Vector3(0, 1, 0)); const q = new THREE.Quaternion().setFromRotationMatrix(lookAt);
    camera.quaternion.slerp(q, Math.min(1, dt * 6)); const ds = 0.03 + 0.06 * Math.max(CAM.level, 0.3); camera.position.x += (Math.random() - .5) * ds; camera.position.y += (Math.random() - .5) * ds; DANGER = 1; CAM.trauma = 1;
    if (P.deathT > 0.9) $('fade').style.opacity = 1;
    if (P.deathT > 1.6 && $('dead').style.display !== 'flex') { $('dead').style.display = 'flex'; document.exitPointerLock(); }
    renderFrame(time, dt); return;
  }
  step(dt, time);
  renderFrame(time, dt);
}
function step(dt, time) {
  focusItem = findInteract();
  $('prompt').textContent = promptFor(focusItem);
  updatePlayer(dt);
  updateFlashlight(dt, time);
  AI.update(dt);
  animateCreature(dt, time);
  updateLights(dt, time);
  // ignição e porta
  if (AI.ignition) {
    AI.ignT += dt; AI.lastKnown = P.pos.clone();
    panel.needle.rotation.z = 1.2 - Math.min(1, AI.ignT / CFG.ignitionTime) * 2.4 + Math.sin(time * 30) * 0.03;
    if (AI.ignT > CFG.ignitionTime && !exitDoor.opening) { exitDoor.opening = true; SFX.door(); dawn.on = true; dawn.L.intensity = dawn.base = 40; computeLightGrid(); msg('A PORTA ESTÁ ABRINDO — CORRA!', 4); }
    if (Math.random() < dt * 0.4) emitNoise(panel.pos, CFG.noise.ignition, 3);
  } else panel.needle.rotation.z = lerp(panel.needle.rotation.z, 1.2 - P.installed * 0.38 + Math.sin(time * 7) * 0.008 * P.installed, Math.min(1, dt * 3));
  if (exitDoor.opening && exitDoor.open < 1) {
    exitDoor.open = Math.min(1, exitDoor.open + dt / 3); exitDoor.mesh.position.y = CFG.wallH / 2 + exitDoor.open * (CFG.wallH - 0.4);
    if (exitDoor.open > 0.5) { grid[idx(21, 26)] = '.'; grid[idx(22, 26)] = '.'; rebuildBlocked(); }
  }
  // partículas de vapor
  for (const s of steam) if (s.life > 0) { s.life -= dt * 0.8; s.s.position.addScaledVector(s.v, dt); s.s.scale.setScalar(0.15 + (1 - s.life) * 0.5); s.s.material.opacity = s.life * (s.faint ? 0.12 : 0.45); if (s.life <= 0) s.s.visible = false; }
  // respiração condensando no frio
  if ((P.region === 'necroterio' || P.region === 'subsolo') && !P.holdBreath) { P.breathT = (P.breathT || 0) - dt; if (P.breathT <= 0) { P.breathT = P.stamina < 0.5 ? 1.1 : 2.6; const f = new THREE.Vector3(0, -0.12, -0.35).applyQuaternion(camera.quaternion).add(camera.position); puff(f, 2, false, true); } }
  if (P.region === 'necroterio' && Math.random() < dt * 3) { const c = camera.position; puff(new THREE.Vector3(c.x + rand(-4, 4), 0.15, c.z + rand(-4, 4)), 1); }
  // faíscas do quadro
  for (const sp of panel.sparks) if (sp.life > 0) { sp.life -= dt; sp.v.y -= 9.8 * dt; sp.sp.position.addScaledVector(sp.v, dt); if (sp.sp.position.y < 0.02) { sp.sp.position.y = 0.02; sp.v.y *= -0.3; sp.v.x *= 0.6; sp.v.z *= 0.6; } sp.sp.material.opacity = Math.min(1, sp.life * 2); if (sp.life <= 0) sp.sp.visible = false; }
  panel.flash.intensity = Math.max(0, panel.flash.intensity - dt * 25) * (Math.random() < 0.3 ? 0.4 : 1);
  // brilho dos itens
  for (const it of interact) if (it.glint && it.active) it.glint.material.opacity = 0.25 + Math.sin(time * 3 + it.pos.x) * 0.15;
  updateDanger();
  updateAudio(dt, time);
  // HUD
  $('stam').firstChild.style.width = (P.stamina * 100) + '%';
  $('stam').firstChild.style.background = P.holdBreath ? '#e0d070' : '#8fb3c9';
  $('f_inst').textContent = P.installed; $('f_carry').textContent = P.carry.length;
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').style.opacity = 0; }
  if (zoneT > 0) { zoneT -= dt; if (zoneT <= 0) $('zone').style.opacity = 0; }
  P.noiseLevel = Math.max(0, P.noiseLevel - dt);
}
requestAnimationFrame(frame);
window.__FORMOL = { A, get paused() { return paused; }, get playing() { return playing; }, pauseGame: () => pauseGame(), quickStart: () => { audioInit(); decodeAssets(); $('splash').style.display = 'none'; $('menu').style.display = 'none'; startGame(); }, get MODE() { return MODE; }, CINE, TORCH, hand, CAM, cycleShake, AI, P, fl, CFG, scene, camera, renderer, LIGHTS, lightGrid, interact, sim: (sec) => { let t = performance.now() / 1000; for (let k = 0; k < sec * 30; k++) { if (P.dead || P.won) break; step(1 / 30, t += 1 / 30); } }, setPaused: v => { paused = v; }, startPlaying: () => { playing = true; stats.t0 = performance.now(); }, killPlayer, respawn, installOne, startIgnition, computeLightGrid };
})();
