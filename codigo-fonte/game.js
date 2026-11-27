'use strict';
/* =====================================================================
   FORMOL — protótipo jogável (Three.js r158, sem assets externos)
   Sistemas: mapa em grade, lanterna (normal/foco/bateria), 3 capítulos,
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
    burnRange: 14, burnCone: 0.13,
    burnBase: 0.8, burnStep: 0.3, burnMax: 2.0, bodySlow: 0.8
  },
  creature: {
    patrol: 1.6, investigate: 2.4, hunt: 2.9, chase: 4.3, recoil: 5.2,
    darkMul: 1.15, lightMul: 0.7, killDist: 1.3, fov: 0.96, // ~110°
    recoilTime: 6, fleeExposure: 0.3, fleeTime: 5, fleeAway: 20, lostTime: 3, intuition: 1.5, searchTime: 25, investigateTime: 12,
    levelSpeed: [1, 1, 1.08, 1.16, 1.25], levelHear: [1, 1, 1.2, 1.4, 1.6]
  },
  ignitionTime: 25, dawnTime: 75
};
const CS = CFG.cell;

/* ---------------------------------------------------------------
   MAPA — grade 66 x 50 (células de 2 m), gerada por retângulos. Cresce a cada capítulo:
   I: prédio principal (x 0–43) · II: Pavilhão Leste, ala norte · III: capela, fototerapia, crematório
   IV: galerias subterrâneas e Pátio Interno (z 33–49)
   --------------------------------------------------------------- */
const W = 66, H = 50;
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

// ===== PAVILHÃO LESTE — Programa Noite Longa, lacrado desde 1984 =====
grid[idx(43, 13)] = 'X'; grid[idx(43, 14)] = 'X';               // porta corta-fogo (trava eletromagnética)
carve(44, 13, 64, 14);                                           // corredor leste
// câmaras de privação: corredor interno + 5 celas sem janela
carve(44, 6, 56, 7);
[[44, 46], [48, 50], [52, 54]].forEach(([a, b]) => { carve(a, 1, b, 4); carve(a + 1, 5, a + 1, 5); });
[[48, 50], [52, 54]].forEach(([a, b]) => { carve(a, 9, b, 11); carve(a + 1, 8, a + 1, 8); });
carve(45, 8, 45, 12);                                            // passagem até o corredor leste
// diretoria (escritório do Dr. Varela) — porta com teclado numérico
carve(58, 1, 64, 7); grid[idx(57, 6)] = 'X';
// sala de gravação / arquivo de fitas
carve(58, 9, 64, 11); carve(61, 12, 61, 12);
// capela
carve(44, 16, 52, 24); carve(48, 15, 48, 15);
// sala de fototerapia — leitor de cartão na frente e porta dos fundos
carve(55, 16, 64, 24); grid[idx(59, 15)] = 'X'; carve(60, 25, 60, 25); grid[idx(60, 26)] = 'X';
// crematório
carve(45, 25, 45, 26); carve(44, 27, 61, 32);
grid[idx(48, 15)] = 'X';                                         // porta da capela (abre no capítulo III)
carve(36, 26, 36, 27); carve(34, 28, 39, 31);                    // esconderijo do vigia Osmar (passagem estreita na autópsia)

// ===== GALERIAS SUBTERRÂNEAS + PÁTIO INTERNO (capítulo IV) =====
grid[idx(53, 33)] = 'X'; grid[idx(15, 33)] = 'X';                // alçapão do crematório · grade do subsolo
carve(53, 34, 53, 34); carve(15, 34, 15, 34);
carve(10, 35, 62, 35);                                           // túnel principal
carve(12, 36, 12, 43); carve(28, 36, 28, 43); carve(46, 36, 46, 43);   // poços de ligação
carve(12, 43, 50, 43);                                           // túnel sul
carve(16, 38, 24, 41); carve(13, 39, 15, 39);                    // ossário
carve(32, 38, 42, 41); carve(29, 40, 31, 40); carve(43, 39, 45, 39);   // reservatório
carve(56, 38, 62, 42); carve(60, 36, 60, 37);                    // quarto da enfermeira Celeste
grid[idx(30, 44)] = 'X'; carve(22, 45, 38, 48);                  // portão gradeado e Pátio Interno (céu aberto)

function regionAt(x, z) {
  if (z >= 33) {
    if (z >= 44 && x >= 22 && x <= 38) return 'patio';
    if (x >= 56 && z >= 38 && z <= 42) return 'quarto';
    if (x >= 13 && x <= 24 && z >= 38 && z <= 41) return 'ossario';
    if (x >= 29 && x <= 45 && z >= 38 && z <= 41) return 'reservatorio';
    return 'galerias';
  }
  if (x >= 44) {
    if (z <= 12) return x >= 58 ? (z <= 7 ? 'diretoria' : 'gravacao') : 'privacao';
    if (z <= 14) return 'leste';
    if (z <= 25) return x <= 53 ? 'capela' : 'fototerapia';
    return x === 60 && z === 26 ? 'fototerapia' : 'crematorio';
  }
  if (z >= 26 && x >= 25 && x <= 43) return 'vigia';
  if (z >= 27) return x <= 19 ? 'subsolo' : 'rua';
  if (z >= 13 && z <= 14) return 'corredor';
  if (z <= 12) return x <= 15 ? 'pacientes' : x <= 28 ? 'enfermaria' : 'admin';
  if (z === 26 && x >= 20 && x <= 23) return 'recepcao';
  return x <= 15 ? 'necroterio' : x <= 28 ? 'recepcao' : 'autopsia';
}
const REGION_NAME = {
  pacientes: 'Ala de Pacientes', enfermaria: 'Enfermaria', admin: 'Administração e Arquivos',
  corredor: 'Corredor Central', necroterio: 'Necrotério', recepcao: 'Recepção',
  autopsia: 'Autópsia e Laboratório', subsolo: 'Subsolo', rua: 'Saída',
  leste: 'Pavilhão Leste', privacao: 'Câmaras de Privação', diretoria: 'Diretoria — Dr. Varela', gravacao: 'Sala de Gravação',
  capela: 'Capela', fototerapia: 'Sala de Fototerapia', crematorio: 'Crematório',
  galerias: 'Galerias Subterrâneas', ossario: 'Ossário', reservatorio: 'Reservatório', quarto: 'Quarto da Enf. Celeste', patio: 'Pátio Interno', vigia: 'Esconderijo do Vigia'
};
// capítulo em que cada área passa a fazer parte do jogo (o mapa cresce a cada capítulo)
const REGION_CH = { leste: 2, privacao: 2, diretoria: 2, gravacao: 2, capela: 3, fototerapia: 3, crematorio: 3, galerias: 4, ossario: 4, reservatorio: 4, quarto: 4, patio: 4 };
const EAST = new Set(Object.keys(REGION_CH));
const UNDER = new Set(['galerias', 'ossario', 'reservatorio', 'quarto', 'patio']);

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
    const kind = DRAWER_CELLS.has(idx(x, z)) ? 'drawers' : (adj === 'subsolo' || adj === 'rua' || adj === 'crematorio' || UNDER.has(adj)) ? 'concrete' : 'wall';
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
  const c3 = new THREE.Mesh(new THREE.PlaneGeometry(19 * CS, 7 * CS), M.concrete);
  c3.rotation.x = Math.PI / 2; c3.position.set(53.5 * CS, CFG.wallH, 30.5 * CS); level.add(c3);
  const r3 = new THREE.Mesh(new THREE.PlaneGeometry(18 * CS, 6 * CS), M.wet);
  r3.rotation.x = -Math.PI / 2; r3.position.set(53 * CS, 0.01, 30 * CS); r3.receiveShadow = true; level.add(r3);
  // galerias: teto baixo de concreto (o pátio fica a céu aberto) e piso molhado
  const c5 = new THREE.Mesh(new THREE.PlaneGeometry(7 * CS, 7 * CS), M.concrete);
  c5.rotation.x = Math.PI / 2; c5.position.set(37 * CS, CFG.wallH, 29.5 * CS); level.add(c5);
  const c4 = new THREE.Mesh(new THREE.PlaneGeometry(W * CS, 12 * CS), M.concrete);
  c4.rotation.x = Math.PI / 2; c4.position.set(W * CS / 2, CFG.wallH, 39 * CS); level.add(c4);
  const r4 = new THREE.Mesh(new THREE.PlaneGeometry(54 * CS, 11 * CS), M.wet);
  r4.rotation.x = -Math.PI / 2; r4.position.set(36 * CS, 0.01, 39.5 * CS); r4.receiveShadow = true; level.add(r4);
  // água parada do reservatório
  const wt = new THREE.Mesh(new THREE.PlaneGeometry(11 * CS, 4 * CS), new THREE.MeshStandardMaterial({ color: 0x0b1210, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.82 }));
  wt.rotation.x = -Math.PI / 2; wt.position.set(37.5 * CS, 0.06, 40 * CS); level.add(wt);
  // pátio: lajes de pedra
  const pt = new THREE.Mesh(new THREE.PlaneGeometry(17 * CS, 4 * CS), new THREE.MeshStandardMaterial({ map: T.concrete, color: 0x8a8678, roughness: 0.9 }));
  pt.rotation.x = -Math.PI / 2; pt.position.set(30.5 * CS, 0.012, 47 * CS); pt.receiveShadow = true; level.add(pt);
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
const BODY_BEDS = [];
function addBed(x, z, opts = {}) {
  const g = new THREE.Group(), c = center(x, z); g.position.copy(c);
  const [dx, dz] = wallDir(x, z); g.rotation.y = dz !== 0 ? Math.PI / 2 : 0;
  for (const sx of [-0.42, 0.42]) for (const sz of [-0.9, 0.9]) cyl(0.025, 0.025, 0.7, M.steel, sx, 0.35, sz, g, 6);
  box(0.95, 0.06, 1.95, M.steel, 0, 0.66, 0, g);
  box(0.9, 0.16, 1.9, M.mattress, 0, 0.77, 0, g);
  if (opts.body) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.25, 4, 8), M.bag); b.rotation.x = Math.PI / 2; b.position.set(0, 0.98, 0); b.scale.set(1, 1, 0.6); b.castShadow = true; g.add(b); BODY_BEDS.push({ x, z, b }); }
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
function addNote(x, z, title, text) {
  const c = center(x, z); const p = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.32), new THREE.MeshStandardMaterial({ map: T.paper, emissive: 0x302c22, roughness: 1 }));
  p.rotation.x = -Math.PI / 2; p.rotation.z = rand(0, 6); p.position.set(c.x + rand(-.3, .3), 0.015, c.z + rand(-.3, .3)); level.add(p);
  interact.push({ type: 'note', pos: p.position.clone(), mesh: p, title, text, active: true });
}
// itens de história: fita cassete, lâmpada de arco, cartão da diretoria
const TAPE_M = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.45 });
function addPickup(type, n, x, z, opts = {}) {
  const c = center(x, z), g = new THREE.Group(); g.position.set(c.x + rand(-.25, .25), 0.02, c.z + rand(-.25, .25)); g.rotation.y = rand(0, 6.3);
  let gc = 0xffffff, gs = 0.35;
  if (type === 'tape') {
    box(0.11, 0.018, 0.07, TAPE_M, 0, 0.009, 0, g);
    const lt = tex(128, 64, (q, w, h) => { q.fillStyle = '#e4dcc4'; q.fillRect(0, 0, w, h); q.fillStyle = '#1a1a1a'; q.font = 'bold 20px monospace'; q.fillText('NOITE LONGA', 8, 26); q.font = '18px monospace'; q.fillText('FITA ' + n, 8, 52); q.fillStyle = '#2a2a2a'; q.beginPath(); q.arc(98, 44, 9, 0, 7); q.fill(); grime(q, w, h, 4, 'rgba(90,60,20,A)', 6, 20, .4); });
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.042), new THREE.MeshStandardMaterial({ map: lt, roughness: 1 })); lb.rotation.x = -Math.PI / 2; lb.position.y = 0.0185; g.add(lb);
    gc = 0x7fb8ff;
  } else if (type === 'lamp') {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 18), new THREE.MeshPhysicalMaterial({ color: 0xdfeaff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }));
    glass.rotation.z = Math.PI / 2; glass.position.y = 0.06; g.add(glass);
    for (const sx of [-0.18, 0.18]) { const cap = cyl(0.06, 0.06, 0.06, M.ceramic, sx, 0.06, 0, g, 14); cap.rotation.z = Math.PI / 2; const pin = cyl(0.012, 0.012, 0.05, M.brass, sx * 1.3, 0.06, 0, g, 8); pin.rotation.z = Math.PI / 2; }
    for (const sx of [-0.05, 0.05]) { const e = cyl(0.006, 0.006, 0.1, M.steel, sx * 1.6, 0.06, 0, g, 6); e.rotation.z = Math.PI / 2; }
    gc = 0xe8f4ff; gs = 0.6;
  } else if (type === 'flare') {
    const m = cyl(0.02, 0.02, 0.24, new THREE.MeshStandardMaterial({ color: 0x9a1810, roughness: 0.5 }), 0, 0.02, 0, g, 8); m.rotation.z = Math.PI / 2;
    const c2 = cyl(0.022, 0.022, 0.04, M.dark, 0.13, 0.02, 0, g, 8); c2.rotation.z = Math.PI / 2; gc = 0xff4030; gs = 0.4;
  } else if (type === 'bottle') {
    const m = cyl(0.035, 0.035, 0.24, new THREE.MeshPhysicalMaterial({ color: 0x3a5a30, roughness: 0.15, transparent: true, opacity: 0.85 }), 0, 0.035, 0, g, 8); m.rotation.z = Math.PI / 2; gc = 0x90c090; gs = 0.3;
  } else if (type === 'foto') {
    const pt = tex(64, 76, (q, w, h) => { q.fillStyle = '#e6e2d6'; q.fillRect(0, 0, w, h); q.fillStyle = '#2a2622'; q.fillRect(5, 5, w - 10, h - 22); grime(q, w, h, 3, 'rgba(90,60,20,A)', 6, 18, .4); });
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.11), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.6 })); ph.rotation.x = -Math.PI / 2; ph.position.y = 0.004; g.add(ph); gc = 0xffffff; gs = 0.3;
  } else if (type === 'crank') {
    const ir = cyl(0.025, 0.025, 0.5, M.rust, 0, 0.03, 0, g, 8); ir.rotation.z = Math.PI / 2;
    const arm = cyl(0.02, 0.02, 0.22, M.rust, 0.25, 0.03, 0.1, g, 6); arm.rotation.x = Math.PI / 2;
    const hd = cyl(0.03, 0.03, 0.12, M.wood, 0.25, 0.06, 0.2, g, 8);
    gc = 0xffc070; gs = 0.45;
  } else if (type === 'card') {
    const ct = tex(128, 80, (q, w, h) => { q.fillStyle = '#e8e4da'; q.fillRect(0, 0, w, h); q.fillStyle = '#7a1510'; q.fillRect(0, 0, w, 16); q.fillStyle = '#111'; q.font = 'bold 12px sans-serif'; q.fillText('INST. SÃO LÁZARO', 8, 34); q.font = '11px sans-serif'; q.fillText('DIRETORIA CLÍNICA', 8, 52); q.fillText('DR. A. VARELA', 8, 68); });
    const cm = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.003, 0.054), [M.ceramic, M.ceramic, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.5 }), M.ceramic, M.ceramic, M.ceramic]); cm.position.y = 0.003; g.add(cm);
    gc = 0xff5040;
  }
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: gc, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  glint.scale.setScalar(gs); glint.position.y = 0.06; g.add(glint);
  level.add(g);
  const it = { type, n, pos: g.position.clone(), mesh: g, glint, active: !opts.hidden };
  g.visible = it.active; interact.push(it); return it;
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
// --- Pavilhão Leste ---
function addPew(x, z) {   // banco de madeira da capela (encosto ao norte, voltado para o altar)
  const c = center(x, z), g = new THREE.Group(); g.position.copy(c);
  box(1.9, 0.06, 0.45, M.wood, 0, 0.46, 0.05, g); box(1.9, 0.55, 0.05, M.wood, 0, 0.74, -0.18, g);
  for (const s of [-0.9, 0.9]) box(0.06, 0.46, 0.5, M.wood, s, 0.23, 0.02, g);
  g.rotation.y = rand(-.06, .06); if (Math.random() < 0.2) { g.rotation.z = 0.04; g.position.x += 0.1; }
  level.add(g); props.push({ i: idx(x, z), block: true });
}
function addAltar(x, z) {   // altar com velas e cruz na parede sul
  const c = center(x, z), g = new THREE.Group(); g.position.copy(c);
  box(1.8, 1.0, 0.8, M.wood, 0, 0.5, 0.2, g); box(1.9, 0.02, 0.9, M.sheet, 0, 1.01, 0.2, g);
  const cm = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, emissive: 0xffa040, emissiveIntensity: 0.35, roughness: 0.6 });
  const fm = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  for (let i = 0; i < 9; i++) { const h = rand(0.08, 0.32), px = rand(-0.8, 0.8), pz = rand(-0.05, 0.5); cyl(0.022, 0.026, h, cm, px, 1.02 + h / 2, pz, g, 8); if (Math.random() < 0.7) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), fm); f.scale.y = 2; f.position.set(px, 1.04 + h, pz); g.add(f); } }
  box(0.12, 1.5, 0.06, M.wood, 0, 2.15, 0.92, g); box(0.75, 0.12, 0.06, M.wood, 0, 2.5, 0.92, g);
  level.add(g); props.push({ i: idx(x, z), block: true });
}
function addFurnace(x, z) {   // forno crematório (porta voltada para o norte, brasa no vão)
  const c = center(x, z), g = new THREE.Group(); g.position.copy(c);
  box(1.9, 2.5, 1.5, M.concrete, 0, 1.25, 0.2, g);
  box(1.05, 0.85, 0.06, M.rust, 0, 0.95, -0.57, g);
  box(0.9, 0.05, 0.03, new THREE.MeshBasicMaterial({ color: 0xff6a20 }), 0, 0.53, -0.6, g);
  cyl(0.03, 0.03, 0.5, M.steel, 0.42, 0.95, -0.66, g, 6).rotation.z = Math.PI / 2;
  level.add(g); props.push({ i: idx(x, z), block: true });
}
const ARC_RIGS = [];
function addArcRig(x, z, tx, tz) {   // poste com refletor de lâmpada de arco apontado para o centro da sala
  const c = center(x, z), g = new THREE.Group(); g.position.copy(c);
  cyl(0.045, 0.045, 2.2, M.steel, 0, 1.1, 0, g, 8); cyl(0.35, 0.38, 0.05, M.dark, 0, 0.03, 0, g, 14);
  const head = new THREE.Group(); head.position.y = 2.25; head.rotation.x = 0.35; g.add(head);
  const refl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.2, 0.45, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }));
  refl.rotation.x = Math.PI / 2; head.add(refl);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xeaf4ff, emissiveIntensity: 0 })); glow.position.z = -0.05; head.add(glow);
  const t = center(tx, tz); g.rotation.y = Math.atan2(t.x - c.x, t.z - c.z);
  level.add(g); props.push({ i: idx(x, z), block: true }); ARC_RIGS.push(glow);
}
// câmaras de privação
[[44, 2], [50, 2], [54, 3], [48, 10], [54, 11]].forEach(p => addBed(...p));
addLocker(44, 7); addLocker(52, 7); addLocker(50, 4);
addPapers(47, 7, 6); addPapers(53, 10, 4); addWheelchair(55, 6, true);
// diretoria
addDesk(61, 2); addDesk(64, 6); addShelf(58, 1); addShelf(64, 1); addLocker(58, 7); addPapers(60, 5, 9);
// sala de gravação
addDesk(59, 10); addDesk(63, 11); addShelf(64, 9); addShelf(58, 11); addPapers(62, 10, 7);
// corredor leste
addLocker(52, 13); addLocker(64, 13); addWheelchair(56, 14); addIV(47, 14); addPapers(54, 13, 4);
// capela
[45, 46, 50, 51].forEach(x => [18, 20, 22].forEach(z => addPew(x, z)));
addAltar(48, 24); addLocker(52, 16); addLocker(44, 24);
// sala de fototerapia
[[55, 16], [64, 16], [55, 24], [64, 24], [55, 20]].forEach(([x, z]) => addArcRig(x, z, 59.5, 20));
addTable(59, 20, false); addPapers(58, 22, 5); addWheelchair(62, 17, true);
// crematório
addFurnace(47, 32); addFurnace(51, 32); addFurnace(55, 32);
addTable(49, 29, true); addTable(57, 29, false); addBed(58, 31, { body: true });
addLocker(44, 30); addLocker(61, 31); addBoiler(60, 28); addPipe(44, 28, 61, 28, 2.8);
// --- esconderijo do vigia ---
addBed(39, 28); addDesk(34, 31); addShelf(39, 31); addPapers(36, 29, 6);
{ // Osmar, sentado contra a parede, com a lanterna apagada no colo
  const g = new THREE.Group(); g.position.copy(center(34, 28)); g.position.x -= 0.35; g.position.z -= 0.3; g.rotation.y = Math.PI * 0.75; level.add(g);
  const farda = new THREE.MeshStandardMaterial({ color: 0x1f2a3a, roughness: 0.95 }), pele = new THREE.MeshStandardMaterial({ color: 0x6d5d50, roughness: 0.8 });
  const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 6, 10), farda); t.position.set(0, 0.55, 0); t.rotation.x = -0.35; g.add(t);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), pele); h.position.set(0.05, 0.95, 0.12); h.rotation.z = 0.6; g.add(h);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 14), farda); cap.position.set(0.25, 0.04, 0.45); g.add(cap);
  for (const sx of [-0.11, 0.11]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.6, 4, 8), farda); l.rotation.x = Math.PI / 2; l.position.set(sx, 0.12, 0.42); g.add(l); }
  const fl2 = cyl(0.03, 0.03, 0.25, M.dark, 0.1, 0.35, 0.25, g, 8); fl2.rotation.z = 1.2;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
}
// --- galerias subterrâneas ---
addPipe(10, 35, 62, 35, 2.75); addPipe(12, 43, 50, 43, 2.85);
// ossário: prateleiras de ossos
function addBoneShelf(x, z) {
  const c = center(x, z), g = new THREE.Group(); g.position.copy(c); const [dx, dz] = wallDir(x, z); g.rotation.y = Math.atan2(-dx, -dz);
  g.position.x += dx * 0.55; g.position.z += dz * 0.55;
  box(1.9, 2.4, 0.6, M.rust, 0, 1.2, 0, g);
  const bm = new THREE.MeshStandardMaterial({ color: 0xcfc6a8, roughness: 0.75 });
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bm); sk.scale.set(0.85, 1, 1.1); sk.position.set(-0.75 + i * 0.3 + rand(-.04, .04), 0.42 + r * 0.55, -0.1); sk.rotation.y = rand(-1, 1); sk.castShadow = true; g.add(sk); if (Math.random() < 0.6) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.42, 6), bm); b.rotation.z = Math.PI / 2 + rand(-.2, .2); b.position.set(-0.75 + i * 0.3, 0.33 + r * 0.55, 0.12); g.add(b); } }
  level.add(g); props.push({ i: idx(x, z), block: true });
}
[[16, 38], [19, 38], [22, 38], [16, 41], [19, 41], [24, 41]].forEach(p => addBoneShelf(...p));
addTable(21, 40, true); addPapers(18, 40, 5);
// reservatório: tanques e encanamento
addBoiler(33, 38); addBoiler(41, 41); addLocker(42, 38); addLocker(32, 41);
// quarto da enfermeira Celeste
addBed(62, 39); addDesk(57, 42); addShelf(56, 38); addLocker(62, 42);
{ // velas e fotografias sobre a mesa e o chão
  const cm = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, emissive: 0xffa040, emissiveIntensity: 0.4, roughness: 0.6 });
  for (let i = 0; i < 12; i++) { const h = rand(0.06, 0.25); cyl(0.02, 0.024, h, cm, 59 * CS + rand(-1.6, 1.6), h / 2, 41 * CS + rand(-1, 1.4), level, 8); }
}
// pátio interno: árvore seca, banco, chafariz, portão para a rua
{
  const tr = new THREE.Group(); tr.position.copy(center(26, 46)); level.add(tr);
  const bark = new THREE.MeshStandardMaterial({ color: 0x2a221a, roughness: 1 });
  cyl(0.18, 0.28, 3.4, bark, 0, 1.7, 0, tr, 8);
  for (let i = 0; i < 7; i++) { const b = cyl(0.03, 0.08, rand(1.2, 2.2), bark, 0, 0, 0, tr, 5); b.position.set(rand(-.2, .2), rand(2.2, 3.3), rand(-.2, .2)); b.rotation.set(rand(-1, 1), rand(0, 6), rand(-1.1, 1.1)); }
  props.push({ i: idx(26, 46), block: true });
  const fo = new THREE.Group(); fo.position.copy(center(34, 47)); level.add(fo);
  cyl(1.1, 1.2, 0.5, M.concrete, 0, 0.25, 0, fo, 20); cyl(0.95, 0.95, 0.02, new THREE.MeshStandardMaterial({ color: 0x0c1410, roughness: 0.05, metalness: 0.5 }), 0, 0.45, 0, fo, 20); cyl(0.12, 0.15, 1.1, M.concrete, 0, 0.8, 0, fo, 10);
  props.push({ i: idx(34, 47), block: true });
  const bench = new THREE.Group(); bench.position.copy(center(30, 47)); bench.position.z += 0.5; level.add(bench);
  box(1.8, 0.08, 0.5, M.wood, 0, 0.45, 0, bench); box(1.8, 0.5, 0.06, M.wood, 0, 0.78, 0.25, bench);
  for (const sx of [-0.8, 0.8]) box(0.08, 0.45, 0.45, M.steel, sx, 0.22, 0, bench);
  // portão de ferro para a rua (parede sul do pátio)
  const gg = new THREE.Group(); gg.position.set(30 * CS + 1, 0, 49 * CS + 0.05); level.add(gg);
  for (let i = 0; i < 13; i++) cyl(0.02, 0.02, 2.6, M.rust, -1.5 + i * 0.25, 1.3, 0, gg, 6);
  box(3.2, 0.08, 0.06, M.rust, 0, 2.55, 0, gg); box(3.2, 0.08, 0.06, M.rust, 0, 0.3, 0, gg);
}
// a enfermeira Celeste, sentada no banco do pátio, esperando o filho
const CELESTE = new THREE.Group();
{
  const g = CELESTE; g.position.copy(center(30, 47)); g.position.z += 0.45; g.rotation.y = Math.PI; level.add(g);
  const uni = new THREE.MeshStandardMaterial({ color: 0xbdb8a8, roughness: 0.9 }), skin = new THREE.MeshStandardMaterial({ color: 0xa89484, roughness: 0.7 }), hair = new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 12), uni); torso.position.set(0, 0.92, -0.05); torso.rotation.x = 0.12; torso.scale.z = 0.75; g.add(torso);
  const lap = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 6, 12), uni); lap.rotation.x = Math.PI / 2; lap.scale.set(1.25, 1, 0.8); lap.position.set(0, 0.56, 0.17); g.add(lap);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.34, 16, 1, true), uni); skirt.material = uni.clone(); skirt.material.side = THREE.DoubleSide; skirt.position.set(0, 0.36, 0.34); g.add(skirt);
  const shawl = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1, side: THREE.DoubleSide })); shawl.scale.set(1.05, 0.9, 0.85); shawl.position.set(0, 1.12, -0.04); g.add(shawl);
  for (const sx of [-0.1, 0.1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 4, 8), skin); leg.position.set(sx, 0.25, 0.38); g.add(leg); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), skin); head.position.set(0, 1.38, 0.02); head.scale.set(0.9, 1.1, 1); g.add(head);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hair); bun.position.set(0, 1.4, -0.01); g.add(bun);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0xe8e4d8 })); cap.position.set(0, 1.5, 0.02); g.add(cap);
  for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 8), uni); arm.position.set(sx * 0.2, 0.85, 0.12); arm.rotation.x = -0.9; g.add(arm); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
}
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
const BLOODY = { necroterio: 0.6, autopsia: 0.6, pacientes: 0.45, corredor: 0.3, subsolo: 0.25, enfermaria: 0.25, admin: 0.12, recepcao: 0.15, rua: 0, galerias: 0.3, ossario: 0.5, reservatorio: 0.2, quarto: 0.1, patio: 0, leste: 0.35, privacao: 0.55, diretoria: 0.2, gravacao: 0.15, capela: 0.3, fototerapia: 0.5, crematorio: 0.45 };
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
// pilhas em lugares sorteados a cada partida (12 de 22 pontos possíveis)
[[17, 10], [41, 10], [40, 18], [30, 24], [13, 17], [8, 6], [3, 30], [55, 7], [46, 30], [63, 14], [57, 23], [62, 10], [4, 13], [33, 13], [21, 3], [11, 10], [45, 3], [58, 10], [47, 22], [50, 29], [25, 43], [44, 39]]
  .map(p => [Math.random(), p]).sort((a, b) => a[0] - b[0]).slice(0, 12).forEach(([, p]) => addBattery(...p));

/* ---------------------------------------------------------------
   LORE — bilhetes, prontuários, fitas do Dr. Varela
   (a história completa está em documento-de-design/LORE.md)
   --------------------------------------------------------------- */
// capítulo I — prédio principal
addNote(22, 22, 'BILHETE — VIGIA OSMAR', 'PLANTÃO 03/11/87\n\nSe a luz cair, NÃO desça.\n\nEle arrancou os 5 fusíveis do quadro e espalhou pelos setores. Eu sei onde estão: enfermaria, segurança, isolamento, gaveta 7, gerador.\n\nSe você achar isto, religue o QG-1. Ele não gosta quando o prédio acende.\n\n— Osmar');
addNote(20, 5, 'PRONTUÁRIO P-14 (FRAGMENTO)', 'TOMÁS AURÉLIO REIS — 19 anos.\nInternado em 04/1982 a pedido do pai.\nQueixa: "medo da luz", crises de pânico ao amanhecer.\nEncaminhado ao Programa Noite Longa (Pavilhão Leste) pelo Dr. Antônio Varela.\n\nEvolução, mês 9: fotofobia extrema. Pupilas não contraem. Pele despigmentada. Orienta-se no escuro absoluto.\nSorri quando apagam a luz do corredor.\n\nO Dr. Varela proibiu lanternas na ala.');
addNote(10, 20, 'BILHETE RASGADO', 'Gaveta 7 aberta de novo.\nPOR DENTRO.\n\nEtiqueta no pé: P-14.\n\nNão fiquem no escuro. Ele enxerga melhor no escuro.');
addNote(10, 29, 'DIÁRIO DO VIGIA — ÚLTIMA PÁGINA', 'Mirei a lanterna nele e ele GRITOU. Fugiu correndo.\n\nEle foge de qualquer luz, até da minha lanterna velha. Mas volta. Sempre volta.\n\nA lanterna é a única coisa entre mim e ele, e a bateria não dura.\n\nOuvi a voz da enfermeira Celeste no alto-falante de novo. Ela e o Dr. Varela não saem do Pavilhão Leste desde 84. Como eles comem? E quem leva comida pra ele?');
addNote(30, 2, 'LIVRO DE OCORRÊNCIAS — SEGURANÇA', '12/03/83, 23h40 — Gritos no Pavilhão Leste durante "sessão de reexposição". Dr. Varela dispensou a equipe.\n\n13/03/83 — Paciente 14 (Tomás A. Reis) em óbito. Corpo descido ao necrotério já formolizado, por ordem do Dr. Varela. O pai não atende o telefone.\n\n16/03/83 — Gaveta 7 aberta. Por dentro. Corpo ausente. Dr. Varela diz que foi transferido. Não houve transferência.\n\n02/84 — Pavilhão Leste lacrado. Porta corta-fogo com trava eletromagnética ligada ao QG-1.\n\n03/11/87 — Osmar não respondeu ao rádio às 02h.');
addNote(40, 23, 'LAUDO DE NECROPSIA Nº 113/83', 'Identificação: P-14, masculino, 19 anos.\nCausa mortis: parada cardiorrespiratória.\n\n(riscado à caneta, ainda legível:)\nQueimaduras de 2º e 3º grau em face, pescoço e tórax. Córneas opacificadas. Padrão compatível com exposição prolongada a fonte luminosa de altíssima intensidade.\n\nObs.: corpo recebido já injetado com formol.\nNinguém nesta sala assinou isso.\n— Dr. Saulo, legista');
addNote(3, 2, 'CARTA NUNCA ENVIADA', 'Mãe,\n\naqui não tem janela. O doutor Varela diz que meus olhos estão aprendendo. Eu acho que estão esquecendo.\n\nNo começo eu chorava quando apagavam a luz. Agora eu choro quando acendem.\n\nEle diz que, quando eu estiver pronto, vai me mostrar a luz de novo. Uma luz tão forte que vai me curar.\n\nEu não quero ficar curado. Eu quero ir pra casa.\n\n— Tomás');
addNote(41, 13, 'AVISO — MANUTENÇÃO', 'PAVILHÃO LESTE INTERDITADO (02/1984)\n\nPorta corta-fogo com trava eletromagnética alimentada pelo Quadro Geral QG-1.\nSem energia = porta travada.\n\nNÃO RELIGAR O QG-1 SEM AUTORIZAÇÃO DA DIRETORIA.');
// capítulo II — Pavilhão Leste
addNote(47, 6, 'REGRAS DO PROGRAMA NOITE LONGA', '1. Nenhuma fonte de luz na ala. Fósforos, isqueiros e relógios com mostrador luminoso serão confiscados.\n\n2. Refeições pela gaveta da porta. Não falar com os pacientes.\n\n3. Funcionários usam os óculos noturnos. NUNCA acender lanterna perto da câmara 3.\n\n4. Gritos fazem parte do tratamento.\n\n— Dr. Antônio Varela, diretor clínico');
addNote(54, 6, 'ESCALA DE PLANTÃO — NOITE LONGA', 'Dr. A. Varela — sessões e gravações.\nEnf.-chefe Celeste Amaral — alimentação da câmara 3 (gaveta da porta, 06h e 18h). Única autorizada a falar com o paciente 14.\n\nAnotação a lápis, letra de mulher:\n"Ele pergunta todo dia que horas são lá fora. Eu minto. Digo que ainda é noite."');
addNote(46, 4, 'RABISCOS NA PAREDE (CÂMARA 1)', '270 refeições.\n\nEsqueci a cor do céu.\n\nO doutor respira do outro lado da porta. Ele fica olhando.\nEu também vejo ele agora.\n\nEu vejo tudo agora.\n\n— T.');
addNote(51, 17, 'DIÁRIO DO PADRE INÁCIO', 'Pediram que eu abençoasse uma gaveta vazia. Abençoei.\n\nAs velas da capela se apagam sozinhas quando ele passa no corredor. O Dr. Varela vem aqui toda noite, acende todas de novo e reza. Não para Deus. Para o menino.\n\nEle me disse: "Enquanto houver luz aqui, ele não entra."\n\nEntão por que as pegadas molhadas de formol chegam até o altar?');
addNote(53, 28, 'ORDEM DE SERVIÇO 11/1984', 'Incinerar todos os prontuários do Programa Noite Longa.\n\nNÃO incinerar as fitas da sala de gravação.\nNÃO abrir a câmara 3.\nNÃO incinerar o conteúdo da gaveta 7.\n\nJá tentamos. Ele não estava lá dentro quando o forno acendeu.\n\n— Diretoria Clínica');
addNote(62, 9, 'ETIQUETA DO ARQUIVO', 'FITAS — PROGRAMA NOITE LONGA\nSessões 001 a 094 (1982–1983)\n\nTodas as fitas foram retiradas. Faltam três.\nUma voltou para a câmara 3. Uma está aqui. A última o doutor leva para a capela.');

// fitas, lâmpadas de arco e o cartão da diretoria
const LETTER = ['CARTA DO DR. ANTÔNIO VARELA', 'Senhor eletricista,\n\nquando o senhor ler isto, eu já terei tomado o frasco inteiro. Quatro anos esperando alguém religar a luz deste lugar e, quando finalmente acontece, descubro que não tenho coragem de encarar o que vem depois.\n\nO cartão no meu bolso abre a sala de fototerapia. A porta da frente não abre com cartão nenhum: a trava de segurança só cede com uma sobrecarga na rede. A descarga das lâmpadas de arco faz isso.\n\nDez mil lux. Foi assim que eu matei o Tomás. É a única coisa que pode terminar o que eu comecei.\n\nA Celeste vai falar com o senhor pelo alto-falante. Confie nela mais do que confiaria em mim: foi ela que alimentou o menino durante nove meses e nunca deixou de ir até a gaveta.\n\nEscondi as três lâmpadas dele: uma no forno do crematório, uma no altar da capela e uma na câmara fria do necrotério, onde ele dormiu três dias.\n\nEncaixe as três no console. Depois apague a sua lanterna: ele não chega perto de quem carrega luz. Deixe que ele o siga para dentro da sala, e só então acione a descarga. E não olhe para a luz.\n\nPeça perdão a ele por mim. Ele não vai ouvir.\n\n— A. Varela'];
const TAPES = [[1, 30, 4], [2, 24, 10], [3, 52, 1], [4, 60, 9], [5, 52, 9], [6, 62, 23], [7, 57, 39], [8, 22, 39], [9, 37, 30]].map(([n, x, z]) => addPickup('tape', n, x, z));
const MANDATORY_TAPES = [3, 4, 5];
const PHOTOS = [[1, 11, 3], [2, 38, 10], [3, 12, 25], [4, 53, 4], [5, 52, 23], [6, 36, 39]].map(([n, x, z]) => addPickup('foto', n, x, z));
[[19, 24], [7, 30], [50, 13], [56, 30], [20, 43], [61, 38]].forEach(([x, z]) => addPickup('flare', 1, x, z));
[[24, 6], [8, 13], [30, 20], [49, 11], [46, 28], [40, 35]].forEach(([x, z]) => addPickup('bottle', 1, x, z));
addNote(38, 29, 'DIÁRIO DO OSMAR — ESCONDERIJO', 'Montei este canto atrás da autópsia em 1985, quando parei de fazer a ronda no Pavilhão Leste.\n\nNinguém sabe que ele existe. Ele sabe. Ele sabe de tudo.\n\nMas não entra aqui: eu deixo a lâmpada acesa a noite inteira.\n\nHoje a lâmpada queimou.');   // as três sessões do Dr. Varela revelam o código do escritório
const CRANK = addPickup('crank', 1, 59, 41);
addNote(60, 42, 'FOTOGRAFIA', 'Uma praia, um dia de sol forte. Uma mulher de cabelo preso abraça um menino de uns oito anos que cobre os olhos com a mão e ri.\n\nNo verso, a lápis:\n"Celeste e Tomás — Cabo Frio, 1971.\nEle reclamou do sol o dia inteiro."');
addNote(36, 35, 'PLACA ENFERRUJADA', 'GALERIA DE SERVIÇO — 1931\n\nAcesso: crematório · subsolo · pátio interno\n\nO portão do pátio só abre com a manivela da enfermaria.');
addNote(44, 43, 'BILHETE DA CELESTE', 'Senhor eletricista,\n\nse o senhor chegou até aqui, ainda dá tempo. O sol nasce às 6h04.\n\nNão o machuque mais. Ele só quer sair daqui. Eu também.\n\n— C.');
TAPES.forEach(t => { t.mesh.userData.tape = t.n; });
const LAMPS = [addPickup('lamp', 1, 51, 31, { hidden: true }), addPickup('lamp', 2, 48, 23, { hidden: true }), addPickup('lamp', 3, 4, 21, { hidden: true })];
// quando só falta uma lâmpada, ela aparece na capela, ao lado do altar (fica fácil de achar)
function lastLampToChapel(silent) {
  if (PROG.ch !== 3 || PROG.burned) return;
  const left = LAMPS.filter(l => l.active);
  if (left.length !== 1 || PROG.lamps.length + P.lamps.length !== 2) return;
  const l = left[0], c = center(50, 23); if (Math.hypot(l.pos.x - c.x, l.pos.z - c.z) < 1) return;
  l.mesh.position.set(c.x, l.mesh.position.y, c.z); l.pos.set(c.x, l.pos.y, c.z); l.mesh.visible = true;
  if (!silent) { msg('Um baque metálico ecoa na capela. A última lâmpada de arco está lá, ao lado do altar.', 5); SFX.clank({ x: c.x, y: 1, z: c.z }); }
}
const CARD = addPickup('card', 1, 62, 5);
{ // o Dr. Varela, caído ao lado da mesa (frasco de pentobarbital vazio)
  const c = center(62, 5), g = new THREE.Group(); g.position.set(c.x + 0.3, 0, c.z - 0.2); g.rotation.y = 0.7;
  const coat = new THREE.MeshStandardMaterial({ color: 0xcfcab8, roughness: 0.95 });
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 10), coat); b.rotation.z = Math.PI / 2; b.position.y = 0.2; b.scale.set(1, 1, 0.75); b.castShadow = true; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.7 })); h.position.set(0.85, 0.16, 0.05); g.add(h);
  box(0.03, 0.1, 0.03, new THREE.MeshPhysicalMaterial({ color: 0x5a3a10, transparent: true, opacity: 0.7, roughness: 0.1 }), 1.0, 0.03, 0.4, g).rotation.z = Math.PI / 2;
  level.add(g);
}

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
exitDoor.it = { type: 'exit', pos: new THREE.Vector3(22 * CS, 0, 25 * CS + 0.6), active: true }; interact.push(exitDoor.it);

/* ---------------------------------------------------------------
   PORTAS TRAVADAS DO PAVILHÃO LESTE (corta-fogo, teclado, leitor de cartão)
   --------------------------------------------------------------- */
const DOORS = {};
function makeDoor(key, cells, w, d, cx, cz, ipos, panelPos, panelRotY) {
  const mesh = box(w, CFG.wallH, d, M.door, cx, CFG.wallH / 2, cz);
  const door = { key, cells, mesh, open: 0, opening: false, applied: false };
  if (panelPos) {   // teclado / leitor com luz vermelha → verde
    const g = new THREE.Group(); g.position.copy(panelPos); g.rotation.y = panelRotY; level.add(g);
    box(0.16, 0.24, 0.05, M.dark, 0, 0, 0, g);
    for (let i = 0; i < 9; i++) box(0.03, 0.025, 0.012, M.steel, -0.04 + (i % 3) * 0.04, 0.05 - Math.floor(i / 3) * 0.04, 0.03, g);
    door.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010 })); door.lamp.position.set(0, -0.09, 0.03); g.add(door.lamp);
  }
  if (ipos) { door.it = { type: 'door', door, pos: ipos, active: true }; interact.push(door.it); }
  DOORS[key] = door; return door;
}
makeDoor('fogo', [[43, 13], [43, 14]], 0.35, 2 * CS, 43 * CS + 1, 14 * CS, new THREE.Vector3(42 * CS + 1.3, 0, 14 * CS));
{ // placa na porta corta-fogo
  const t = tex(512, 256, (g, w, h) => { g.fillStyle = '#b8901c'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; for (let i = -h; i < w; i += 60) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 30, 0); g.lineTo(i + 30 + h, h); g.lineTo(i + h, h); g.fill(); } g.fillStyle = '#d9d2bc'; g.fillRect(30, 60, w - 60, h - 120); g.fillStyle = '#7a1510'; g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.fillText('PAVILHÃO LESTE', w / 2, 112); g.fillStyle = '#111'; g.font = 'bold 26px monospace'; g.fillText('INTERDITADO · 1984', w / 2, 160); grime(g, w, h, 20, 'rgba(60,40,10,A)', 10, 50, .5); });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 })); p.rotation.y = -Math.PI / 2; p.position.set(-0.18, 0.2, 0); DOORS.fogo.mesh.add(p);
}
makeDoor('office', [[57, 6]], 0.25, CS, 57 * CS + 1, 6 * CS + 1, new THREE.Vector3(56 * CS + 1.2, 0, 6 * CS + 1), new THREE.Vector3(57 * CS - 0.03, 1.35, 7 * CS + 0.5), -Math.PI / 2);
makeDoor('foto', [[59, 15]], CS, 0.25, 59 * CS + 1, 15 * CS + 1, new THREE.Vector3(59 * CS + 1, 0, 14 * CS + 1.2), new THREE.Vector3(58 * CS + 1.4, 1.3, 15 * CS - 0.03), Math.PI);
makeDoor('foto2', [[60, 26]], CS, 0.25, 60 * CS + 1, 26 * CS + 1, new THREE.Vector3(60 * CS + 1, 0, 27 * CS + 0.8), new THREE.Vector3(61 * CS + 0.4, 1.3, 27 * CS + 0.03), 0);
DOORS.foto2.it.reader = DOORS.foto.it.reader = true;
makeDoor('capela', [[48, 15]], CS, 0.25, 48 * CS + 1, 15 * CS + 1, new THREE.Vector3(48 * CS + 1, 0, 14 * CS + 1.2));
makeDoor('alcapao', [[53, 33]], CS, 0.25, 53 * CS + 1, 33 * CS + 1, new THREE.Vector3(53 * CS + 1, 0, 32 * CS + 0.8));
makeDoor('grade', [[15, 33]], CS, 0.25, 15 * CS + 1, 33 * CS + 1, new THREE.Vector3(15 * CS + 1, 0, 32 * CS + 0.8));
makeDoor('patio', [[30, 44]], CS, 0.25, 30 * CS + 1, 44 * CS + 1, new THREE.Vector3(30 * CS + 1, 0, 43 * CS + 1.2));
{ // portão do pátio: grade de ferro (dá para ver a Celeste do outro lado)
  const d = DOORS.patio; d.mesh.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 9; i++) { const b = cyl(0.025, 0.025, CFG.wallH, M.rust, -0.9 + i * 0.225, 0, 0, d.mesh, 6); b.castShadow = true; }
  for (const y of [-1.2, 0, 1.2]) box(2, 0.06, 0.06, M.rust, 0, y, 0, d.mesh);
  // grade do subsolo também é vazada
  const gd = DOORS.grade; gd.mesh.material = d.mesh.material;
  for (let i = 0; i < 9; i++) cyl(0.02, 0.02, CFG.wallH, M.rust, -0.9 + i * 0.225, 0, 0, gd.mesh, 6);
}
// portão do pátio para a rua (só abre ao amanhecer)
const STREET = { type: 'street', pos: new THREE.Vector3(30 * CS + 1, 0, 48 * CS + 1.2), active: false }; interact.push(STREET);
// o sol nascendo sobre o pátio (luz com sombra, só acende no final)
const SUN = new THREE.SpotLight(0xffc38a, 0, 40, 0.75, 0.6, 1.2); SUN.position.set(30.5 * CS, 18, 52 * CS); SUN.target.position.set(30.5 * CS, 0, 46.5 * CS); scene.add(SUN); scene.add(SUN.target);
function openDoor(d, instant) {
  if (!d || d.opening) return; d.opening = true; if (d.it) d.it.active = false;
  if (d.lamp) d.lamp.material.color.set(0x30ff60);
  if (instant) { d.open = 1; d.mesh.position.y = CFG.wallH / 2 + CFG.wallH - 0.3; applyDoor(d); }
  else SFX.door();
}
function applyDoor(d) { if (d.applied) return; d.applied = true; d.cells.forEach(([x, z]) => { grid[idx(x, z)] = '.'; }); rebuildBlocked(); computeLightGrid(); }
function updateDoors(dt) {
  for (const k in DOORS) { const d = DOORS[k]; if (!d.opening || d.open >= 1) continue; d.open = Math.min(1, d.open + dt / 2.2); d.mesh.position.y = CFG.wallH / 2 + d.open * (CFG.wallH - 0.3); if (d.open > 0.5) applyDoor(d); }
}

/* ---------------------------------------------------------------
   CONSOLE DA FOTOTERAPIA — 3 lâmpadas de arco, descarga de 10.000 lux
   --------------------------------------------------------------- */
const CONSOLE = { sockets: [], pos: new THREE.Vector3(64 * CS + 0.2, 0, 20 * CS + 1) };
{
  const g = new THREE.Group(); g.position.set(64 * CS + 1.1, 0, 20 * CS + 1); g.rotation.y = -Math.PI / 2; level.add(g);
  box(1.8, 1.0, 0.8, M.dark, 0, 0.5, 0, g);
  const top = box(1.8, 0.06, 0.6, M.steel, 0, 1.08, 0.1, g); top.rotation.x = -0.35;
  for (let i = 0; i < 3; i++) {
    const x = -0.55 + i * 0.55, s = { lamp: null };
    cyl(0.09, 0.09, 0.08, M.ceramic, x, 1.16, 0.12, g, 16);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0xdfeaff, emissive: 0x88aaff, emissiveIntensity: 0.4, transparent: true, opacity: 0.6 })); l.position.set(x, 1.34, 0.12); l.visible = false; g.add(l);
    s.lamp = l; s.pilot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0x401010 })); s.pilot.position.set(x, 0.85, 0.41); g.add(s.pilot);
    CONSOLE.sockets.push(s);
  }
  const lev = cyl(0.03, 0.03, 0.5, M.steel, 0.8, 1.3, 0.1, g, 8); lev.rotation.x = -0.6; CONSOLE.lever = lev;
  cyl(0.05, 0.05, 0.1, new THREE.MeshStandardMaterial({ color: 0x7a1510 }), 0.8, 1.52, -0.04, g, 10);
  const plate = tex(256, 64, (q, w, h) => { q.fillStyle = '#c9c1a6'; q.fillRect(0, 0, w, h); q.fillStyle = '#111'; q.font = 'bold 20px monospace'; q.textAlign = 'center'; q.fillText('FOTOTERAPIA · 10.000 LX', w / 2, 40); });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshStandardMaterial({ map: plate })); pl.position.set(0, 0.7, 0.41); g.add(pl);
  props.push({ i: idx(64, 20), block: true });
  CONSOLE.show = i => { const s = CONSOLE.sockets[i]; if (!s) return; s.lamp.visible = true; s.pilot.material.color.set(0x40ff70); };
  interact.push({ type: 'console', pos: CONSOLE.pos, active: true });
}
rebuildBlocked();
const FOTO = { cool: 0, flashT: 0, light: new THREE.PointLight(0xeef6ff, 0, 28, 1.4) };
FOTO.light.position.set(60 * CS, 2.6, 20.5 * CS); scene.add(FOTO.light);


/* ---------------------------------------------------------------
   LUZES DO MUNDO (+ grade de luz para a IA)
   --------------------------------------------------------------- */
const LIGHTS = [];
const LIGHT_POOL = []; for (let i = 0; i < 10; i++) { const p = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(p); LIGHT_POOL.push(p); }
function addLight(cx, cz, color, intensity, range, strength, sector, on, kind = 'fluo') {
  const pos = new THREE.Vector3(cx * CS, CFG.wallH - 0.25, cz * CS);
  const L = { intensity: on ? intensity : 0, color: new THREE.Color(color) };   // luz virtual (o pool desenha as mais próximas)
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
// Pavilhão Leste (energizado no capítulo II): emergência vermelha, velas da capela, brasa dos fornos, abajur do Dr. Varela
[48.5, 56.5, 63.5].forEach(x => addLight(x, 14, 0xff2a18, 5, 7, 0.3, 'leste', false, 'red'));
addLight(48.5, 23.6, 0xff9a40, 9, 9, 0.55, 'capela', false, 'red');
addLight(51.5, 31, 0xff6a20, 7, 10, 0.45, 'crematorio', false, 'red');
addLight(61.5, 3.5, 0xffd9a0, 12, 8, 0.7, 'diretoria', false, 'red');
// galerias (capítulo IV): emergência vermelha esparsa, vela no quarto da Celeste, lua no pátio
[[20, 35.5], [38, 35.5], [55, 35.5], [28, 43.5], [46, 43.5]].forEach(([x, z]) => addLight(x, z, 0xff2a18, 4, 7, 0.3, 'galerias', false, 'red'));
addLight(59, 40, 0xffa050, 8, 8, 0.5, 'quarto', false, 'red');
addLight(37, 29.5, 0xffd9a0, 6, 7, 0.4, 'vigia', true, 'red');
const moon = addLight(30.5, 47, 0x6d84a8, 6, 14, 0.35, 'patio', false, 'red'); moon.fixture.visible = false; moon.pos.y = 7;

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
const fl = { on: true, focus: false, battery: 100, deadFlicker: 0 };
/* ---------------------------------------------------------------
   VIEWMODEL — lanterna de alumínio anodizado (anos 80) em 1ª pessoa, sem mão.
   Renderizada numa segunda passada (cena própria, profundidade limpa)
   para nunca atravessar paredes; iluminada pela luz do ambiente ao redor.
   --------------------------------------------------------------- */
const vmScene = new THREE.Scene();
const vmRoot = new THREE.Group(); vmRoot.matrixAutoUpdate = false; vmScene.add(vmRoot);
const vmHemi = new THREE.HemisphereLight(0x8899aa, 0x080606, 0.2); vmScene.add(vmHemi);
const vmKey = new THREE.DirectionalLight(0xffffff, 0.3); vmKey.position.set(-0.4, 1, 0.3); vmScene.add(vmKey);
const vmBounce = new THREE.PointLight(0xffd7a8, 0, 0.9, 2); vmScene.add(vmBounce);
const hand = new THREE.Group(); vmRoot.add(hand); hand.position.set(0.2, -0.2, -0.36);   // "hand" = ponto onde a lanterna é segurada
const handAnchor = new THREE.Group(); camera.add(handAnchor);   // cópia invisível na cena principal (carrega o SpotLight)
const carried = new THREE.Group(); vmRoot.add(carried); carried.position.set(-0.26, -0.26, -0.42);
handAnchor.add(flash); flash.position.set(0, 0, -0.12); handAnchor.add(flash.target); flash.target.position.set(-0.2, 0.2, -6);
const TORCH = buildTorch(); hand.add(TORCH.root);
function buildTorch() {
  const T2 = {};
  // --- reflexo do ambiente: sem envMap o metal fica preto; uma sala escura com uma fluorescente e um brilho morno ---
  const envTex = tex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4a4d52'); gr.addColorStop(0.42, '#1d1e20'); gr.addColorStop(0.55, '#0e0e0f'); gr.addColorStop(1, '#040404');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    grime(g, w, h, 8, 'rgba(255,225,180,A)', 6, 22, .35);
    g.fillStyle = 'rgba(235,242,255,.9)'; g.fillRect(w * 0.28, 10, w * 0.2, 4); g.fillRect(w * 0.72, 14, w * 0.12, 3);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, h * 0.47, w, 2);
  });
  envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.wrapS = envTex.wrapT = THREE.ClampToEdgeWrapping;
  // --- anodizado preto fosco com desgaste (tampa e cabeça) ---
  const anod = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#18191b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const v = rand(16, 34) | 0; g.fillStyle = `rgba(${v},${v},${v + 3},.6)`; g.fillRect(Math.random() * w, Math.random() * h, rand(1, 2), 1); }
    // riscos finos de uso (alumínio cru por baixo)
    for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(${rand(140, 200) | 0},${rand(140, 200) | 0},${rand(145, 205) | 0},${rand(.12, .5)})`; g.lineWidth = rand(.3, 1); const x = Math.random() * w, y = Math.random() * h, a = rand(-.4, .4) + (Math.random() < .5 ? 0 : Math.PI / 2), l = rand(3, 34); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    // lascas e bordas gastas
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(165,166,172,${rand(.25, .6)})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(1, 5), rand(.5, 2), rand(0, 3), 0, 7); g.fill(); }
    grime(g, w, h, 14, 'rgba(70,60,45,A)', 10, 40, .25);   // sujeira/gordura
  });
  // --- corpo: recartilhado em diamante de verdade (altura → normal), faixa lisa com etiqueta, área do botão lisa ---
  const KN = 1024, PITCH = 16;
  const knZone = v => (v > 0.05 && v < 0.47) || (v > 0.69 && v < 0.85);
  const LBL = { u0: 0.59, u1: 0.87, v0: 0.5, v1: 0.665 };
  const inLbl = (u, v) => u > LBL.u0 && u < LBL.u1 && v > LBL.v0 && v < LBL.v1;
  const knH = (x, y) => { const a = (x + y) / PITCH, b = (x - y) / PITCH; const ta = Math.abs(a - Math.floor(a) - 0.5) * 2, tb = Math.abs(b - Math.floor(b) - 0.5) * 2; return Math.min(1, Math.min(ta, tb) * 1.45); };
  const barH = tex(KN, KN, (g, w, h) => {
    const im = g.createImageData(w, h), d = im.data;
    for (let y = 0; y < h; y++) {
      const v = 1 - y / h, kz = knZone(v);
      for (let x = 0; x < w; x++) {
        let hv = 0.55; if (kz) hv = 0.12 + 0.78 * knH(x, y);
        if (inLbl(x / w, v)) hv = 0.66;
        const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = hv * 255; d[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    g.fillStyle = '#2a2a2a'; for (const v of [0.05, 0.47, 0.69, 0.85]) g.fillRect(0, (1 - v) * h - 2, w, 4);   // ranhuras torneadas
  }, 1, 1, false);
  const barC = tex(KN, KN, (g, w, h) => {
    const src = barH.image.getContext('2d').getImageData(0, 0, w, h).data, im = g.createImageData(w, h), d = im.data;
    for (let y = 0; y < h; y++) {
      const v = 1 - y / h, kz = knZone(v), edge = Math.min(v, 1 - v);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, hv = src[i] / 255; let c = 22 + Math.random() * 7;
        if (kz && hv > 0.8) c += (hv - 0.8) * 520 * (0.5 + 0.5 * Math.random());      // pontas do diamante gastas = alumínio aparente
        if (edge < 0.03 && Math.random() < 0.35) c += rand(40, 110);                   // bordas batidas
        d[i] = c; d[i + 1] = c; d[i + 2] = c + 3; d[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(175,176,182,${rand(.15, .45)})`; g.lineWidth = rand(.4, 1.4); const x = Math.random() * w, y = Math.random() * h, a = rand(0, 6.3), l = rand(6, 60); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    grime(g, w, h, 20, 'rgba(60,50,35,A)', 15, 60, .2);
    // etiqueta de patrimônio colada, amarelada e descascando
    const lx = LBL.u0 * w, ly = (1 - LBL.v1) * h, lw = (LBL.u1 - LBL.u0) * w, lh = (LBL.v1 - LBL.v0) * h;
    g.save(); g.translate(lx, ly);
    g.fillStyle = '#cbc1a0'; g.fillRect(0, 0, lw, lh);
    g.fillStyle = 'rgba(110,85,35,.3)'; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(rand(0, lw), rand(0, lh), rand(5, 30), 0, 7); g.fill(); }
    g.fillStyle = '#2a2622'; g.font = 'bold 26px monospace'; g.fillText('INST. S. LÁZARO', 14, 38); g.font = '22px monospace'; g.fillText('PATRIMÔNIO', 14, 74); g.font = 'bold 44px monospace'; g.fillText('Nº 0347', 14, 124); g.font = '20px monospace'; g.fillText('MANUTENÇÃO', 14, 156);
    g.fillStyle = 'rgba(24,25,27,.92)'; g.beginPath(); g.moveTo(lw - 60, 0); g.lineTo(lw, 0); g.lineTo(lw, 70); g.fill(); g.fillRect(0, lh - 14, 70, 14);   // pedaços arrancados
    speckle(g, lw, lh, 500, .15);
    g.restore();
  });
  // --- refletor: casca de laranja (leve martelado) ---
  const peel = tex(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const v = rand(90, 170) | 0; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, rand(2, 5), 0, 7); g.fill(); } }, 1, 1, false);
  const anodMaps = deriveMaps(anod, 3, 0.3, 0.6), barMaps = deriveMaps(barH, 5, 0.22, 0.62), peelMaps = deriveMaps(peel, 2, 0.05, 0.14);
  const MA = new THREE.MeshStandardMaterial({ map: anod, normalMap: anodMaps.normalMap, roughnessMap: anodMaps.roughnessMap, roughness: 1, metalness: 0.75, envMap: envTex });
  const MB = new THREE.MeshStandardMaterial({ map: barC, normalMap: barMaps.normalMap, roughnessMap: barMaps.roughnessMap, roughness: 1, metalness: 0.78, envMap: envTex });
  MB.normalScale.set(1.4, 1.4);
  const MR = new THREE.MeshStandardMaterial({ color: 0xe2e2e6, metalness: 1, roughness: 1, roughnessMap: peelMaps.roughnessMap, normalMap: peelMaps.normalMap, side: THREE.DoubleSide, envMap: envTex, emissive: 0x000000 });
  const MSteel = new THREE.MeshStandardMaterial({ color: 0xa9adb2, metalness: 1, roughness: 0.32, envMap: envTex });
  const MRub = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.82, envMap: envTex, envMapIntensity: 0.2 });
  const root = new THREE.Group(); T2.root = root;
  // alinha o eixo da lanterna com a direção do feixe
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-0.2, 0.2, -6).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.95));
  // perfis em (raio, comprimento): 0 = traseira, 0.2622 = frente da lente; toZ põe o eixo em -Z
  const toZ = geo => { geo.translate(0, -0.14, 0); geo.rotateX(-Math.PI / 2); return geo; };
  const latheG = (pts, seg = 56) => toZ(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
  // tampa traseira com anéis de pegada e fundo levemente côncavo
  root.add(new THREE.Mesh(latheG([[0, 0.0012], [0.008, 0.0008], [0.0115, 0], [0.0158, 0.0009], [0.018, 0.0032], [0.0193, 0.0072], [0.0196, 0.0092], [0.0196, 0.0118], [0.0187, 0.0124], [0.0187, 0.0142], [0.0196, 0.0148], [0.0196, 0.0178], [0.0187, 0.0184], [0.0187, 0.0202], [0.0196, 0.0208], [0.0196, 0.0238], [0.0187, 0.0244], [0.0187, 0.0262], [0.0196, 0.0268], [0.0196, 0.031], [0.0189, 0.0328], [0.0185, 0.034], [0.0185, 0.0372]]), MA));
  // corpo recartilhado
  const barrel = new THREE.Mesh(toZ(new THREE.CylinderGeometry(0.019, 0.019, 0.129, 64, 1, true).translate(0, 0.1005, 0)), MB);
  barrel.rotation.z = 2.3; root.add(barrel);
  // anéis de vedação aparecendo nas roscas
  for (const y of [0.0365, 0.1652]) { const o = new THREE.Mesh(new THREE.TorusGeometry(0.01875, 0.0009, 8, 48), MRub); o.position.z = -(y - 0.14); root.add(o); }
  // cabeça: pescoço, alargamento com ranhuras e aro de aço com ameias
  const head = new THREE.Group(); root.add(head); T2.head = head;
  head.add(new THREE.Mesh(latheG([[0.0184, 0.1655], [0.0192, 0.1665], [0.0192, 0.171], [0.0186, 0.1718], [0.0186, 0.1735], [0.0194, 0.1745], [0.0201, 0.179], [0.0222, 0.1875], [0.0252, 0.1975], [0.0273, 0.2035], [0.0281, 0.2075], [0.0281, 0.2115], [0.0274, 0.2125], [0.0274, 0.2155], [0.0281, 0.2165], [0.0281, 0.2195], [0.0274, 0.2205], [0.0274, 0.2235], [0.0281, 0.2245], [0.0281, 0.2275], [0.0274, 0.2285], [0.0274, 0.2315], [0.0281, 0.2325], [0.0281, 0.2435], [0.0275, 0.2445]]), MA));
  head.add(new THREE.Mesh(latheG([[0.0274, 0.2440], [0.0288, 0.2448], [0.0294, 0.2462], [0.0294, 0.2585], [0.0289, 0.2597], [0.0262, 0.2597], [0.0248, 0.2590], [0.0246, 0.2575]]), MSteel));
  const MSteel2 = MSteel.clone(); MSteel2.side = THREE.DoubleSide;
  for (let i = 0; i < 8; i++) {   // ameias do aro (deixam a luz vazar quando encostada na parede)
    const a = (i + 0.5) / 8 * Math.PI * 2;
    head.add(new THREE.Mesh(toZ(new THREE.LatheGeometry([[0.0262, 0.2596], [0.0294, 0.2596], [0.0294, 0.2624], [0.0262, 0.2624], [0.0262, 0.2596]].map(([r, y]) => new THREE.Vector2(r, y)), 4, a - 0.22, 0.44)), MSteel2));
  }
  // refletor parabólico martelado
  const rp = []; for (let i = 0; i <= 14; i++) { const r = 0.0035 + (0.0246 - 0.0035) * i / 14; rp.push([r, 0.2345 + r * r / 0.0262]); }
  head.add(new THREE.Mesh(latheG(rp, 48), MR)); T2.refl = MR;
  // lâmpada incandescente: bulbo de vidro + filamento
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.25, clearcoat: 1, envMap: envTex });
  const bulbGlass = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 16, 12), glassM); bulbGlass.scale.set(1, 1, 1.35); bulbGlass.position.z = -0.1005; head.add(bulbGlass);
  const bulbBase = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 16), MSteel); bulbBase.rotation.x = Math.PI / 2; bulbBase.position.z = -0.0965; head.add(bulbBase);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, emissive: 0xffd8a0, emissiveIntensity: 0 });
  const bulb = new THREE.Mesh(new THREE.TorusGeometry(0.0013, 0.00045, 6, 14), bulbMat); bulb.position.z = -0.101; bulb.rotation.y = Math.PI / 2; head.add(bulb); T2.bulb = bulb;
  // lente de vidro (leve curvatura, reflexo)
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 40, 8, 0, Math.PI * 2, 0, 0.42), new THREE.MeshPhysicalMaterial({ color: 0xe8f0f4, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, envMap: envTex, envMapIntensity: 1.5, depthWrite: false }));
  lens.scale.set(1, 1 / 3, 1); lens.rotation.x = -Math.PI / 2; lens.position.z = -0.0989; head.add(lens);
  // botão de borracha (liga/desliga) com aro de alumínio
  const swA = -2.93, sw = new THREE.Group(); sw.rotation.z = swA; root.add(sw); T2.sw = sw; T2.swA = swA;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), MRub); dome.scale.set(0.0032, 0.0062, 0.0085); sw.add(dome);
  for (let i = 0; i < 4; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.009, 0.0007), MRub); rib.position.set(0.0029, 0, -0.005 + i * 0.0033); sw.add(rib); }
  const collarGeo = new THREE.TorusGeometry(1, 0.12, 8, 32); collarGeo.rotateY(Math.PI / 2);
  const collar = new THREE.Mesh(collarGeo, MSteel); collar.scale.set(0.007, 0.0074, 0.0098);
  const collarG = new THREE.Group(); collarG.rotation.z = swA; collarG.position.set(Math.cos(swA) * 0.0193, Math.sin(swA) * 0.0193, -0.016); collarG.add(collar); root.add(collarG);
  sw.position.set(Math.cos(swA) * 0.0205, Math.sin(swA) * 0.0205, -0.016);
  // argola e cordão (lanyard) de nylon trançado balançando
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.0011, 8, 20), MSteel); ring.position.set(0, -0.004, 0.1435); ring.rotation.y = Math.PI / 2; root.add(ring);
  const lan = new THREE.Group(); lan.position.set(0, -0.004, 0.146); root.add(lan); T2.lan = lan;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.004, -0.03, 0.012), new THREE.Vector3(0.002, -0.075, 0.006), new THREE.Vector3(-0.004, -0.09, -0.004), new THREE.Vector3(-0.004, -0.05, -0.006), new THREE.Vector3(0, 0, 0)], true);
  const cordT = tex(64, 256, (g, w, h) => { g.fillStyle = '#1b1f23'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,100,110,.5)'; g.lineWidth = 3; for (let y = -w; y < h + w; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w * 0.6); g.stroke(); } }, 2, 12);
  lan.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.0019, 8, true), new THREE.MeshStandardMaterial({ map: cordT, roughness: 0.9 })));
  T2.lanX = 0; T2.lanVX = 0; T2.lanZ = 0; T2.lanVZ = 0;
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  T2.envMats = [MA, MB, MR, MSteel, MSteel2, MRub, glassM]; T2.envMats.forEach(m => { m.userData.envBase = m.envMapIntensity; });
  T2.clickT = 0; T2.tapT = 0; T2.twist = 0; T2.aim = 0;
  return T2;
}
function updateViewmodelLight(dt) {
  // luz ambiente estimada a partir das lâmpadas próximas (a lanterna fica avermelhada no corredor, fria na recepção)
  let r = 0, g = 0, b = 0, sum = 0; const cp = camera.position;
  for (const l of LIGHTS) {
    if (l.L.intensity <= 0.01) continue; const d = l.pos.distanceTo(cp); if (d > l.range) continue;
    if (wallsBetween(l.pos.x, l.pos.z, cp.x, cp.z, 1)) continue;
    const w = l.L.intensity / (d * d + 2); r += l.L.color.r * w; g += l.L.color.g * w; b += l.L.color.b * w; sum += w;
  }
  const k = clamp(sum * 0.35, 0.02, 1.6);
  if (sum > 0) vmHemi.color.setRGB(r / sum, g / sum, b / sum); else vmHemi.color.set(0x445566);
  vmHemi.intensity = lerp(vmHemi.intensity, k, Math.min(1, dt * 6)); vmKey.intensity = vmHemi.intensity * 0.9; vmKey.color.copy(vmHemi.color);
  // luz que vaza do refletor e volta das superfícies à frente ilumina o aro e a cabeça da lanterna
  const fI = flash.intensity / CFG.flash.normalI;
  vmBounce.intensity = fI * 0.018; vmBounce.color.copy(flash.color);
  vmBounce.position.set(0, 0.02, -0.2).applyMatrix4(hand.matrix).applyMatrix4(vmRoot.matrix);
  // reflexos do metal acompanham a luz do lugar (e o rebote do próprio feixe)
  const envK = 0.15 + vmHemi.intensity * 0.85 + Math.min(fI, 4) * 0.08;
  for (const m of TORCH.envMats) m.envMapIntensity = m.userData.envBase * envK;
  TORCH.bulb.material.emissiveIntensity = fI * 8; TORCH.bulb.material.emissive.copy(flash.color);
  TORCH.refl.emissive.copy(flash.color).multiplyScalar(Math.min(fI, 4) * 0.12);
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
  carry: [], lamps: [], flares: 0, bottles: 0, installed: 0, dead: false, won: false, region: '', noiseLevel: 0
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
// Anatomia esculpida por deslocamento de vértices (costelas, coluna, órbitas fundas, tendões),
// pele cadavérica úmida (formol) com veias, livores, cicatrizes com pontos; cabelo ralo molhado.
const C = { root: new THREE.Group() };
{
  // ---------- ruído 3D suave ----------
  const h3 = (i, j, k) => { let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1440662683)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n & 0xffff) / 0xffff; };
  const vn = (x, y, z) => {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), L = (a, b, t) => a + (b - a) * t;
    return L(L(L(h3(i, j, k), h3(i + 1, j, k), u), L(h3(i, j + 1, k), h3(i + 1, j + 1, k), u), v), L(L(h3(i, j, k + 1), h3(i + 1, j, k + 1), u), L(h3(i, j + 1, k + 1), h3(i + 1, j + 1, k + 1), u), v), w) * 2 - 1;
  };
  const fbm = (x, y, z) => vn(x, y, z) * 0.6 + vn(x * 2.1 + 5, y * 2.1, z * 2.1) * 0.3 + vn(x * 4.3, y * 4.3 + 9, z * 4.3) * 0.1;
  const G = (x, s) => Math.exp(-(x * x) / (s * s));
  // normais suaves mesmo nas costuras (vértices duplicados na mesma posição)
  const weld = geo => {
    geo.computeVertexNormals(); const p = geo.attributes.position, n = geo.attributes.normal, map = new Map();
    for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(4) + ',' + p.getY(i).toFixed(4) + ',' + p.getZ(i).toFixed(4); let e = map.get(k); if (!e) { e = [0, 0, 0, []]; map.set(k, e); } e[0] += n.getX(i); e[1] += n.getY(i); e[2] += n.getZ(i); e[3].push(i); }
    for (const e of map.values()) { if (e[3].length < 2) continue; const l = Math.hypot(e[0], e[1], e[2]) || 1; for (const i of e[3]) n.setXYZ(i, e[0] / l, e[1] / l, e[2] / l); }
    n.needsUpdate = true; return geo;
  };
  // esculpe: disp(p, n) desloca ao longo da normal; col(p, n) → [r,g,b] (cavidades escuras, hematomas)
  const sculpt = (geo, disp, col) => {
    weld(geo); const p = geo.attributes.position, n = geo.attributes.normal, v = new THREE.Vector3(), nv = new THREE.Vector3(), cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); nv.fromBufferAttribute(n, i);
      const c = col ? col(v, nv) : null; cols[i * 3] = c ? c[0] : 1; cols[i * 3 + 1] = c ? c[1] : 1; cols[i * 3 + 2] = c ? c[2] : 1;
      if (disp) { v.addScaledVector(nv, disp(v, nv)); p.setXYZ(i, v.x, v.y, v.z); }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); return weld(geo);
  };
  const skinNoise = (s, a) => (p) => fbm(p.x * s, p.y * s, p.z * s) * a;
  const bruise = (k) => [1 - 0.12 * k, 1 - 0.2 * k, 1 - 0.06 * k];

  // ---------- texturas ----------
  const skinT = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#b7b3a3'; g.fillRect(0, 0, w, h);
    grime(g, w, h, 80, 'rgba(150,162,140,A)', 10, 60, .35);    // tom esverdeado de cadáver
    grime(g, w, h, 45, 'rgba(118,92,122,A)', 10, 55, .25);     // livores arroxeados
    grime(g, w, h, 30, 'rgba(92,72,52,A)', 6, 40, .35);        // sujeira
    grime(g, w, h, 22, 'rgba(120,42,40,A)', 3, 18, .3);        // escoriações
    grime(g, w, h, 30, 'rgba(210,205,180,A)', 8, 30, .25);     // pele esticada sobre osso
    const vein = (x, y, a, len, wd, depth) => {
      g.lineWidth = wd; g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < len; i++) {
        a += rand(-.35, .35); x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y);
        if (depth < 2 && Math.random() < 0.08) { g.stroke(); vein(x, y, a + rand(-1.1, 1.1), (len * 0.5) | 0, wd * 0.6, depth + 1); g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); }
      }
      g.stroke();
    };
    for (let i = 0; i < 18; i++) { g.strokeStyle = `rgba(${rand(55, 85) | 0},${rand(65, 88) | 0},${rand(105, 140) | 0},${rand(.25, .5)})`; vein(rand(0, w), rand(0, h), rand(0, 6.3), rand(20, 55) | 0, rand(1.2, 2.8), 0); }
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(80,58,48,${rand(.06, .22)})`; g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(.5, 1.6), 0, 7); g.fill(); }
    speckle(g, w, h, 6000, .07);
    // cicatrizes cirúrgicas com pontos
    for (let i = 0; i < 5; i++) {
      const x = rand(40, w - 40), y = rand(40, h - 40), a = rand(0, 6.3), L = rand(50, 130);
      g.strokeStyle = 'rgba(125,52,58,.75)'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
      g.strokeStyle = 'rgba(28,20,20,.85)'; g.lineWidth = 1.3;
      for (let k = 0; k < L; k += 9) { const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k, nx = -Math.sin(a) * 6, ny = Math.cos(a) * 6; g.beginPath(); g.moveTo(px - nx, py - ny); g.lineTo(px + nx, py + ny); g.stroke(); }
    }
  });
  const skinMaps = deriveMaps(skinT, 3.2, 0.42, 0.78);
  const SK = new THREE.MeshPhysicalMaterial({ map: skinT, normalMap: skinMaps.normalMap, roughnessMap: skinMaps.roughnessMap, roughness: 1, vertexColors: true, clearcoat: 0.4, clearcoatRoughness: 0.32, sheen: 0.35, sheenColor: new THREE.Color(0x9c9088), sheenRoughness: 0.55, emissive: 0x0b0b09 });
  const clothT = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#8b8369'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${rand(.05, .14)})`; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,255,255,${rand(.02, .05)})`; g.fillRect(x, 0, 1, h); }
    grime(g, w, h, 18, 'rgba(150,120,40,A)', 12, 50, .45);   // manchas amareladas de formol
    grime(g, w, h, 10, 'rgba(70,12,6,A)', 6, 30, .6);        // sangue seco
    grime(g, w, h, 20, 'rgba(30,26,18,A)', 10, 60, .45);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(25,20,12,.6)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const clothMaps = deriveMaps(clothT, 5, 0.85, 1);
  const CL = new THREE.MeshStandardMaterial({ map: clothT, normalMap: clothMaps.normalMap, roughness: 1, side: THREE.DoubleSide });
  const LEATHER = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.6 });
  const BUCKLE = new THREE.MeshStandardMaterial({ color: 0x8a8378, metalness: 0.9, roughness: 0.45 });
  const NAIL = new THREE.MeshPhysicalMaterial({ color: 0x4a4232, roughness: 0.35, clearcoat: 0.6 });
  const TEETH = new THREE.MeshPhysicalMaterial({ color: 0xcabd96, roughness: 0.3, clearcoat: 0.8 });
  const GUM = new THREE.MeshStandardMaterial({ color: 0x3a0c0c, roughness: 0.35 });
  const HAIR = new THREE.MeshStandardMaterial({ color: 0x15110d, roughness: 0.32, metalness: 0.1 });
  const mesh = (geo, mat, parent, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; parent.add(m); return m; };

  // membro: torno ao longo de -Y com perfil anatômico (ossos nas pontas, ventre muscular)
  const limbGeo = (len, prof, flat = 1, back = null) => {
    const pts = []; const N = 22;
    pts.push(new THREE.Vector2(0.0005, -len - 0.004));
    for (let i = N; i >= 0; i--) { const t = i / N; pts.push(new THREE.Vector2(Math.max(0.002, prof(t)), -t * len)); }
    pts.push(new THREE.Vector2(0.0005, 0.004));
    const g = new THREE.LatheGeometry(pts, 22, Math.PI, Math.PI * 2); g.scale(1, 1, flat);
    return sculpt(g, p => { const t = -p.y / len; let d = fbm(p.x * 30, p.y * 30, p.z * 30) * 0.0025; if (back) d += back(t, p); return d; },
      p => { const t = -p.y / len; return bruise(Math.max(G(t, 0.12), G(t - 1, 0.1)) * 0.9 + 0.15 * (0.5 + 0.5 * vn(p.x * 20, p.y * 20, p.z * 20))); });
  };
  const ball = (rx, ry, rz, parent, x, y, z, disp) => { const g = new THREE.SphereGeometry(1, 20, 14); g.scale(rx, ry, rz); sculpt(g, disp || skinNoise(30, 0.002), p => bruise(0.4)); const m = mesh(g, SK, parent); m.position.set(x, y, z); return m; };
  // tubo afunilado (dedos, tendões, cabelo)
  const taper = (pts, radii, seg = 20, rs = 10) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), geo = new THREE.TubeGeometry(curve, seg, 1, rs, false), pos = geo.attributes.position, tmp = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, c = curve.getPointAt(t), fi = t * (radii.length - 1), i0 = Math.floor(fi), i1 = Math.min(radii.length - 1, i0 + 1), f = fi - i0, r = radii[i0] * (1 - f) + radii[i1] * f;
      for (let j = 0; j <= rs; j++) { const k = i * (rs + 1) + j; tmp.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, tmp.x, tmp.y, tmp.z); }
    }
    geo.computeVertexNormals(); return { geo, curve };
  };
  const paintAll = (geo, c = [1, 1, 1]) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };

  const r = C.root; scene.add(r);
  C.hips = new THREE.Group(); C.hips.position.y = 1.25; r.add(C.hips);
  // pelve: cristas ilíacas salientes
  ball(0.15, 0.1, 0.105, C.hips, 0, 0.01, 0, p => fbm(p.x * 25, p.y * 25, p.z * 25) * 0.003 + 0.018 * G(Math.abs(p.x) - 0.12, 0.03) * G(p.y - 0.05, 0.04) * (p.z > 0 ? 1 : 0.3));
  C.spine = new THREE.Group(); C.hips.add(C.spine);

  // ---------- tronco esquelético ----------
  {
    const prof = [[-0.06, 0.0], [-0.03, 0.118], [0.06, 0.128], [0.18, 0.11], [0.3, 0.118], [0.42, 0.152], [0.55, 0.178], [0.67, 0.19], [0.76, 0.19], [0.81, 0.178], [0.85, 0.14], [0.885, 0.075], [0.91, 0.0]];
    // perfil suavizado e reamostrado: muitos anéis para as costelas e vértebras terem resolução
    const spl = new THREE.SplineCurve(prof.map(([y, rr]) => new THREE.Vector2(Math.max(rr, 0.0005), y)));
    const pts = spl.getSpacedPoints(130).map(v => new THREE.Vector2(Math.max(v.x, 0.0005), v.y));
    const geo = new THREE.LatheGeometry(pts, 64, Math.PI, Math.PI * 2);
    { // achata (tórax raso de frente para trás)
      const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); p.setZ(i, z * (z > 0 ? 0.66 : 0.56)); p.setX(i, p.getX(i) * (1 + 0.32 * G(y - 0.79, 0.07))); }
    }
    const ribs = (y, th) => { // costelas descem em direção ao esterno
      const s = (y + 0.13 * Math.pow(1 - Math.abs(th) / Math.PI, 2)) / 0.058;
      const ridge = Math.pow(0.5 + 0.5 * Math.cos(s * Math.PI * 2), 2.5);
      const lo = 0.4 + 0.17 * G(th, 0.55);   // arco costal: costelas sobem em "V" no centro do abdômen
      const mask = (1 - G(th, 0.16)) * G(Math.abs(th) - 1.2, 1.3) * Math.min(1, Math.max(0, (y - lo) / 0.05)) * Math.min(1, Math.max(0, (0.8 - y) / 0.06));
      return ridge * mask;
    };
    sculpt(geo, (p) => {
      const th = Math.atan2(p.x, p.z), y = p.y, front = Math.max(0, Math.cos(th)), backd = Math.abs(Math.abs(th) - Math.PI);
      let d = ribs(y, th) * 0.017;
      d -= 0.038 * front * G(y - 0.3, 0.08);                                         // abdômen afundado sob a caixa torácica
      d += 0.005 * G(th, 0.1) * (y > 0.48 && y < 0.82 ? 1 : 0);                       // esterno
      d += 0.011 * G(y - (0.835 - 0.02 * Math.abs(th)), 0.014) * G(Math.abs(th) - 0.75, 0.5) * front;   // clavículas
      d -= 0.012 * G(y - 0.86, 0.025) * G(th, 0.25);                                  // fúrcula
      d += 0.009 * G(backd, 0.1) * Math.pow(0.5 + 0.5 * Math.cos(y / 0.045 * Math.PI * 2), 2) * (y > 0.05 ? 1 : 0);   // vértebras
      d += 0.02 * G(Math.abs(Math.abs(th) - 2.45), 0.32) * G(y - 0.68, 0.075);         // escápulas
      d += 0.014 * G(Math.abs(th) - 1.15, 0.3) * G(y - 0.03, 0.035);                 // ilíacos
      d += fbm(p.x * 22, p.y * 22, p.z * 22) * 0.004;
      return d;
    }, (p) => {
      const th = Math.atan2(p.x, p.z), y = p.y, rb = ribs(y, th);
      const valley = (1 - G(th, 0.16)) * (y > 0.42 && y < 0.79 ? 1 : 0) * (1 - rb) * 0.45;
      const belly = Math.max(0, Math.cos(th)) * G(y - 0.3, 0.07) * 0.35;
      const k = 1 - valley - belly; return [k * (1 - 0.05 * belly * 4), k * (1 - 0.1 * belly * 4), k];
    });
    const torso = mesh(geo, SK, C.spine);
  }
  C.neck = new THREE.Group(); C.neck.position.y = 0.88; C.spine.add(C.neck);
  { // pescoço fino: tendões (esternocleidomastoideos) e traqueia marcados
    const g = new THREE.CylinderGeometry(0.047, 0.07, 0.3, 32, 24, true); g.translate(0, 0.13, 0); g.scale(1, 1, 0.82);
    sculpt(g, p => { const th = Math.atan2(p.x, p.z), t = (p.y + 0.02) / 0.3;
      return 0.009 * G(Math.abs(th) - (0.55 + 0.6 * (1 - t)), 0.2) + 0.006 * G(th, 0.18) * Math.pow(0.5 + 0.5 * Math.cos(p.y / 0.025 * Math.PI * 2), 2) * 0.6 + 0.008 * G(Math.abs(Math.abs(th) - Math.PI), 0.25) * G(t - 0.05, 0.2) + fbm(p.x * 30, p.y * 30, p.z * 30) * 0.003; },
      p => { const th = Math.atan2(p.x, p.z); return bruise(0.25 + 0.3 * G(Math.abs(th) - 1.2, 0.4)); });
    mesh(g, SK, C.neck);
  }
  C.head = new THREE.Group(); C.head.position.y = 0.26; C.neck.add(C.head);

  // ---------- cabeça: crânio alongado, órbitas fundas, malar saliente, bochechas chupadas, sorriso sem lábios ----------
  const HC = new THREE.Vector3(0, 0.15, 0.01), HR = new THREE.Vector3(0.104, 0.165, 0.132);
  const eyeDir = s => new THREE.Vector3(s * 0.36, 0.1, 0.93).normalize();
  const dd = (d, x, y, z) => { const l = Math.hypot(x, y, z); return Math.hypot(d.x - x / l, d.y - y / l, d.z - z / l); };
  const headOff = d => {
    let o = 0;
    for (const s of [-1, 1]) {
      o -= 0.034 * G(dd(d, s * 0.36, 0.1, 0.93), 0.21);       // órbitas
      o += 0.012 * G(dd(d, s * 0.33, 0.36, 0.88), 0.2);       // arcada supraciliar
      o += 0.014 * G(dd(d, s * 0.62, -0.05, 0.78), 0.17);     // maçãs do rosto
      o -= 0.024 * G(dd(d, s * 0.58, -0.42, 0.7), 0.2);       // bochechas chupadas
      o -= 0.012 * G(dd(d, s * 0.92, 0.25, 0.25), 0.25);      // têmporas fundas
    }
    o -= 0.026 * G(dd(d, 0, -0.16, 1), 0.11);                  // cavidade nasal (nariz necrosado)
    o += 0.006 * G(dd(d, 0, 0.12, 1), 0.08);                   // ponte do nariz
    o -= 0.013 * G(d.y + 0.53, 0.06) * Math.max(0, d.z - 0.3); // fenda da boca (lábios retraídos)
    o += fbm(d.x * 5, d.y * 5, d.z * 5) * 0.005;
    return o;
  };
  const headPt = (d, withOff = true) => {
    const p = new THREE.Vector3(d.x * HR.x, d.y * HR.y, d.z * HR.z);
    p.z -= 0.04 * Math.max(0, d.y + 0.25) * Math.max(0, 0.35 - d.z);   // crânio puxado para trás
    if (d.y < 0) p.x *= 1 - 0.3 * -d.y;                                   // rosto afina embaixo
    if (withOff) p.addScaledVector(d, headOff(d));
    return p.add(HC);
  };
  {
    const g = new THREE.SphereGeometry(1, 64, 48), p = g.attributes.position, d = new THREE.Vector3(), cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      d.fromBufferAttribute(p, i).normalize(); const q = headPt(d); p.setXYZ(i, q.x, q.y, q.z);
      let k = 1, rr = 1, gg = 1, bb = 1;
      for (const s of [-1, 1]) { const e = G(dd(d, s * 0.36, 0.1, 0.93), 0.2); k -= 0.6 * e; rr += 0.05 * e; bb += 0.08 * e; }
      k -= 0.75 * G(dd(d, 0, -0.16, 1), 0.09);
      k -= 0.2 * G(dd(d, 0.58, -0.42, 0.7), 0.2) + 0.2 * G(dd(d, -0.58, -0.42, 0.7), 0.2);
      if (d.y < -0.5 && d.z > 0.15) { k = 0.18; rr = 1.6; gg = 0.7; }                          // interior da boca
      else k -= 0.5 * G(d.y + 0.52, 0.035) * Math.max(0, d.z);                                  // gengiva/fenda
      k = Math.max(0.08, k); cols[i * 3] = k * rr; cols[i * 3 + 1] = k * gg; cols[i * 3 + 2] = k * bb;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); weld(g);
    mesh(g, SK, C.head);
  }
  // interior escuro da boca e garganta
  { const g = new THREE.SphereGeometry(1, 16, 12); g.scale(0.05, 0.045, 0.06); const m = mesh(g, GUM, C.head, false); m.position.set(0, 0.05, 0.05); }
  // dentes superiores: irregulares, alguns faltando, amarelados
  const toothRow = (parent, y, rx, rz, cz, down) => {
    for (let i = 0; i < 14; i++) {
      if (Math.random() < 0.15) continue;
      const a = -1.05 + i / 13 * 2.1, len = rand(0.014, 0.026) * (1 - 0.3 * Math.abs(a));
      const t = mesh(new THREE.ConeGeometry(rand(0.0045, 0.0062), len, 5), TEETH, parent, false);
      t.position.set(Math.sin(a) * rx, y + (down ? -len / 2 : len / 2), cz + Math.cos(a) * rz);
      t.rotation.set(down ? Math.PI + rand(-.15, .15) : rand(-.15, .15), a, rand(-.12, .12));
    }
  };
  toothRow(C.head, 0.068, 0.056, 0.098, 0.022, true);
  // mandíbula: estreita, queixo ossudo; topo interno escuro (língua/gengiva)
  C.jaw = new THREE.Group(); C.jaw.position.set(0, 0.06, 0.03); C.head.add(C.jaw);
  {
    const g = new THREE.SphereGeometry(1, 32, 22), p = g.attributes.position, d = new THREE.Vector3(), cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      d.fromBufferAttribute(p, i);
      let x = d.x * 0.072 * (1 - 0.38 * Math.max(0, d.z)), y = d.y * 0.042, z = d.z * 0.078;
      y -= 0.012 * G(d.x, 0.3) * Math.max(0, d.z);                                     // queixo
      x *= 1 - 0.12 * G(d.y + 0.3, 0.4);                                                 // ramo da mandíbula afinando
      const o = fbm(d.x * 6, d.y * 6, d.z * 6) * 0.003; x += d.x * o; y += d.y * o; z += d.z * o;
      p.setXYZ(i, x, y - 0.035, z + 0.032);
      const inside = d.y > 0.35 ? 1 : 0, k = inside ? 0.18 : 0.92 - 0.25 * G(d.y + 0.2, 0.3) * G(d.x - 0.7, 0.3);
      cols[i * 3] = k * (inside ? 1.6 : 1); cols[i * 3 + 1] = k * (inside ? 0.7 : 0.95); cols[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); weld(g);
    mesh(g, SK, C.jaw);
    toothRow(C.jaw, -0.002, 0.05, 0.072, 0.03, false);
  }
  // olhos leitosos (catarata), com vasos rompidos; pupila contrai sob a luz
  {
    const eyeT = tex(256, 128, (g, w, h) => {
      g.fillStyle = '#d8d6c6'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(150,30,30,.55)';
      for (let i = 0; i < 26; i++) { let x = w * 0.25 + rand(-60, 60), y = h * 0.5 + rand(-50, 50); if (Math.hypot(x - w * 0.25, y - h * 0.5) < 22) continue; g.lineWidth = rand(.4, 1.3); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (w * 0.25 - x) * 0.12 + rand(-4, 4); y += (h * 0.5 - y) * 0.12 + rand(-4, 4); g.lineTo(x, y); } g.stroke(); }
      grime(g, w, h, 6, 'rgba(170,140,90,A)', 10, 30, .3);
      const gr = g.createRadialGradient(w * 0.25, h * 0.5, 2, w * 0.25, h * 0.5, 15); gr.addColorStop(0, 'rgba(150,160,150,1)'); gr.addColorStop(0.7, 'rgba(120,128,112,.9)'); gr.addColorStop(1, 'rgba(70,70,60,.9)');
      g.fillStyle = gr; g.beginPath(); g.arc(w * 0.25, h * 0.5, 15, 0, 7); g.fill();
      g.fillStyle = 'rgba(235,238,230,.45)'; g.beginPath(); g.arc(w * 0.25 - 2, h * 0.5 + 1, 9, 0, 7); g.fill();   // catarata
    });
    C.eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeT, color: 0xbfc8b8, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0x23261f });
    C.eyes = [];
    for (const s of [-1, 1]) {
      const dv = eyeDir(s), pos = headPt(dv).addScaledVector(dv, -0.004);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.021, 24, 16), C.eyeMat); e.position.copy(pos); e.lookAt(pos.clone().add(new THREE.Vector3(s * 0.12, 0, 1))); C.head.add(e); C.eyes.push(e);
      const pu = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 16), new THREE.MeshBasicMaterial({ color: 0x0b0c0a })); pu.position.set(0, 0, 0.0213); e.add(pu); e.userData.pupil = pu;
      // pálpebra inferior caída / borda vermelha
      const lid = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0035, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x6a2a2a, roughness: 0.4 })); lid.rotation.z = Math.PI; lid.position.z = 0.004; lid.scale.set(1.05, 0.75, 1); e.add(lid);
    }
    const ey = C.eyes[0].position.y, ez = C.eyes[0].position.z;
    C.eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xdfffe8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    C.eyeGlow.scale.set(0.34, 0.16, 1); C.eyeGlow.position.set(0, ey, ez + 0.03); C.head.add(C.eyeGlow);
  }
  // cabelo ralo, longo e molhado grudado no crânio (falhas de calvície)
  for (let i = 0; i < 46; i++) {
    const dv = new THREE.Vector3(rand(-1, 1), rand(0.25, 1), rand(-1, 0.45)).normalize(); if (Math.random() < 0.3 && dv.z > 0) continue;
    const root0 = headPt(dv, false).addScaledVector(dv, 0.002), len = rand(0.18, 0.5), pts = [root0];
    let p = root0.clone(), dir = dv.clone().multiplyScalar(0.4).add(new THREE.Vector3(0, -1, -0.25)).normalize();
    for (let k = 1; k <= 6; k++) {
      p = p.clone().addScaledVector(dir, len / 6);
      const c = p.clone().sub(HC); const ell = (c.x / (HR.x + 0.012)) ** 2 + (c.y / (HR.y + 0.012)) ** 2 + (c.z / (HR.z + 0.03)) ** 2;
      if (ell < 1) p.copy(HC).add(c.multiplyScalar(1 / Math.sqrt(ell)));   // escorre pela cabeça
      dir.y -= 0.25; dir.x += rand(-.15, .15); dir.normalize(); pts.push(p);
    }
    const { geo } = taper(pts, [0.0026, 0.002, 0.0015, 0.0008], 18, 4);
    mesh(geo, HAIR, C.head, false);
  }

  // ---------- braços longos e esqueléticos ----------
  const armUp = t => 0.034 + 0.014 * G(t - 0.04, 0.1) + 0.008 * G(t - 0.33, 0.15) + 0.012 * G(t - 0.985, 0.06);
  const armLo = t => 0.027 + 0.013 * G(t - 0.14, 0.16) - 0.005 * t + 0.008 * G(t - 0.975, 0.05);
  C.arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.22, 0.8, 0); C.spine.add(sh);
    const up = new THREE.Group(); sh.add(up);
    mesh(limbGeo(0.74, armUp, 0.9), SK, up);
    ball(0.052, 0.068, 0.054, up, s * 0.006, -0.03, 0, p => fbm(p.x * 30, p.y * 30, p.z * 30) * 0.003 + 0.004 * G(p.y + 0.03, 0.03));   // deltoide/acrômio
    const el = new THREE.Group(); el.position.y = -0.74; up.add(el);
    ball(0.037, 0.04, 0.036, el, 0, 0, -0.006);                                          // cotovelo ossudo
    const fo = new THREE.Group(); el.add(fo);
    mesh(limbGeo(0.8, armLo, 0.8, (t, p) => 0.004 * G(t - 0.4, 0.3) * Math.max(0, -p.z) * 60), SK, fo);
    // ataduras sujas no antebraço
    for (let k = 0; k < 3; k++) { const b = mesh(new THREE.TorusGeometry(armLo(0.55 + k * 0.05) * 1.04, 0.006, 6, 18), CL, fo, false); b.rotation.set(Math.PI / 2 + rand(-.25, .25), 0, rand(-.2, .2)); b.position.y = -(0.55 + k * 0.05) * 0.8; b.scale.set(1, 0.8, 1); }
    const hd = new THREE.Group(); hd.position.y = -0.8; fo.add(hd);
    // mão: palma magra com ossos dos metacarpos marcados
    ball(0.04, 0.062, 0.016, hd, 0, -0.058, 0, p => fbm(p.x * 40, p.y * 40, p.z * 40) * 0.0015 + 0.003 * Math.pow(Math.abs(Math.cos(p.x / 0.02 * Math.PI)), 3) * (p.z < 0 ? 1 : 0));
    // dedos compridos com falanges nodosas e unhas escuras em garra
    const fx = [-0.027, -0.009, 0.009, 0.026], fl = [0.2, 0.235, 0.225, 0.18];
    for (let i = 0; i < 5; i++) {
      const thumb = i === 4, L = thumb ? 0.14 : fl[i], segs = [0.42, 0.33, 0.25], curl = thumb ? [0.3, 0.3, 0.35] : [0.18 + rand(0, .1), 0.4 + rand(0, .15), 0.5 + rand(0, .2)];
      let p = thumb ? new THREE.Vector3(-s * 0.035, -0.035, -0.012) : new THREE.Vector3(fx[i] * (s > 0 ? 1 : -1), -0.112, 0);
      let ang = 0, spread = thumb ? -s * 0.5 : (i - 1.5) * 0.06 * (s > 0 ? 1 : -1); const pts = [p.clone()], joints = [];
      for (let k = 0; k < 3; k++) {
        ang += curl[k]; const l = L * segs[k];
        const dir = new THREE.Vector3(Math.sin(spread) * Math.cos(ang), -Math.cos(spread) * Math.cos(ang), -Math.sin(ang));
        const mid = p.clone().addScaledVector(dir, l * 0.5); p = p.clone().addScaledVector(dir, l); pts.push(mid, p); joints.push(p.clone());
      }
      const rad = thumb ? [0.0085, 0.0078, 0.008, 0.007, 0.0068, 0.0058, 0.0048] : [0.0068, 0.0058, 0.0064, 0.0052, 0.0056, 0.0046, 0.0038];
      const { geo, curve } = taper(pts, rad, 28, 8); paintAll(geo, [0.95, 0.9, 0.9]); mesh(geo, SK, hd, false);
      for (let k = 0; k < 2; k++) { const jg = new THREE.SphereGeometry(rad[2 + k * 2] * 1.18, 10, 8); paintAll(jg, [0.85, 0.75, 0.8]); mesh(jg, SK, hd, false).position.copy(joints[k]); }
      // garra
      const tg = curve.getTangentAt(1), claw = mesh(new THREE.ConeGeometry(rad[6] * 0.95, 0.026, 6), NAIL, hd, false);
      claw.position.copy(p).addScaledVector(tg, 0.01); claw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg); claw.rotateX(0.35);
    }
    C.arms.push({ sh, up, el, fo, hd, s });
  }
  // correias de couro da camisa de força, com fivelas, penduradas
  C.straps = [];
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.9, 0.005, 1, 12, 1), LEATHER); st.geometry.translate(0, -0.45, 0);
    { const p = st.geometry.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setX(k, p.getX(k) + Math.sin(y * 9 + i) * 0.01); p.setZ(k, p.getZ(k) + Math.sin(y * 5 + i * 2) * 0.012); } st.geometry.computeVertexNormals(); }
    st.position.set(0, -0.2 - i * 0.1, 0.035); st.castShadow = true; C.arms[0].up.add(st); C.straps.push(st);
    const bk = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0025, 4, 4), BUCKLE); bk.rotation.z = Math.PI / 4; bk.scale.set(1, 1.3, 1); bk.position.set(0, -0.1, 0.004); st.add(bk);
  }
  // cinta de couro presa no tórax
  { const b = mesh(new THREE.TorusGeometry(0.168, 0.016, 4, 40), LEATHER, C.spine); b.rotation.x = Math.PI / 2; b.scale.set(1, 0.68, 2); b.position.y = 0.6; const bk = mesh(new THREE.BoxGeometry(0.03, 0.036, 0.012), BUCKLE, C.spine, false); bk.position.set(0.05, 0.6, 0.126); }
  // trapo da camisola hospitalar rasgada em volta do quadril
  {
    const g = new THREE.CylinderGeometry(0.2, 0.29, 0.5, 40, 10, true), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), th = Math.atan2(x, z), t = (0.25 - y) / 0.5;
      const fold = 1 + Math.sin(th * 7 + y * 3) * 0.06 * t + vn(th * 3, y * 4, 0) * 0.05;
      let ny = y; if (t > 0.6) ny += Math.max(0, vn(th * 6, 3, 1) * 0.5 + vn(th * 17, 1, 2) * 0.35) * 0.22 * (t - 0.6) / 0.4 * 2.5;   // barra rasgada em tiras
      p.setXYZ(k, x * fold, ny, z * fold * 0.72);
    }
    g.computeVertexNormals(); const rag = mesh(g, CL, C.hips); rag.position.y = -0.07;
  }
  // ---------- pernas ----------
  const thigh = t => 0.05 + 0.02 * G(t - 0.12, 0.22) - 0.01 * t + 0.016 * G(t - 0.985, 0.07);
  const shin = t => 0.034 + 0.01 * G(t - 0.2, 0.18) - 0.01 * t + 0.012 * G(t - 0.975, 0.05);
  C.legs = [];
  for (const s of [-1, 1]) {
    const th = new THREE.Group(); th.position.set(s * 0.1, 0, 0); C.hips.add(th);
    mesh(limbGeo(0.63, thigh, 0.95), SK, th);
    const kn = new THREE.Group(); kn.position.y = -0.63; th.add(kn);
    ball(0.044, 0.046, 0.044, kn, 0, 0, 0.012, p => fbm(p.x * 30, p.y * 30, p.z * 30) * 0.002 + 0.008 * G(p.z - 0.04, 0.015) * G(p.y, 0.02));   // patela
    mesh(limbGeo(0.6, shin, 0.9, (t, p) => 0.012 * G(t - 0.22, 0.14) * Math.max(0, -p.z) * 30), SK, kn);   // panturrilha atrás, canela à frente
    // pé ossudo com dedos e unhas encardidas
    const fg = new THREE.SphereGeometry(1, 24, 14); fg.scale(0.042, 0.028, 0.12);
    sculpt(fg, p => fbm(p.x * 40, p.y * 40, p.z * 40) * 0.002 + 0.004 * Math.pow(Math.abs(Math.cos(p.x / 0.016 * Math.PI)), 4) * (p.y > 0 ? 1 : 0) * Math.max(0, p.z / 0.12), p => bruise(0.5 + 0.4 * Math.max(0, p.z / 0.12)));
    const ft = mesh(fg, SK, kn); ft.position.set(0, -0.615, 0.06);
    for (let k = 0; k < 5; k++) {
      const x = (-0.028 + k * 0.014) * s, l = 0.035 - Math.abs(k - 1) * 0.004, a = new THREE.Vector3(x, -0.62, 0.165), b = a.clone().add(new THREE.Vector3(0, -0.008, l * 0.6)), c = b.clone().add(new THREE.Vector3(0, -0.012, l * 0.4));
      const { geo } = taper([a, b, c], [0.0075 - k * 0.0006, 0.006, 0.005], 10, 6); paintAll(geo, [0.8, 0.72, 0.72]); mesh(geo, SK, kn, false);
      const n = mesh(new THREE.SphereGeometry(0.004, 6, 4), NAIL, kn, false); n.position.copy(c).add(new THREE.Vector3(0, 0.002, 0)); n.scale.set(1, 0.4, 1.2);
    }
    C.legs.push({ th, knee: kn, s });
  }
  r.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
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
    if (A.sfx_grito && typeof playBuf === 'function') playBuf(A.sfx_grito, { pos: AI.headPos(new THREE.Vector3()), gain: 1.2, verb: 0.6, rate: rand(0.9, 1.05), ref: 3 });
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
  lightExp: 0, recoilDur: 6, fledLight: false, fleeMsgT: -99,
  // foge correndo para longe do jogador (luz da lanterna ou queimadura do foco)
  flee(dur, fromLight) { if (this.state === 'dying' || this.state === 'dead' || this.state === 'sunwalk') return; this.recoilDur = dur; this.fledLight = !!fromLight; this.lightExp = 0; if (this.checkSpot) closeSpot(this.checkSpot); this.checkSpot = null; this.stalking = false; this.setState('recoil'); },

  setState(s) { if (this.state === s || this.state === 'dying' || this.state === 'dead' || this.state === 'sunwalk') return; this.state = s; this.t = 0; this.path = []; this.pause = 0; if (s === 'chase') { STATS.seen++; eliasSay(2, 2); } if (s === 'chase') { if (performance.now() / 1000 - this.lastScream > 6) { SFX.scream(1.1); this.lastScream = performance.now() / 1000; } } },
  levelMul() { return CFG.creature.levelSpeed[this.level] * (OPT.hard ? 1.12 : 1); },
  goTo(v, avoid = true) { const [sx, sz] = cellOf(this.pos), [tx, tz] = cellOf(v); this.path = astar(sx, sz, tx, tz, avoid) || []; this.target = v.clone(); },
  hear(pos, radius, prio) {
    if (this.grace > 0 || this.state === 'recoil' || this.state === 'dying' || this.state === 'dead' || this.state === 'sunwalk' || P.dead) return;
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    const walls = wallsBetween(this.pos.x, this.pos.z, pos.x, pos.z, 4);
    const eff = radius * CFG.creature.levelHear[this.level] * (OPT.hard ? 1.25 : 1) * Math.pow(0.6, walls);
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
    if (this.state === 'dying' || this.state === 'dead' || this.state === 'sunwalk') { if (this.state !== 'sunwalk') this.speed = 0; this.canSee = false; return; }
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
        if (this.ambushWait > 0 && !this.path.length) { this.ambushWait -= dt; speed = 0; this.ambush = true; break; }   // emboscada: parado e mudo no escuro
        this.ambush = false;
        if (this.pause > 0) { this.pause -= dt; speed = 0; break; }
        if (!this.path.length) {
          if (PROG.ch === 3 && Math.random() < 0.35) { const c = randomCellNear(P.pos, 9); if (c && lightAt(c) < 0.2 && c.distanceTo(P.pos) > 5) { this.goTo(c); this.ambushWait = rand(10, 16); break; } }
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
        const dur = this.ignition ? 3.5 : this.recoilDur;
        // chegou ao destino e ainda está fugindo: escolhe outro ponto mais longe e escuro
        if (!this.path.length && this.t < dur - 0.8) { this.pathT -= dt; if (this.pathT <= 0) { this.pathT = 0.4; this.goTo(fleeTarget(), false); } }
        if (this.t > dur) {
          this.lastKnown = P.pos.clone();
          if (this.ignition) this.setState('chase');
          else if (this.fledLight) { this.setState('patrol'); this.awayUntil = performance.now() / 1000 + sp.fleeAway; this.suspicion = 0; }
          else { this.setState('search'); this.searchPts = buildSearch(this.lastKnown); }
        }
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
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _c1 = new THREE.Color();
function angLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function randomCellNear(v, r) {
  for (let k = 0; k < 30; k++) { const x = Math.floor((v.x + rand(-r, r)) / CS), z = Math.floor((v.z + rand(-r, r)) / CS); if (inb(x, z) && !blocked[idx(x, z)] && regionAt(x, z) !== 'rua') return center(x, z); }
  return null;
}
function choosePatrol() {
  const now = performance.now() / 1000; let best = null, bs = -1e9;
  for (let k = 0; k < 14; k++) {
    const i = pick(FREE_CELLS), x = i % W, z = (i / W) | 0, rg = regionAt(x, z);
    if (rg === 'rua' || rg === 'recepcao' || blocked[i] || !regionOpen(rg)) continue;
    const c = center(x, z), dp = Math.hypot(c.x - P.pos.x, c.z - P.pos.z), da = Math.hypot(c.x - AI.pos.x, c.z - AI.pos.z);
    let s = (1 - lightGrid[i]) * 2 + Math.random() * 1.5 + Math.min(da, 30) / 30;
    if (AI.level >= 2) s += (1 - Math.min(dp, 40) / 40) * (AI.level - 1) * 0.9;
    if (now < AI.awayUntil) s += Math.min(dp, 40) / 20;
    if (rg === 'corredor') s += 0.6;
    if (PROG.ch >= 2 && EAST.has(rg)) s += 1.1;
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
  const recoil = st === 'recoil', chase = (st === 'chase' && AI.speed > 2.5) || (recoil && AI.t > 0.6 && AI.speed > 2);
  const burning = AI.burnAcc > 0.05 || (recoil && AI.t < 0.9);
  const tLean = chase ? 1.12 : recoil ? 0.9 : st === 'patrol' ? 0.38 : 0.55;
  const tHip = chase ? 0.92 : recoil ? 1.0 : 1.22;
  a.lean = lerp(a.lean, tLean, dt * 4); a.hipY = lerp(a.hipY, tHip, dt * 4);
  a.burn = lerp(a.burn, burning ? 1 : 0, dt * 8);
  const spd = AI.speed; AI.phase += dt * (chase ? spd * 2.1 : spd * 3.2);
  const ph = AI.phase, sw = Math.min(1, spd / 1.5);
  C.root.position.set(AI.pos.x, AI.state === 'dying' && AI.dyingKind === 'peace' ? C.root.position.y : 0, AI.pos.z); C.root.rotation.y = AI.yaw;
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
  // nas galerias ele rasteja de quatro, braços na frente
  { const rg = regionAt(...cellOf(AI.pos)); a.crawl = lerp(a.crawl || 0, UNDER.has(rg) && rg !== 'patio' && st !== 'sunwalk' && st !== 'dying' ? 1 : 0, dt * 3); }
  if (a.crawl > 0.02) {
    const k = a.crawl;
    C.hips.position.y = lerp(C.hips.position.y, 0.7 + Math.abs(Math.sin(ph)) * 0.04 * sw, k); C.spine.rotation.x = lerp(C.spine.rotation.x, 1.38, k); C.neck.rotation.x = lerp(C.neck.rotation.x, -1.2, k);
    C.arms.forEach((ar, i) => { const p = ph + (i ? 0 : Math.PI); ar.sh.rotation.x = lerp(ar.sh.rotation.x, -1.55 + Math.sin(p) * 0.5 * sw, k); ar.el.rotation.x = lerp(ar.el.rotation.x, -0.3 + Math.max(0, Math.sin(p)) * -0.45 * sw, k); });
    C.legs.forEach((l, i) => { const p = ph + (i ? Math.PI : 0); l.th.rotation.x = lerp(l.th.rotation.x, -1.0 + Math.sin(p) * 0.4 * sw, k); l.knee.rotation.x = lerp(l.knee.rotation.x, 1.6 + Math.max(0, -Math.sin(p)) * 0.4 * sw, k); });
  }
  // passos audíveis
  const stepPh = Math.floor(ph / Math.PI);
  if (stepPh !== AI.lastStepPhase && spd > 0.3) { AI.lastStepPhase = stepPh; SFX.cStep(chase); }
}

/* ---------------------------------------------------------------
   INPUT
   --------------------------------------------------------------- */
addEventListener('keydown', e => {
  if (UI.modal) { if (e.code === 'Tab') e.preventDefault(); if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape')) closeModal(); if (UI.modal === 'doc' && (e.code === 'KeyS' || e.code === 'ArrowDown')) $('doc_p').scrollTop += 60; if (UI.modal === 'doc' && (e.code === 'KeyW' || e.code === 'ArrowUp')) $('doc_p').scrollTop -= 60; return; }
  if (e.code === 'Tab') { e.preventDefault(); if (playing) { if (OPT.hard) { if (!e.repeat) msg('Modo Pesadelo: sem mapa.', 1.5); } else showMap(true); } }
  if (e.repeat) return;
  keys[e.code] = true;
  if (!playing || paused || P.dead) return;
  if (e.code === 'Escape' && document.pointerLockElement !== canvas) { pauseGame(); return; }
  if (MODE === 'cut') return;
  if (e.code === 'KeyF' && OPT.noLight) { msg('Modo Sem Lanterna.', 1.5); return; }
  if (e.code === 'KeyF' && !P.hidden) { fl.on = !fl.on; SFX.click(); TORCH.clickT = 0.16; }
  if (e.code === 'KeyC' || e.code === 'ControlLeft') P.crouch = !P.crouch;
  if (e.code === 'KeyV') msg(cycleShake(), 1.5);
  if (e.code === 'KeyT' && TP.n) stopTape(false);
  if (e.code === 'KeyG') throwItem('flare');
  if (e.code === 'KeyQ') throwItem('bottle');
  if (e.code === 'KeyE') { eHeld = true; pressInteract(); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE') { eHeld = false; installT = 0; } if (e.code === 'Tab') showMap(false); });
addEventListener('mousedown', e => { if (e.button === 2) mouseFocus = true; });
addEventListener('mouseup', e => { if (e.button === 2) mouseFocus = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  const locked = document.pointerLockElement === canvas;
  if (!playing || paused || P.dead || UI.modal || (!locked && !(noLock && (e.buttons & 1)))) return;
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
  if (!locked && hadLock && playing && !P.dead && !P.won && !paused && !UI.modal) pauseGame();
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
const OPT = Object.assign({ vol: 80, sens: 100, bright: 100, shake: 0, subs: true, narr: true, hard: false, gfx: 2, noLight: false }, loadJ('formol_opts') || {});
function applyOpts() {
  CAM.li = OPT.shake; CAM.level = SHAKE_LEVELS[OPT.shake][0];
  if (A.master) A.master.gain.setTargetAtTime(OPT.vol / 100 * 0.9, A.ctx.currentTime, 0.05);
  $('o_vol').value = OPT.vol; $('o_sens').value = OPT.sens; $('o_bright').value = OPT.bright;
  $('o_shake').textContent = SHAKE_LEVELS[OPT.shake][1]; $('o_subs').textContent = OPT.subs ? 'LIGADAS' : 'DESLIGADAS'; $('o_narr').textContent = OPT.narr ? 'LIGADA' : 'DESLIGADA'; $('o_hard').textContent = OPT.hard ? 'PESADELO' : 'NORMAL';
  $('o_gfx').textContent = ['BAIXA', 'MÉDIA', 'ALTA'][OPT.gfx]; $('o_nolight').textContent = !loadJ('formol_beaten') ? 'BLOQUEADO — ZERE O JOGO' : OPT.noLight ? 'SEM LANTERNA' : 'NORMAL';
  setTimeout(applyGfx, 0);
  saveJ('formol_opts', OPT);
}
$('o_vol').oninput = e => { OPT.vol = +e.target.value; applyOpts(); };
$('o_sens').oninput = e => { OPT.sens = +e.target.value; applyOpts(); };
$('o_bright').oninput = e => { OPT.bright = +e.target.value; applyOpts(); };
$('o_shake').onclick = () => { OPT.shake = (OPT.shake + 1) % SHAKE_LEVELS.length; applyOpts(); uiSfx('sel'); };
$('o_subs').onclick = () => { OPT.subs = !OPT.subs; applyOpts(); uiSfx('sel'); };
$('o_narr').onclick = () => { OPT.narr = !OPT.narr; applyOpts(); uiSfx('sel'); };
$('o_gfx').onclick = () => { OPT.gfx = (OPT.gfx + 1) % 3; applyOpts(); uiSfx('sel'); };
$('o_nolight').onclick = () => { if (!loadJ('formol_beaten')) { uiSfx('hover'); return; } OPT.noLight = !OPT.noLight; applyOpts(); uiSfx('sel'); };
let gfxApplied = -1;
function applyGfx() {
  const q = OPT.gfx; if (gfxApplied === q) return; gfxApplied = q;
  renderer.setPixelRatio(Math.min(devicePixelRatio, [0.7, 1, 1.25][q])); renderer.setSize(innerWidth, innerHeight); ppResize();
  const sh = q > 0; flash.castShadow = sh;
  if (renderer.shadowMap.enabled !== sh) { renderer.shadowMap.enabled = sh; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
  const ms = q === 2 ? 2048 : 1024; if (flash.shadow.mapSize.x !== ms) { flash.shadow.mapSize.set(ms, ms); if (flash.shadow.map) { flash.shadow.map.dispose(); flash.shadow.map = null; } }
}
$('o_hard').onclick = () => { OPT.hard = !OPT.hard; applyOpts(); uiSfx(OPT.hard ? 'start' : 'sel'); };

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
  A.narr = []; A.steps = {}; A.radio = []; A.tapes = {};
  const keys = Object.keys(ASSETS); let nDone = 0;
  const showLoad = () => { const el = $('loadInfo'); if (el) el.textContent = nDone < keys.length ? `CARREGANDO ÁUDIO ${Math.round(nDone / keys.length * 100)}%` : ''; };
  const bufs = await Promise.all(keys.map(k => dec(ASSETS[k]).then(b => { nDone++; showLoad(); return b; }).catch(e => { nDone++; showLoad(); console.warn('audio', k, e); return null; })));
  for (let ki = 0; ki < keys.length; ki++) {
    const k = keys[ki];
    try {
      const buf = bufs[ki]; if (!buf) continue;
      const m = k.match(/^narr(\d+)$/); if (m) { A.narr[+m[1]] = buf; continue; }
      const rd = k.match(/^radio(\d+)$/); if (rd) { A.radio[+rd[1]] = buf; continue; }
      const fm = k.match(/^fita(\d+)_(\d+)$/); if (fm) { (A.tapes[+fm[1]] = A.tapes[+fm[1]] || [])[+fm[2]] = buf; continue; }
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
function showPanel(id) { ['p_opts', 'p_ctrls', 'p_credits', 'p_chaps', 'p_tapes', 'p_extras'].forEach(p => $(p).style.display = 'none'); openPanel = id; $('menu').style.zIndex = MODE === 'game' ? 27 : ''; if (id) { $(id).style.display = 'block'; if (MODE === 'game') { $('menu').style.display = 'block'; $('menu').querySelector('.side').style.visibility = 'hidden'; $('menu').querySelector('.foot').style.visibility = 'hidden'; $('menu').style.background = 'none'; } } else if (MODE === 'game') $('menu').style.display = 'none'; }
const mainNav = bindList($('mainItems'), act => {
  if (act === 'new') newGame();
  if (act === 'cont') continueGame();
  if (act === 'opts') showPanel('p_opts');
  if (act === 'ctrls') showPanel('p_ctrls');
  if (act === 'credits') showPanel('p_credits');
  if (act === 'chaps') { refreshChapters(); showPanel('p_chaps'); }
  if (act === 'extras') openExtras();
});
document.querySelectorAll('#chapItems li').forEach(li => {
  li.addEventListener('mouseenter', () => { if (!li.classList.contains('dis')) uiSfx('hover'); });
  li.addEventListener('click', () => { if (li.classList.contains('dis')) return; uiSfx('start'); playChapter(+li.dataset.ch); });
});
const pauseNav = bindList($('pauseItems'), act => {
  if (act === 'resume') resumeGame();
  if (act === 'opts') showPanel('p_opts');
  if (act === 'ctrls') showPanel('p_ctrls');
  if (act === 'tapes') openTapeList();
  if (act === 'quit') { stopTape(false); if (PROG.ch > 1 || P.installedIds.length) saveProgress(); location.reload(); }
});
function refreshContinue() {
  const sv = loadJ('formol_save'), li = $('contItem');
  const ch = sv ? (sv.ch || 1) : 1;
  if (sv && (ch > 1 || (sv.ids && sv.ids.length))) { li.classList.remove('dis'); $('contInfo').textContent = ch === 1 ? `CAPÍTULO I · ${sv.ids.length}/5 FUSÍVEIS` : ch === 2 ? `CAPÍTULO II · NOITE LONGA` : ch === 3 ? `CAPÍTULO III · ${(sv.lamps || []).length}/3 LÂMPADAS` : 'CAPÍTULO IV · AMANHECER'; }
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
  if (MODE === 'intro' || MODE === 'cut') { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { CINE.holding = true; $('skip').style.opacity = 0.9; } return; }
  const nav = MODE === 'menu' ? mainNav : (paused && $('pause').style.display === 'block') ? pauseNav : null;
  if (!nav) return;
  if (openPanel) { if (e.code === 'Escape' || e.code === 'Backspace') { showPanel(null); uiSfx('hover'); } return; }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') nav.move(1);
  if (e.code === 'ArrowUp' || e.code === 'KeyW') nav.move(-1);
  if (e.code === 'Enter' || e.code === 'Space') nav.enter();
  if (e.code === 'Escape' && MODE === 'game' && paused && performance.now() - pausedAt > 200) resumeGame();
});
addEventListener('keyup', e => { if ((MODE === 'intro' || MODE === 'cut') && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) CINE.holding = false; });

/* ---------- progresso salvo ---------- */
function applyProgress(sv) {
  const ids = (sv && sv.ids) || [];
  for (const n of ids) {
    const f = FUSES.find(x => x.n === n); if (!f || !f.active) continue;
    f.active = false; f.mesh.visible = false; P.installed++; P.installedIds.push(n);
    const sk = panel.sockets[P.installed - 1].material; sk.color.set(0x0a3a12); sk.emissive.set(0x40ff70); sk.emissiveIntensity = 2.2; panel.fuses[P.installed - 1].visible = true;
    LIGHTS.filter(l => l.sector === SECTOR_ORDER[P.installed - 1]).forEach(l => { l.on = true; });
  }
  if (!sv.v) {   // save da versão anterior (3 capítulos): converte
    sv.tapes = (sv.tapes || []).map(t => t + 2); if (sv.killed) { sv.ch = 4; sv.burned = true; } if (sv.card && (sv.ch || 1) < 3) sv.ch = 3;
  }
  PROG.ch = sv.ch || 1; PROG.tapes = sv.tapes || []; PROG.office = !!sv.office; PROG.card = !!sv.card; PROG.fotoOpen = !!sv.fotoOpen; PROG.lamps = sv.lamps || [];
  PROG.burned = !!sv.burned; PROG.visitedGal = !!sv.visitedGal; PROG.crank = !!sv.crank; PROG.gateOpen = !!sv.gateOpen; PROG.heard7 = !!sv.heard7; PROG.metCeleste = PROG.celesteQueued = !!sv.met;
  if (PROG.card && PROG.ch < 3) PROG.ch = 3;
  if (PROG.ch >= 2) { panel.setLever(true); openDoor(DOORS.fogo, true); exitDoor.sign.material.emissive.set(0x5a0a08); exitDoor.sign.material.emissiveIntensity = 1; }
  TAPES.forEach(t => { if (PROG.tapes.includes(t.n)) { t.active = false; t.mesh.visible = false; } });
  if (PROG.office) openDoor(DOORS.office, true);
  if (PROG.card) { CARD.active = false; CARD.mesh.visible = false; }
  if (PROG.ch >= 3) { openDoor(DOORS.capela, true); LAMPS.forEach(l => { const inst = PROG.lamps.includes(l.n) || PROG.ch >= 4; l.active = !inst; l.mesh.visible = !inst; }); }
  PROG.lamps.forEach((n, i) => CONSOLE.show(i));
  lastLampToChapel(true);
  if (PROG.fotoOpen) { openDoor(DOORS.foto, true); openDoor(DOORS.foto2, true); }
  if (PROG.ch >= 4) { openDoor(DOORS.alcapao, true); openDoor(DOORS.grade, true); }
  if (PROG.crank) { CRANK.active = false; CRANK.mesh.visible = false; }
  if (PROG.gateOpen) { openDoor(DOORS.patio, true); moon.on = true; }
  applyLights(); unlockChapter(PROG.ch);
  computeLightGrid(); AI.level = levelFor();
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
  AI.pos.copy(PROG.ch >= 4 ? center(20, 35) : PROG.ch >= 2 ? center(38, 3) : center(9, 30)); AI.state = 'patrol'; AI.path = []; AI.speed = 0; AI.burnAcc = 0; AI.grace = PROG.ch >= 2 ? 12 : 25; C.root.visible = true;
  AI.level = levelFor(); if (PROG.ch === 4 && PROG.gateOpen) { DAWN.phase = 'run'; DAWN.t = 0; AI.ignition = true; }
  P.pos.copy(spawnPoint()); P.yaw = PROG.ch >= 2 ? -Math.PI / 2 : 0; P.pitch = 0; fl.on = true;
  playing = true; stats.t0 = performance.now(); P.region = '';
  if (document.pointerLockElement !== canvas) { lock(); if (!noLock) msg('Clique na tela para controlar a câmera.', 4); }
  chapterBegin(PROG.ch); STATS.seen = 0;
  showChapter(PROG.ch, () => { if (PROG.ch === 1 && !P.installed) eliasSay(0, 1.5); if (PROG.ch === 1) msg(P.installed ? `Checkpoint carregado: ${P.installed}/5 fusíveis no painel.` : 'A porta está travada. O painel precisa de 5 fusíveis.', 5); else if (PROG.ch === 4) msg(PROG.gateOpen ? 'O portão do pátio está aberto. Sobreviva até o amanhecer.' : 'A rede caiu. Só restam as luzes de emergência.', 4); });
}
function newGame() { saveJ('formol_save', null); uiSfx('start'); lock(); runIntro(); }
function continueGame() { const sv = loadJ('formol_save'); if (!sv) return; applyProgress(sv); uiSfx('start'); lock(); $('menu').style.display = 'none'; $('fade').style.opacity = 1; setTimeout(() => { startGame(); $('fade').style.opacity = 0; }, 900); }
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
    const maxD = it.type === 'hide' ? 2.4 : (it.type === 'panel' || it.type === 'door' || it.type === 'console' || it.type === 'exit') ? 1.9 : 1.6;
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
    case 'note': return '[E] ler';
    case 'tape': return '[E] pegar fita cassete';
    case 'lamp': return '[E] pegar lâmpada de arco';
    case 'card': return '[E] revistar o corpo do Dr. Varela';
    case 'crank': return '[E] pegar a manivela do portão';
    case 'phone': return '[E] atender o telefone';
    case 'flare': return '[E] pegar sinalizador';
    case 'bottle': return '[E] pegar garrafa vazia';
    case 'foto': return '[E] pegar fotografia';
    case 'street': return '[E] sair para a rua';
    case 'exit': return PROG.ch >= 4 ? 'Porta blindada — travada de vez pela sobrecarga' : 'Porta blindada — TRAVA DE SEGURANÇA ATIVA';
    case 'door':
      if (it.door.key === 'fogo') return 'Porta corta-fogo — trava eletromagnética sem energia';
      if (it.door.key === 'capela') return 'Porta da capela — trancada por dentro';
      if (it.door.key === 'alcapao') return 'Alçapão da escada de serviço — trancado com corrente';
      if (it.door.key === 'grade') return 'Grade enferrujada — emperrada';
      if (it.door.key === 'patio') return PROG.crank ? '[segure E] girar a manivela do portão' : 'Portão do Pátio Interno — falta a manivela';
      if (it.door.key === 'office') return PROG.tapes.length >= 3 ? '[E] digitar o código 1-2-0-3' : `Teclado numérico — você não sabe o código (${PROG.tapes.length}/3 fitas)`;
      return PROG.card ? '[E] passar o cartão da diretoria' : 'Leitor de cartão — ACESSO RESTRITO À DIRETORIA';
    case 'console':
      if (PROG.burned || PROG.ch > 3) return 'Console queimado. Cheiro de formol e carne.';
      if (PROG.ch < 3) return 'Console de fototerapia — sem lâmpadas';
      if (PROG.lamps.length < 3) return P.lamps.length ? `[segure E] encaixar lâmpada de arco (${P.lamps.length} na mão)` : `Console de fototerapia — ${PROG.lamps.length}/3 lâmpadas`;
      return FOTO.cool > 0 ? `Capacitores recarregando… ${Math.ceil(FOTO.cool)} s` : '[E] ACIONAR DESCARGA — 10.000 LUX';
    case 'hide': return it.spot.type === 'locker' ? '[E] entrar no armário' : '[E] esconder debaixo da maca';
    case 'panel':
      if (PROG.ch >= 2) return 'Quadro Geral QG-1 — energizado';
      if (P.installed >= 5) return AI.ignition ? (exitDoor.opening ? 'A PORTA ESTÁ ABRINDO — CORRA' : 'IGNIÇÃO EM ANDAMENTO… SOBREVIVA') : '[E] puxar a alavanca de ignição';
      return P.carry.length ? `[segure E] instalar fusível (${P.carry.length} na mão)` : `Painel principal — ${P.installed}/5 fusíveis`;
  }
  return '';
}
function pressInteract() {
  const it = findInteract(); if (!it) return;
  if (it.type === 'unhide') return unhide();
  if (it.type === 'fuse') { eliasSay(1, 1.2); it.active = false; it.mesh.visible = false; P.carry.push(it); SFX.pickup(); emitNoise(it.pos, CFG.noise.pickup, 2); msg(`Fusível ${it.n} — leve ao painel na recepção.`, 3); updateCarried(); silenceAmbience(1); }
  if (it.type === 'battery') { it.active = false; it.mesh.visible = false; const gain = OPT.hard ? 20 : 35; fl.battery = Math.min(100, fl.battery + gain); SFX.pickup(); msg(`+${gain}% de bateria`, 2); }
  if (it.type === 'note') { SFX.click(); showDoc(it.title, it.text); }
  if (it.type === 'tape') takeTape(it);
  if (it.type === 'lamp') { it.active = false; it.mesh.visible = false; P.lamps.push(it); SFX.pickup(); emitNoise(it.pos, CFG.noise.pickup, 2); msg('Lâmpada de arco — leve ao console da Sala de Fototerapia.', 3); updateCarried(); setTimeout(() => lastLampToChapel(false), 3500); }
  if (it.type === 'card') takeCard();
  if (it.type === 'crank') takeCrank(it);
  if (it.type === 'phone') answerPhone();
  if (it.type === 'flare') { it.active = false; it.mesh.visible = false; P.flares++; SFX.pickup(); msg('Sinalizador. [G] acende e joga: ele não chega perto da luz vermelha.', 3.5); }
  if (it.type === 'bottle') { it.active = false; it.mesh.visible = false; P.bottles++; SFX.pickup(); msg('Garrafa vazia. [Q] joga longe e faz barulho para distraí-lo.', 3.5); }
  if (it.type === 'foto') { it.active = false; it.mesh.visible = false; SFX.click(); noteExtra('fotos', it.n); showDoc(FOTOS[it.n][0], FOTOS[it.n][1], 'photo'); }
  if (it.type === 'street') { stopTape(false); win(); }
  if (it.type === 'exit') tone({ f: 160, type: 'square', peak: 0.06, d: 0.3 });
  if (it.type === 'door') { if (it.door.key === 'office') useKeypad(); else if (it.door.key === 'foto' || it.door.key === 'foto2') useReader(); else if (it.door.key === 'patio' && !PROG.crank) msg('O mecanismo do portão precisa de uma manivela. A Celeste falou do quarto dela.', 3); else if (it.door.key !== 'patio') tone({ f: 160, type: 'square', peak: 0.06, d: 0.25 }); }
  if (it.type === 'console' && PROG.ch === 3 && !PROG.burned && PROG.lamps.length >= 3 && FOTO.cool <= 0) discharge();
  if (it.type === 'hide') hide(it.spot);
  if (it.type === 'panel' && P.installed >= 5 && !AI.ignition && PROG.ch === 1) startIgnition();
}
function updateCarried() {
  while (carried.children.length) carried.remove(carried.children[0]);
  [...P.carry, ...P.lamps].forEach((f, i) => { const m = f.mesh.clone(); m.children.forEach(c => { if (c.isSprite) c.visible = false; }); m.position.set(i * 0.05, i * 0.02, 0); m.rotation.set(0.3, 0.6, 0); m.scale.setScalar(0.8); carried.add(m); m.visible = true; m.traverse(o => { o.castShadow = false; }); });
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
  const f = P.carry.shift(); P.installed++; updateCarried(); P.installedIds.push(f.n); saveProgress();
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
  SFX.scream(1.6); burst({ f: 200, q: 0.5, peak: 0.9, d: 0.6 }); boom(); if (A.sfx_agarrao) playBuf(A.sfx_agarrao, { gain: 1.5 }); else burst({ f: 3500, q: 0.8, peak: 0.7, a: 0.002, d: 0.4 });
  // posiciona a criatura colada no rosto do jogador
  const cp = camera.position, dx = AI.pos.x - cp.x, dz = AI.pos.z - cp.z, dl = Math.hypot(dx, dz) || 1;
  AI.pos.set(cp.x + dx / dl * 1.15, 0, cp.z + dz / dl * 1.15); AI.yaw = Math.atan2(cp.x - AI.pos.x, cp.z - AI.pos.z);
  C.root.position.set(AI.pos.x, 0, AI.pos.z); C.root.rotation.set(0, AI.yaw, 0); C.root.visible = true; C.spine.rotation.x = 0.85; C.neck.rotation.x = -0.2; C.head.rotation.set(0.2, 0, 0.35);
  C.arms.forEach(a => { a.sh.rotation.x = -1.9; a.el.rotation.x = -0.6; });
  P.deathT = 0; $('fade').style.transition = 'none'; PHANTOM.visible = false;
}
function respawn() {
  if (P.vel) P.vel.set(0, 0, 0); CAM.trauma = 0;
  P.dead = false; P.pos.copy(spawnPoint()); AI.ambushWait = 0; AI.ambush = false; P.yaw = 0; P.pitch = 0; P.crouch = false; P.stamina = 1;
  P.installed = checkpoint.installed; fl.battery = checkpoint.battery; fl.on = true;
  const lostLamps = P.lamps.length;
  P.carry.forEach(f => { f.active = true; f.mesh.visible = true; }); P.carry = [];
  P.lamps.forEach(f => { f.active = true; f.mesh.visible = true; }); P.lamps = []; updateCarried();
  const spawns = [center(9, 30), center(2, 6), center(40, 24), center(38, 3)];
  if (PROG.ch >= 2 && PROG.ch < 4) spawns.push(center(53, 2), center(56, 30), center(63, 10), center(49, 20));
  if (PROG.ch >= 4) spawns.length = 0, spawns.push(center(20, 35), center(12, 43), center(46, 43), center(36, 40), center(28, 36));
  let far = spawns[0], fd = 0; for (const s of spawns) { const d = s.distanceTo(P.pos); if (d > fd) { fd = d; far = s; } }
  AI.pos.copy(far); AI.state = 'patrol'; AI.path = []; AI.suspicion = 0; AI.grace = 8; AI.burnAcc = 0; AI.checkSpot = null; AI.seenEnter = null; AI.stalking = false;
  AI.ignition = false; AI.level = levelFor(); AI.lightExp = 0; C.root.visible = true; C.root.rotation.x = 0;
  if (PROG.ch === 4 && PROG.gateOpen && DAWN.phase !== 'sun') { DAWN.phase = 'run'; DAWN.t = 0; AI.ignition = true; AI.grace = 6; }
  panel.setLever(PROG.ch >= 2); A.sirenG && A.sirenG.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2);
  $('fade').style.transition = ''; $('fade').style.opacity = 0; paused = false; FEAR = 0; PHANTOM.visible = false; C.spine.rotation.x = 0;
  hideSpots.forEach(closeSpot);
  {
    exitDoor.opening = false; exitDoor.open = 0; exitDoor.mesh.position.y = CFG.wallH / 2; grid[idx(21, 26)] = 'X'; grid[idx(22, 26)] = 'X'; rebuildBlocked();
    dawn.on = false; dawn.L.intensity = 0; exitDoor.sign.material.emissiveIntensity = PROG.ch >= 2 ? 1 : 0.3; exitDoor.sign.material.emissive.set(PROG.ch >= 2 ? 0x5a0a08 : 0x0a2a14); exitDoor.it.active = true;
  }
  computeLightGrid();
  if (PROG.ch === 1) msg(P.installed ? `Checkpoint: ${P.installed}/5 fusíveis instalados. Os que você carregava voltaram ao lugar.` : 'Os fusíveis que você carregava voltaram ao lugar.', 4);
  else if (PROG.ch === 2) msg(`Checkpoint — Pavilhão Leste. Fitas: ${PROG.tapes.length}/3.`, 4);
  else if (PROG.ch === 3) msg(`Checkpoint — Pavilhão Leste. Lâmpadas no console: ${PROG.lamps.length}/3.` + (lostLamps ? ' As que você carregava voltaram ao lugar.' : ''), 4);
  else msg(PROG.gateOpen ? 'Checkpoint — galerias. O sol ainda não nasceu: aguente firme.' : 'Checkpoint — galerias.', 4);
}
function win() {
  P.won = true; document.exitPointerLock(); saveJ('formol_save', null);
  const t = (performance.now() - stats.t0) / 1000;
  $('win_sub').textContent = `TEMPO ${Math.floor(t / 60)}m${String(Math.floor(t % 60)).padStart(2, '0')}s · MORTES ${stats.deaths} · FITAS ${PROG.tapes.length}/${Object.keys(TAPEDATA).length}`; saveJ('formol_unlocked', 4);
  $('win').style.display = 'flex'; winExtras(); SFX.birds(); setInterval(SFX.birds, 2500);
  if (A.ctx) { A.sirenG.gain.value = 0; A.tension.gain.value = 0; A.chase.gain.value = 0; A.growlG.gain.value = 0; A.ambG.gain.value = 0.05; }
}


/* ---------------------------------------------------------------
   FITAS CASSETE — tocadas no walkman do Elias (vozes geradas na ElevenLabs)
   V = Dr. Antônio Varela · T = Tomás Aurélio Reis · C = Celeste · O = vigia Osmar
   --------------------------------------------------------------- */
const VOICES = { P: ['SR. REIS (PAI)', 'onwK4e9ZLuTAKqWW03F9'], V: ['DR. VARELA', 'JBFqnCBsd6RMkjVDRZzb'], T: ['TOMÁS', 'TX3LPaxmHKxFdv7VOQHJ'], C: ['CELESTE', 'XrExE9yKIg1WjnnlVkGX'], O: ['OSMAR', 'pqHfZKP75CvOlQylNhV4'] };
const TAPEDATA = {
  1: { ch: 1, title: 'FITA 1 — GRAVADOR DO VIGIA · 03/11/1987, 01h40', lines: [
    ['O', 'Uma e quarenta. O rádio está mudo de novo. Vou deixar isso gravado, caso alguém pergunte depois.'],
    ['O', 'Tem alguém andando no forro do necrotério. Eu sei que é ele. Faz quatro anos que eu finjo que não sei.'],
    ['O', 'A dona Celeste falou pelo alto-falante agora há pouco. Pediu pra eu não apagar as luzes. Eu não apaguei. Alguém arrancou os fusíveis do quadro.'],
    ['O', 'Vou descer pra pegar o do gerador. Se eu não voltar... a porta da frente só abre com o quadro ligado.']] },
  2: { ch: 1, title: 'FITA 2 — ADMISSÃO DO PACIENTE 14 · 19/04/1982', lines: [
    ['V', 'Admissão. Paciente catorze, Tomás Aurélio Reis. Diga para o gravador por que você está aqui, Tomás.'],
    ['T', 'Meu pai diz que eu tenho medo da luz.'],
    ['V', 'E você tem?'],
    ['T', 'Não é medo. Dói. Dói por dentro dos olhos, como se a luz entrasse e não saísse mais.'],
    ['V', 'Seu pai disse que você grita ao amanhecer.'],
    ['T', 'Meu pai não sabe de nada. A minha mãe sabia. Ela fechava as cortinas pra mim.'],
    ['V', 'Aqui nós vamos fechar todas, Tomás. Para sempre, se for preciso.']] },
  3: { ch: 2, title: 'FITA 3 — NOITE LONGA, SESSÃO 001 · 02/06/1982', lines: [
    ['V', 'Programa Noite Longa, sessão um. Paciente catorze. Câmara três selada. Nenhum fóton. Alimentação pela gaveta.'],
    ['T', 'Doutor? Doutor, acende a luz. Só um pouquinho.'],
    ['V', 'Não, Tomás. A partir de hoje, a noite é a sua casa.'],
    ['T', 'Por quanto tempo?'],
    ['V', 'O tempo que a sua mente precisar para esquecer o dia.']] },
  4: { ch: 2, title: 'FITA 4 — NOITE LONGA, SESSÃO 094 · 11/03/1983', lines: [
    ['V', 'Sessão noventa e quatro. Nove meses. As pupilas não contraem mais. A pele perdeu todo o pigmento.'],
    ['V', 'Ele anda no escuro absoluto sem tocar nas paredes. Não fala mais comigo. Ele sorri.'],
    ['C', 'Doutor, ele perguntou de novo que horas são lá fora.'],
    ['V', 'E o que a senhora respondeu, Celeste?'],
    ['C', 'Que ainda é noite.'],
    ['V', 'Ótimo. Amanhã, dia doze, faremos a reexposição. Dez mil lux. Quero ver o que a luz faz com quem esqueceu dela.']] },
  5: { ch: 2, title: 'FITA 5 — SEM DATA', lines: [
    ['V', 'Ele queimou. Gritou por quatro minutos inteiros, e eu não desliguei. Eu precisava ver.'],
    ['V', 'Injetei o formol eu mesmo, para ninguém ver as queimaduras. Gaveta sete. Três dias depois, a gaveta estava aberta. Por dentro.'],
    ['V', 'Ele me visita. Não me mata. Acho que ainda pensa que eu sou o médico dele.'],
    ['V', 'Tranquei o escritório. O código é o dia e o mês em que eu o matei. Doze. Zero três.']] },
  6: { ch: 3, title: 'FITA 6 — REEXPOSIÇÃO · 12/03/1983', lines: [
    ['V', 'Doze de março. Reexposição. Lâmpadas de arco em potência máxima. Ligando.'],
    ['T', 'Mãe! Mãe, apaga! Apaga, por favor!'],
    ['C', 'Doutor, chega! Ele está queimando!'],
    ['V', 'Ainda não, Celeste. Anote: dois minutos.'],
    ['T', 'Mãe... por que você não apaga?'],
    ['C', 'Desliga! Desliga essa máquina!']] },
  7: { ch: 4, title: 'FITA 7 — PARA QUEM ENCONTRAR', lines: [
    ['C', 'Meu nome é Celeste Amaral Reis. Eu não era só a enfermeira do Tomás.'],
    ['C', 'Eu sou a mãe dele.'],
    ['C', 'O pai dele assinou a internação. Eu aceitei trabalhar para o doutor Varela, porque era o único jeito de ficar perto do meu filho.'],
    ['C', 'Durante nove meses eu levei a comida dele pela gaveta. E todo dia ele perguntava que horas eram lá fora. E todo dia eu mentia: ainda é noite, filho.'],
    ['C', 'Ele nunca mais viu o sol por minha causa. Hoje eu vou levar ele até o pátio. Só uma vez. Eu quero que ele veja o dia.'],
    ['C', 'A manivela do portão está em cima da minha cama. Por favor.']] },
  8: { ch: 4, title: 'FITA 8 — GRAVADOR ESCONDIDO · 1983', lines: [
    ['T', 'Gravei escondido. O gravador do doutor ficou na câmara.'],
    ['T', 'Hoje a mulher da comida cantou baixinho do outro lado da porta. Era a música que a minha mãe cantava quando fechava as cortinas.'],
    ['T', 'Eu acho que é ela. Eu acho que ela veio me buscar.'],
    ['T', 'Mãe, se for você... abre a porta. Eu não ligo pra luz. Eu só quero ir pra casa.']] },
  9: { ch: 1, title: 'FITA 9 — TELEFONEMA DO PAI · 1982 (ESCONDERIJO DO VIGIA)', lines: [
    ['P', 'Doutor Varela? Aqui é o pai do Tomás. Recebi a carta. Pode fazer o que achar necessário.'],
    ['V', 'O tratamento é longo, senhor Reis. Ele vai pedir para voltar para casa.'],
    ['P', 'Ele não tem casa. A mãe dele foi embora. Se ele perguntar, diga que ninguém vem buscar.'],
    ['V', 'E a sua esposa? Ela sabe onde ele está?'],
    ['P', 'Não. E é melhor que continue assim.']] }
};
const RADIO_NEW = [
  [9, 'Eu destranquei a capela. O doutor escondeu as lâmpadas dele: no crematório, no altar... e no frio do necrotério, onde ele dormiu.'],
  [10, 'Ele está vivo. Queimado, mas vivo. Fugiu pelo alçapão do crematório, para as galerias.'],
  [11, 'A sobrecarga travou a porta da frente de vez. A única saída agora é o pátio interno, lá embaixo.'],
  [12, 'Meu quarto fica no fim do túnel leste. Tem uma fita lá. Ouça, por favor. Ouça antes de me julgar.'],
  [13, 'Agora o senhor sabe. Leve a manivela até o portão do pátio. Eu vou chamar ele.'],
  [14, 'Faltam poucos minutos para o sol nascer. Corre, senhor eletricista. Ele está vindo.'],
  [15, 'Olha, filho. Já é dia.'],
  [16, 'Me perdoa. Eu menti pra você todos os dias.']
];

/* ---------------------------------------------------------------
   CAPÍTULOS, OBJETIVOS, DOCUMENTOS, FITAS
   I · APAGÃO — 5 fusíveis e a ignição do QG-1
   II · NOITE LONGA — 3 sessões gravadas do Dr. Varela, código do escritório, cartão da diretoria
   III · FORMOL — 3 lâmpadas de arco, atraí-lo para a fototerapia, descarga (ele sobrevive e foge)
   IV · AMANHECER — galerias, a verdade da Celeste, o portão do pátio, sobreviver até o sol nascer
   --------------------------------------------------------------- */
const PROG = { v: 2, ch: 1, tapes: [], office: false, card: false, fotoOpen: false, lamps: [], burned: false, visitedGal: false, crank: false, gateOpen: false, dawn: false, metCeleste: false };
const CHAPTERS = {
  1: ['CAPÍTULO I', 'APAGÃO', 'Instituto São Lázaro, 03:12.\nA energia caiu e a porta blindada travou atrás de você.\n\nEncontre os 5 fusíveis espalhados pelo prédio\ne religue o Quadro Geral na recepção.'],
  2: ['CAPÍTULO II', 'NOITE LONGA', 'A porta blindada não abriu. Mas, em algum lugar do prédio, uma trava cedeu.\n\nO Pavilhão Leste foi lacrado em 1984. Lá funcionava o Programa Noite Longa, do Dr. Antônio Varela.\n\nUma mulher fala com você pelos alto-falantes. Encontre as fitas do doutor e chegue ao escritório da diretoria.'],
  3: ['CAPÍTULO III', 'FORMOL', 'Tomás Aurélio Reis, paciente 14, morreu em 12 de março de 1983.\nTrês dias depois, saiu da gaveta 7.\n\nA luz que o matou é a única coisa que pode pará-lo.'],
  4: ['CAPÍTULO IV', 'AMANHECER', '05:41. A descarga não o matou.\nEle fugiu para as galerias sob o instituto, e a porta da frente travou de vez.\n\nA única saída é o Pátio Interno.\nO sol nasce às 06:04.']
};
const CH_NAMES = ['', 'APAGÃO', 'NOITE LONGA', 'FORMOL', 'AMANHECER'];
function saveProgress() {
  saveJ('formol_save', { v: 2, ch: PROG.ch, ids: P.installedIds, tapes: PROG.tapes, office: PROG.office, card: PROG.card, fotoOpen: PROG.fotoOpen, lamps: PROG.lamps, burned: PROG.burned, visitedGal: PROG.visitedGal, crank: PROG.crank, gateOpen: PROG.gateOpen, heard7: !!PROG.heard7, met: !!PROG.metCeleste });
  unlockChapter(PROG.ch);
}
function unlockChapter(n) { const u = loadJ('formol_unlocked') || 1; if (n > u) saveJ('formol_unlocked', n); }
function setCheckpoint() { checkpoint = { installed: P.installed, battery: Math.max(fl.battery, 40) }; }
function spawnPoint() { return PROG.ch >= 4 ? center(53, 35) : PROG.ch >= 2 ? center(45, 13) : START.clone(); }
function levelFor() { return PROG.ch >= 3 ? 4 : PROG.ch === 2 ? 3 : P.installed >= 3 ? 3 : P.installed >= 1 ? 2 : 1; }
function regionOpen(rg) {
  const need = REGION_CH[rg] || 1; if (PROG.ch < need) return false;
  if (rg === 'diretoria') return PROG.office; if (rg === 'fototerapia') return PROG.fotoOpen; if (rg === 'patio') return PROG.gateOpen;
  return true;
}
const MAIN_SECTORS = new Set(['recepcao', ...SECTOR_ORDER]);
function applyLights() {   // capítulo II em diante: quais luzes estão acesas
  if (PROG.ch < 2) return;
  for (const l of LIGHTS) {
    const s = l.sector; let on = l.on;
    if (MAIN_SECTORS.has(s)) on = PROG.ch < 4;                         // a sobrecarga do cap. III queimou o QG-1
    else if (s === 'corredor' || s === 'subsolo' || s === 'leste') on = true;   // emergência a bateria
    else if (s === 'diretoria' || s === 'gravacao') on = PROG.ch < 4;
    else if (REGION_CH[s]) on = PROG.ch >= REGION_CH[s];
    if (on !== l.on) { l.on = on; l.flickT = on ? 1 : 0; }
  }
  computeLightGrid();
}
function eastLights() { applyLights(); }

// ---------- telas de documento e de capítulo (pausam o jogo) ----------
const UI = { modal: null, t0: 0, onClose: null };
function showDoc(title, body, kind, onClose) {
  UI.modal = 'doc'; UI.t0 = performance.now(); UI.onClose = onClose || null;
  $('doc_t').textContent = title; $('doc_b').textContent = body; $('doc_p').className = 'paper' + (kind ? ' ' + kind : '');
  $('doc').style.display = 'flex'; $('doc_p').scrollTop = 0;
}
function showChapter(n, onClose) {
  const [a, b, c] = CHAPTERS[n]; UI.modal = 'chap'; UI.t0 = performance.now(); UI.onClose = onClose || null;
  $('chap_n').textContent = a; $('chap_t').textContent = b; $('chap_b').textContent = c;
  const el = $('chap'); el.style.display = 'flex'; requestAnimationFrame(() => { el.style.opacity = 1; });
  $('chap_k').style.opacity = 0; setTimeout(() => { if (UI.modal === 'chap') $('chap_k').style.opacity = 1; }, 2200);
  boom(); unlockChapter(n);
}
function closeModal() {
  if (!UI.modal) return; if (performance.now() - UI.t0 < (UI.modal === 'chap' ? 2200 : 350)) return;
  if (UI.modal === 'doc') $('doc').style.display = 'none';
  else { const el = $('chap'); el.style.opacity = 0; setTimeout(() => { if (UI.modal !== 'chap') el.style.display = 'none'; }, 1200); }
  UI.modal = null; const f = UI.onClose; UI.onClose = null; SFX.click(); if (f) f();
}
addEventListener('wheel', e => { if (UI.modal === 'doc') $('doc_p').scrollTop += e.deltaY; });

// ---------- walkman: as fitas tocam enquanto você anda (legenda embaixo) ----------
const TP = { n: 0, token: 0, src: null, hiss: null };
const wait = ms => new Promise(r => setTimeout(r, ms));
function tapeFx(buf) {
  const ctx = A.ctx, src = ctx.createBufferSource(); src.buffer = buf;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.7; lg.gain.value = 0.004; lfo.connect(lg).connect(src.playbackRate); lfo.start(); src.onended = () => { try { lfo.stop(); } catch (e) { } };
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
  const g = ctx.createGain(); g.gain.value = 1.0;
  src.connect(hp).connect(lp).connect(g).connect(A.master); src.start(); return src;
}
function hissOn(on) {
  if (!A.ctx) return;
  if (on && !TP.hiss) { const n = loopNoise(A.noise), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 4500; f.Q.value = 0.6; g.gain.value = 0.012; n.connect(f).connect(g).connect(A.master); TP.hiss = { n, g }; }
  if (!on && TP.hiss) { try { TP.hiss.n.stop(); } catch (e) { } TP.hiss = null; }
}
function playTape(n) {
  stopTape(false); const d = TAPEDATA[n]; if (!d) return; TP.n = n; const tok = ++TP.token;
  $('walk').innerHTML = `▶ ${d.title}<small>T · parar</small>`; $('walk').style.opacity = 1;
  tone({ f: 600, f2: 420, type: 'square', peak: 0.04, d: 0.08 }); hissOn(true);
  (async () => {
    await wait(700);
    for (let i = 0; i < d.lines.length; i++) {
      if (tok !== TP.token) return;
      const [who, txt] = d.lines[i], buf = A.tapes && A.tapes[n] && A.tapes[n][i];
      const dur = buf ? buf.duration : 1 + txt.length * 0.065;
      $('tsub').innerHTML = `<b>${VOICES[who][0]}:</b> ${txt}`; $('tsub').style.opacity = 1;
      if (buf && A.ctx) TP.src = tapeFx(buf);
      await wait(dur * 1000 + 450);
    }
    if (tok === TP.token) stopTape(true);
  })();
}
function stopTape(ended) {
  const n = TP.n; TP.token++; if (TP.src) { try { TP.src.stop(); } catch (e) { } } TP.src = null; hissOn(false);
  $('tsub').style.opacity = 0; $('walk').style.opacity = 0; TP.n = 0;
  if (n) tone({ f: 420, f2: 300, type: 'square', peak: 0.03, d: 0.06 });
  if (n && ended) onTapeEnd(n);
}
function onTapeEnd(n) {
  if (MANDATORY_TAPES.includes(n) && PROG.ch === 2) { const k = MANDATORY_TAPES.filter(t => PROG.tapes.includes(t)).length; msg(k >= 3 ? 'Doze, zero três. O código do escritório: 1-2-0-3.' : `Sessões do Dr. Varela: ${k}/3`, 4); }
  if (n === 5) eliasSay(5, 0.6);
  if (n === 7) { PROG.heard7 = true; saveProgress(); }
  if (n === 7 && PROG.ch === 4) { eliasSay(10, 0.4); setTimeout(() => radio([13]), 4000); }
}
function takeTape(it) {
  it.active = false; it.mesh.visible = false; if (!PROG.tapes.includes(it.n)) PROG.tapes.push(it.n);
  saveProgress(); setCheckpoint(); SFX.click(); msg('Você coloca a fita no walkman.', 2); noteExtra('fitas', it.n);
  playTape(it.n);
}
function openTapeList() {
  const ul = $('tapeList'); ul.innerHTML = '';
  const got = Object.keys(TAPEDATA).map(Number).filter(n => PROG.tapes.includes(n));
  if (!got.length) { ul.innerHTML = '<li class="dis">NENHUMA FITA ENCONTRADA</li>'; }
  for (const n of got) { const li = document.createElement('li'); li.textContent = TAPEDATA[n].title; li.onclick = () => { uiSfx('sel'); showPanel(null); resumeGame(); playTape(n); }; ul.appendChild(li); }
  $('tapeCount').textContent = `${got.length}/${Object.keys(TAPEDATA).length} FITAS`;
  showPanel('p_tapes');
}

// ---------- objetivo no HUD ----------
let objCache = '';
function updateObjective() {
  const head = `CAPÍTULO ${['', 'I', 'II', 'III', 'IV'][PROG.ch]} · ${CH_NAMES[PROG.ch]}`;
  let t = '';
  if (PROG.ch === 1) {
    if (P.installed < 5) t = `Fusíveis no painel <b>${P.installed}</b>/5<br><small>${P.carry.length ? 'carregando: ' + P.carry.length : 'leve-os ao Quadro Geral, na recepção'}</small>`;
    else t = AI.ignition ? 'Sobreviva à ignição' : 'Puxe a alavanca de ignição no painel';
  } else if (PROG.ch === 2) {
    const k = MANDATORY_TAPES.filter(n => PROG.tapes.includes(n)).length;
    if (k < 3) t = `Sessões gravadas do Dr. Varela <b>${k}</b>/3<br><small>câmaras de privação · sala de gravação</small>`;
    else if (!PROG.office) t = 'Abra o escritório da diretoria<br><small>código: 1-2-0-3</small>';
    else t = 'Reviste o escritório do Dr. Varela';
  } else if (PROG.ch === 3) {
    const L = [];
    if (!PROG.fotoOpen) L.push('Use o cartão na Sala de Fototerapia');
    if (PROG.lamps.length < 3) L.push(`Lâmpadas de arco no console <b>${PROG.lamps.length}</b>/3` + (P.lamps.length ? `<br><small>carregando: ${P.lamps.length}</small>` : '') + (PROG.lamps.length + P.lamps.length === 2 ? '<br><small>a última está na capela, ao lado do altar</small>' : ''));
    else if (!PROG.burned) L.push(FOTO.cool > 0 ? 'Capacitores recarregando…' : 'Atraia-o para a Sala de Fototerapia<br><small>apague a lanterna · descarga no console quando ele entrar</small>');
    t = L.join('<br>');
  } else {
    if (DAWN.phase === 'sun') t = 'Saia pelo portão do pátio';
    else if (DAWN.phase === 'run') { const left = Math.max(0, CFG.dawnTime - DAWN.t), m = 4 - Math.floor(left / (CFG.dawnTime / 4)); t = `Sobreviva até o amanhecer<br><b>06:0${Math.min(4, Math.max(0, m))}</b> <small>· ${Math.ceil(left)} s</small>`; }
    else if (!PROG.visitedGal) t = 'Desça às galerias pelo alçapão do crematório';
    else if (!PROG.tapes.includes(7)) t = 'Encontre o quarto da enfermeira Celeste<br><small>fim do túnel leste das galerias</small>';
    else if (!PROG.crank) t = 'Pegue a manivela do portão<br><small>quarto da Celeste</small>';
    else t = 'Abra o portão do Pátio Interno com a manivela<br><small>túnel sul das galerias</small>';
  }
  const html = `<div class="ch">${head}</div>${t}`;
  if (html !== objCache) { objCache = html; $('obj').innerHTML = html; }
}

// ---------- alto-falante: a enfermeira-chefe Celeste (voz gravada na ElevenLabs) ----------
const RADIO_LINES = [
  'Obrigada, senhor eletricista.',
  'Faz quatro anos que ninguém acende as luzes para nós.',
  'A porta da frente obedece à diretoria. Venha até o Pavilhão Leste. Eu destranquei para o senhor.',
  'E não deixe que ele o veja com essa lanterna. Ele aprendeu a odiar a luz com a gente.',
  'Meu nome é Celeste. Eu era a enfermeira-chefe do doutor Varela. As fitas dele contam o resto… Eu só levava a comida.',
  'O doutor está aí dentro, não está? Ele finalmente teve coragem. Eu nunca tive.',
  'Apague a lanterna. Ele sempre vem até quem está no escuro. Ele sempre veio até mim.',
  'Desculpa, Tomás… Desculpa.',
  'A porta está aberta, senhor eletricista. Vá embora. E não olhe para trás.',
  ...RADIO_NEW.map(r => r[1])
];
let radioBusy = Promise.resolve();
function radioFx(buf, direct) {
  const ctx = A.ctx, t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = direct ? 1.1 : 0.85;
  if (direct) {   // voz ao vivo, no pátio (espacial)
    const pan = ctx.createPanner(); Object.assign(pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 3, rolloffFactor: 0.8, maxDistance: 60 });
    pan.positionX.value = CELESTE.position.x; pan.positionY.value = 1.4; pan.positionZ.value = CELESTE.position.z;
    src.connect(g).connect(pan); pan.connect(A.master); const sd = ctx.createGain(); sd.gain.value = 0.25; pan.connect(sd).connect(A.verb);
    src.start(t + 0.05); return src;
  }
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
  const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1700; pk.Q.value = 1.2; pk.gain.value = 6;
  const sh = ctx.createWaveShaper(), cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); } sh.curve = cv;
  const send = ctx.createGain(); send.gain.value = 0.55;            // o prédio inteiro ecoa
  const dl = ctx.createDelay(1); dl.delayTime.value = 0.23; const fb = ctx.createGain(); fb.gain.value = 0.28; const dg = ctx.createGain(); dg.gain.value = 0.22;
  src.connect(hp).connect(lp).connect(pk).connect(sh).connect(g); g.connect(A.master); g.connect(send).connect(A.verb);
  g.connect(dl); dl.connect(fb).connect(dl); dl.connect(dg).connect(A.master);
  src.start(t + 0.12); return src;
}
function radioSay(i, direct) {
  return new Promise(res => {
    const buf = A.radio && A.radio[i], who = direct ? 'CELESTE' : PROG.metCeleste ? 'CELESTE (ALTO-FALANTE)' : 'ALTO-FALANTE';
    const dur = buf ? buf.duration + 0.25 : 1.2 + RADIO_LINES[i].length * 0.065;
    msg(who + ' — ' + RADIO_LINES[i], dur + 0.8);
    if (!direct) { burst({ f: 1500, q: 1.2, peak: 0.08, a: 0.01, d: 0.25 }); tone({ f: 950, f2: 720, type: 'square', peak: 0.012, d: 0.1 }); }
    if (buf && A.ctx) radioFx(buf, direct);
    setTimeout(() => { if (!direct) burst({ f: 2200, q: 1, peak: 0.05, a: 0.005, d: 0.18 }); res(); }, dur * 1000 + 350);
  });
}
function radio(ids, done, direct) {   // fala em sequência, sem atropelar outra transmissão
  radioBusy = radioBusy.then(async () => { for (const i of ids) { if (i === 4) PROG.metCeleste = true; await radioSay(i, direct); await wait(450); } if (done) done(); });
}

// ---------- fim do capítulo I ----------
function endChapter1() {
  PROG.ch = 2; AI.ignition = false; AI.ignT = 0; AI.level = 3;
  if (A.sirenG) A.sirenG.gain.setTargetAtTime(0, A.ctx.currentTime, 0.6);
  exitDoor.sign.material.emissive.set(0x5a0a08); exitDoor.sign.material.emissiveIntensity = 1;
  SFX.door(); addTrauma(0.35); AI.flee(12, true); eliasSay(3, 1.5); chapterEnd(1); chapterBegin(2);
  msg('A porta blindada não se move. No visor: TRAVA DE SEGURANÇA — AUTORIZAÇÃO DA DIRETORIA.', 5);
  saveProgress(); setCheckpoint();
  setTimeout(() => {
    openDoor(DOORS.fogo); SFX.clank({ x: 43 * CS, y: 2, z: 14 * CS }); applyLights();
    radio([0, 1, 2, 3], () => { if (!P.dead) cutscene(CUTS.fogo, () => showChapter(2)); });
  }, 5200);
}
// ---------- capítulo II ----------
function useKeypad() {
  if (MANDATORY_TAPES.some(n => !PROG.tapes.includes(n))) { tone({ f: 220, type: 'square', peak: 0.08, d: 0.25 }); msg('Você não sabe o código. As sessões gravadas do Dr. Varela devem dizer.', 3); return; }
  [0, 1, 2, 3].forEach(i => setTimeout(() => tone({ f: 1400 + i * 120, type: 'square', peak: 0.05, d: 0.06 }), i * 180));
  setTimeout(() => { tone({ f: 2000, f2: 2400, type: 'square', peak: 0.06, d: 0.15 }); PROG.office = true; openDoor(DOORS.office); saveProgress(); msg('1-2-0-3. A trava estala.', 3); setTimeout(() => radio([5]), 3200); }, 900);
}
function takeCard() {
  CARD.active = false; CARD.mesh.visible = false; PROG.card = true; SFX.pickup(); saveProgress();
  chapterEnd(2); chapterBegin(3);
  showDoc(LETTER[0], LETTER[1], 'letter', () => cutscene(CUTS.varela, startChapter3));
}
// ---------- capítulo III ----------
function startChapter3() {
  PROG.ch = 3; LAMPS.forEach(l => { if (!PROG.lamps.includes(l.n)) { l.active = true; l.mesh.visible = true; } });
  AI.level = 4; openDoor(DOORS.capela); applyLights(); saveProgress(); setCheckpoint();
  showChapter(3, () => { radio([9]); eliasSay(7, 9); setTimeout(() => SFX.scream(2), 700); AI.lastKnown = P.pos.clone(); AI.setState('hunt'); AI.goTo(P.pos, false); });
}
function useReader() {
  if (!PROG.card) { tone({ f: 180, type: 'square', peak: 0.08, d: 0.3 }); msg('ACESSO RESTRITO À DIRETORIA CLÍNICA.', 2.5); return; }
  tone({ f: 1800, f2: 2200, type: 'square', peak: 0.06, d: 0.15 }); PROG.fotoOpen = true; openDoor(DOORS.foto); openDoor(DOORS.foto2); saveProgress();
  msg('Sala de Fototerapia liberada. As duas portas destravaram.', 3);
}
function installLamp() {
  const l = P.lamps.shift(); if (!l) return; PROG.lamps.push(l.n); updateCarried(); CONSOLE.show(PROG.lamps.length - 1);
  SFX.zap(); emitNoise(CONSOLE.pos, CFG.noise.install, 3); saveProgress(); setCheckpoint();
  msg(PROG.lamps.length >= 3 ? 'Três lâmpadas. Apague a lanterna e espere ele entrar na sala.' : `Lâmpada encaixada: ${PROG.lamps.length}/3`, 4);
  if (PROG.lamps.length >= 3) setTimeout(() => radio([6]), 4500);
}
function discharge() {
  FOTO.cool = 14; FOTO.flashT = 2.8; SFX.zap(); boom(); addTrauma(0.9); CONSOLE.lever.rotation.x = 0.6;
  setTimeout(() => { CONSOLE.lever.rotation.x = -0.6; }, 1500);
  const [ax, az] = cellOf(AI.pos);
  if (ax >= 55 && ax <= 64 && az >= 16 && az <= 25 && AI.state !== 'dead' && AI.state !== 'dying') burnCreature();
  else { msg('Ele não estava na sala. Os capacitores recarregam… e ele ouviu.', 4); emitNoise(CONSOLE.pos, 80, 3); }
}
function burnCreature() {   // ele queima… e foge pelo alçapão do crematório
  PROG.burned = true; saveProgress();
  AI.state = 'dying'; AI.t = 0; AI.speed = 0; AI.path = []; AI.burnAcc = 1; AI.dyingKind = 'burn'; stats.burns++;
  SFX.scream(3.5); setTimeout(() => SFX.scream(2.5), 1300);
  msg('Dez mil lux.', 3);
  setTimeout(() => msg('Por um instante, no meio da luz, você vê um rapaz de dezenove anos cobrindo os olhos.', 5), 2600);
  setTimeout(() => {   // ele se levanta e some na escuridão
    AI.state = 'dead'; C.root.visible = false; AI.pos.set(-60, 0, -60); C.root.rotation.x = 0;
    SFX.clank({ x: 53 * CS, y: 1, z: 32 * CS }); openDoor(DOORS.alcapao); msg('Um estrondo metálico no crematório. O alçapão da escada de serviço foi arrancado.', 5);
  }, 5200);
  setTimeout(() => {   // o QG-1 não aguenta a sobrecarga: o prédio volta ao escuro
    boom(); PROG.ch = 4; applyLights(); openDoor(DOORS.grade); saveProgress(); setCheckpoint();
    chapterEnd(3); chapterBegin(4);
    radio([7, 10, 11], () => { if (!P.dead) cutscene(CUTS.alcapao, () => showChapter(4, startChapter4)); });
  }, 8500);
}
// ---------- capítulo IV ----------
const DAWN = { phase: '', t: 0 };
function startChapter4() {
  AI.state = 'patrol'; AI.path = []; AI.pos.copy(center(20, 35)); AI.level = 4; AI.grace = 10; AI.burnAcc = 0; C.root.visible = true; C.root.rotation.x = 0;
  msg('A rede inteira caiu. Só restam as luzes de emergência.', 4);
}
function takeCrank(it) {
  it.active = false; it.mesh.visible = false; PROG.crank = true; SFX.pickup(); saveProgress(); setCheckpoint();
  msg('Manivela do portão do pátio. Pesada, enferrujada.', 3);
}
function startDawnRun() {
  PROG.gateOpen = true; openDoor(DOORS.patio); saveProgress(); setCheckpoint();
  DAWN.phase = 'run'; DAWN.t = 0; AI.ignition = true; AI.grace = 0; AI.lastKnown = P.pos.clone(); AI.setState('chase');
  moon.on = true; computeLightGrid(); emitNoise(P.pos, 80, 3);
  radio([14]); eliasSay(11, 4);
}
function sunrise() {
  DAWN.phase = 'sun'; AI.ignition = false; AI.state = 'sunwalk'; AI.path = []; AI.t = 0; AI.goTo(center(30, 46), false);
  STREET.active = true; scene.background = new THREE.Color(0x2a2a3a); SUN.castShadow = OPT.gfx === 2;
  msg('06:04.', 3);
  setTimeout(() => msg('O sol nasce sobre o pátio. Ele para. Pela primeira vez em cinco anos, ele vê o dia.', 6), 3000);
  if (PROG.heard7) { setTimeout(() => radio([15, 16], () => radio([8], null, true), true), 6500); eliasSay(12, 15); }
  else { CELESTE.visible = false; setTimeout(() => msg('Não há ninguém no pátio esperando por ele.', 5), 9500); eliasSay(13, 16); }
  setMusic('mus_dawn', 0.22);
}

/* ---------------------------------------------------------------
   SELEÇÃO DE CAPÍTULOS — começa um capítulo do zero, com o progresso anterior resolvido
   --------------------------------------------------------------- */
function chapterStartSave(n) {
  const base = { v: 2, ids: [1, 2, 3, 4, 5], met: true };
  if (n === 2) return { ...base, ch: 2, met: false };
  if (n === 3) return { ...base, ch: 3, tapes: [3, 4, 5], office: true, card: true };
  if (n === 4) return { ...base, ch: 4, tapes: [3, 4, 5], office: true, card: true, fotoOpen: true, lamps: [1, 2, 3], burned: true };
  return null;
}
function refreshChapters() {
  const u = Math.max(loadJ('formol_unlocked') || 1, (loadJ('formol_save') || {}).ch || 1);
  document.querySelectorAll('#chapItems li').forEach(li => { const n = +li.dataset.ch; li.classList.toggle('dis', n > u); li.querySelector('small').textContent = n > u ? 'BLOQUEADO' : CHAPTERS[n][1]; });
}
function playChapter(n) {
  if (n === 1) { newGame(); return; }
  saveJ('formol_save', chapterStartSave(n)); showPanel(null); continueGame();
}


/* ---------------------------------------------------------------
   TERROR — sustos roteirizados (com silêncio antes), vozes da criatura,
   imitação da Celeste, medo/alucinações, objetos que fazem barulho,
   lanterna que falha perto dele, modo Pesadelo
   --------------------------------------------------------------- */
let HUSH = 0, FEAR = 0;
const SCARE = { done: new Set(), t: 0, phantomCD: 30, fakeCD: 20, voiceCD: 12, mimicCD: 90 };
function hush(sec) { HUSH = sec; silenceAmbience(sec + 0.5); }
// toca um buffer gravado (voz/efeito) com opções: posição 3D, tom, eco, filtro de telefone, trecho
function playBuf(buf, o = {}) {
  if (!A.ctx || !buf) return null; const ctx = A.ctx, src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = o.rate || 1;
  let node = src;
  if (o.phone) { const a = ctx.createBiquadFilter(), b = ctx.createBiquadFilter(); a.type = 'highpass'; a.frequency.value = 350; b.type = 'lowpass'; b.frequency.value = 3100; node.connect(a).connect(b); node = b; }
  if (o.dark) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.dark; node.connect(lp); node = lp; }
  const g = ctx.createGain(); g.gain.value = o.gain ?? 1; node.connect(g); let out = g;
  if (o.pos) { const p = ctx.createPanner(); Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: o.ref || 2.5, rolloffFactor: 1.1, maxDistance: 70 }); p.positionX.value = o.pos.x; p.positionY.value = o.pos.y ?? 1.5; p.positionZ.value = o.pos.z; g.connect(p); out = p; }
  out.connect(A.master); if (o.verb) { const sd = ctx.createGain(); sd.gain.value = o.verb; out.connect(sd).connect(A.verb); }
  if (o.dur) src.start(0, o.offset || 0, o.dur); else src.start(0, o.offset || 0);
  return src;
}
// efeitos sintetizados (sem custo de API)
const HB = k => A[k];   // buffer gravado, se carregou
const HSFX = {
  slam(pos) { if (HB('sfx_porta')) { playBuf(HB('sfx_porta'), { pos, gain: 1.4, verb: 0.6, ref: 4 }); addTrauma(0.5); return; } spatialOneShot(pos, p => { tone({ f: 70, f2: 28, peak: 0.9, d: 0.9, dest: p }); burst({ f: 180, type: 'lowpass', peak: 0.9, d: 0.7, dest: p }); for (const f of [420, 610, 980]) burst({ f, q: 30, peak: 0.35, d: 1.6, dest: p }); }); addTrauma(0.5); },
  scratch(pos, len = 2.4) { if (HB('sfx_unhas')) { playBuf(HB('sfx_unhas'), { pos, gain: 1.1, verb: 0.4, dur: len + 0.4 }); return; } spatialOneShot(pos, p => { for (let i = 0; i < 7; i++) setTimeout(() => burst({ f: rand(3500, 6000), q: 6, peak: 0.25, a: 0.05, d: 0.28, dest: p }), i * len / 7 * 1000); }); },
  squeak(pos) { if (HB('sfx_maca')) { playBuf(HB('sfx_maca'), { pos, gain: 1.2, verb: 0.5, ref: 4 }); return; } spatialOneShot(pos, p => { for (let i = 0; i < 6; i++) setTimeout(() => tone({ f: rand(1700, 2300), f2: rand(1500, 2600), peak: 0.07, d: 0.18, dest: p }), i * 380 + rand(0, 120)); }); },
  drip(pos) { spatialOneShot(pos, p => tone({ f: rand(900, 1500), f2: rand(400, 700), peak: 0.12, d: 0.12, dest: p })); },
  sniff(pos) { spatialOneShot(pos, p => { for (let i = 0; i < 3; i++) setTimeout(() => burst({ f: 1400, q: 1.2, peak: 0.35, a: 0.04, d: 0.16, dest: p }), i * 210); }); },
  knock(pos) { spatialOneShot(pos, p => { for (let i = 0; i < 3; i++) setTimeout(() => { burst({ f: 220, q: 2, peak: 0.6, d: 0.12, dest: p }); tone({ f: 110, f2: 70, peak: 0.25, d: 0.1, dest: p }); }, i * 330); }); },
  steps(pos, n = 3) { spatialOneShot(pos, p => { for (let i = 0; i < n; i++) setTimeout(() => burst({ f: 240, q: 1.4, peak: 0.45, d: 0.12, dest: p, rate: rand(.7, .9) }), i * 520); }); },
  clatter(kind, pos) {
    const rb = kind === 'tray' ? HB('sfx_bandeja') : HB('sfx_garrafa');
    if (rb) { playBuf(rb, { pos, gain: 1.3, verb: 0.35, rate: kind === 'can' ? rand(1.2, 1.35) : rand(0.93, 1.07), ref: 3 }); return; }
    spatialOneShot(pos, p => {
    if (kind === 'bottle') { for (const f of [2300, 3150, 4100]) burst({ f, q: 40, peak: 0.25, d: 0.35, dest: p }); for (let i = 0; i < 5; i++) setTimeout(() => burst({ f: 2600, q: 8, peak: 0.12, d: 0.05, dest: p }), 120 + i * 130); }
    else if (kind === 'tray') { for (const f of [540, 1210, 1830, 2570]) burst({ f, q: 50, peak: 0.4, d: 0.9, dest: p }); burst({ f: 3000, type: 'highpass', peak: 0.3, d: 0.08, dest: p }); }
    else { for (const f of [800, 1650]) burst({ f, q: 25, peak: 0.3, d: 0.4, dest: p }); for (let i = 0; i < 4; i++) setTimeout(() => burst({ f: 1200, q: 6, peak: 0.12, d: 0.05, dest: p }), 100 + i * 110); }
  }); }
};
// vozes da criatura: trechos do Tomás gravados nas fitas, mais graves e com eco
const CREATURE_VOICES = [[6, 1], [6, 4], [3, 1], [2, 3]];
const WHISPERS = ['voz_mae', 'voz_apaga', 'voz_apagaluz', 'voz_horas', 'voz_noite', 'voz_vendo'];
function creatureVoice(pos, gain = 0.9) {
  if (Math.random() < 0.3 && HB('sfx_rosnado')) { playBuf(HB('sfx_rosnado'), { pos, gain: gain * 1.2, verb: 0.5, rate: rand(0.85, 1), ref: 3 }); return; }
  const w = HB(pick(WHISPERS));
  if (w) { playBuf(w, { pos, rate: rand(0.78, 0.88), gain, verb: 0.8, dark: 2200, ref: 3 }); return; }
  const [n, i] = pick(CREATURE_VOICES), buf = A.tapes && A.tapes[n] && A.tapes[n][i]; if (!buf) { HSFX.sniff(pos); return; } playBuf(buf, { pos, rate: rand(0.7, 0.8), gain, verb: 0.7, dark: 1800, ref: 3 });
}

// ---------- objetos do cenário para os sustos ----------
// gaveta 7 do necrotério (sai da parede da câmara fria)
const DRAWER = new THREE.Group();
{
  DRAWER.position.set(0 * CS + 2 - 0.95, 1.05, 22 * CS + 1); level.add(DRAWER);
  box(1.9, 0.5, 0.95, M.steel, 0, 0, 0, DRAWER);
  const lb = tex(64, 32, (g, w, h) => { g.fillStyle = '#d6cfb6'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.fillText('7', w / 2, 25); });
  const l = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshStandardMaterial({ map: lb })); l.position.set(0.951, 0.1, 0); l.rotation.y = Math.PI / 2; DRAWER.add(l);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8, 8, 4), M.sheet); sheet.rotation.x = -Math.PI / 2; sheet.position.y = 0.26; { const p = sheet.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.random() * 0.04); sheet.geometry.computeVertexNormals(); } DRAWER.add(sheet);
  DRAWER.userData.out = 0;
}
// telefone da recepção
const PHONE = { ring: 0, it: null, answered: false, next: 0 };
{
  const g = new THREE.Group(); g.position.copy(center(24, 21)); g.position.y = 0; level.add(g);
  box(0.6, 0.75, 0.45, M.wood, 0, 0.375, 0, g);   // mesinha
  box(0.24, 0.08, 0.2, M.dark, 0, 0.79, 0, g); const hs = box(0.24, 0.05, 0.06, M.dark, 0, 0.86, 0, g);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16), M.steel); dial.position.set(0, 0.835, 0.05); g.add(dial);
  props.push({ i: idx(24, 21), block: true }); rebuildBlocked();
  PHONE.handset = hs; PHONE.pos = new THREE.Vector3(g.position.x, 0.8, g.position.z);
  PHONE.it = { type: 'phone', pos: new THREE.Vector3(g.position.x, 0, g.position.z + 1.2), active: false }; interact.push(PHONE.it);
}
// vulto (alucinação): silhueta negra que some quando a luz encosta
const PHANTOM = new THREE.Group();
{
  const mb = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.92 });
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.5, 4, 10), mb); b.position.y = 1.15; b.scale.z = 0.6; PHANTOM.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mb); h.position.set(0, 2.18, 0.05); h.scale.y = 1.3; PHANTOM.add(h);
  for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 1.25, 3, 6), mb); a.position.set(s * 0.26, 1.05, 0); a.rotation.z = s * 0.08; PHANTOM.add(a); }
  PHANTOM.visible = false; PHANTOM.userData = { t: 0, lit: 0 }; scene.add(PHANTOM);
}
// objetos soltos no chão: chutar faz barulho (agachado não)
const DEBRIS = [];
{
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x2c4a2a, roughness: 0.15, transparent: true, opacity: 0.8 });
  const cells = []; for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) { const i = idx(x, z); if (blocked[i]) continue; const rg = regionAt(x, z); if (rg === 'rua' || rg === 'recepcao' || rg === 'patio') continue; cells.push([x, z, rg]); }
  const nearItem = (x, z) => interact.some(it => Math.abs(Math.floor(it.pos.x / CS) - x) + Math.abs(Math.floor(it.pos.z / CS) - z) <= 1);
  let n = 0;
  for (let k = 0; k < 400 && n < 70; k++) {
    const [x, z, rg] = pick(cells); if (nearItem(x, z)) continue;
    const kind = pick(['bottle', 'bottle', 'tray', 'can']), c = center(x, z), g = new THREE.Group();
    g.position.set(c.x + rand(-.6, .6), 0, c.z + rand(-.6, .6)); g.rotation.y = rand(0, 6.3);
    if (kind === 'bottle') { const m = cyl(0.035, 0.035, 0.24, glass, 0, 0.035, 0, g, 8); m.rotation.z = Math.PI / 2; }
    else if (kind === 'tray') { const m = box(0.45, 0.02, 0.32, M.steel, 0, 0.012, 0, g); m.rotation.z = rand(-.05, .05); for (let i = 0; i < 3; i++) { const t = box(0.12, 0.004, 0.02, M.steel, rand(-.15, .15), 0.025, rand(-.1, .1), g); t.rotation.y = rand(0, 3); } }
    else { const m = cyl(0.033, 0.033, 0.12, M.rust, 0, 0.033, 0, g, 8); m.rotation.z = Math.PI / 2; }
    level.add(g); DEBRIS.push({ g, kind, cd: 0, vx: 0, vz: 0 }); n++;
  }
}

// ---------- sustos roteirizados ----------
function scareOnce(key) { if (SCARE.done.has(key)) return false; SCARE.done.add(key); return true; }
function facing(p, minDot = 0.35) { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), dx = p.x - P.pos.x, dz = p.z - P.pos.z, d = Math.hypot(dx, dz) || 1; return (dx * fx + dz * fz) / d > minDot; }
function updateScares(dt, time) {
  const sinceStart = (performance.now() - stats.t0) / 1000;
  // 1) gaveta 7 se abre sozinha
  if (P.region === 'necroterio' && sinceStart > 50 && !SCARE.done.has('gaveta')) {
    const dp = Math.hypot(P.pos.x - (DRAWER.position.x + 1), P.pos.z - DRAWER.position.z);
    if (dp < 7 && facing(DRAWER.position, 0.25) && scareOnce('gaveta')) {
      hush(2.8);
      setTimeout(() => { playBuf(A.sfx_gaveta, { pos: DRAWER.position, gain: 1.4, verb: 0.4 }); DRAWER.userData.opening = true; puff(new THREE.Vector3(DRAWER.position.x + 1.2, 1.2, DRAWER.position.z), 6, false); }, 2600);
      setTimeout(() => { const b = HB('voz_mae'); if (b) playBuf(b, { pos: DRAWER.position, rate: 0.8, gain: 0.8, verb: 1, dark: 1800 }); else { const t = A.tapes && A.tapes[6] && A.tapes[6][1]; if (t) playBuf(t, { pos: DRAWER.position, rate: 0.72, gain: 0.7, verb: 0.9, dark: 1500, dur: 0.9 }); } }, 5400);
    }
  }
  if (DRAWER.userData.opening && DRAWER.userData.out < 1) { DRAWER.userData.out = Math.min(1, DRAWER.userData.out + dt / 2.6); DRAWER.position.x = 2 - 0.95 + DRAWER.userData.out * 1.25; }
  // 2) o corpo some da maca (depois de pegar o fusível da gaveta 7)
  if (!SCARE.done.has('maca') && P.region !== 'necroterio' && (P.carry.some(f => f.n === 4) || P.installedIds.includes(4))) SCARE.armMaca = true;
  if (SCARE.armMaca && P.region === 'necroterio' && scareOnce('maca')) {
    const bb = BODY_BEDS.find(b => b.x === 9 && b.z === 18) || BODY_BEDS[0];
    if (bb) { bb.b.visible = false; setTimeout(() => HSFX.squeak(center(12, 24)), 1200); setTimeout(() => msg('A maca do meio está vazia. O lençol ainda está quente.', 4), 2500); }
  }
  // 3) o telefone da recepção toca (linha cortada desde 1984)
  if (PROG.ch === 1 && P.installed >= 2 && !AI.ignition && P.region === 'recepcao' && sinceStart > 90 && scareOnce('telefone')) { hush(2); setTimeout(() => { PHONE.ring = 18; PHONE.it.active = true; }, 2200); }
  if (PHONE.ring > 0) {
    PHONE.ring -= dt; PHONE.next -= dt;
    if (PHONE.next <= 0) { PHONE.next = 4.2; if (A.sfx_telefone) playBuf(A.sfx_telefone, { pos: PHONE.pos, gain: 1.1, verb: 0.3 }); else for (let i = 0; i < 2; i++) setTimeout(() => tone({ f: 440, type: 'square', peak: 0.05, d: 0.6 }), i * 800); }
    PHONE.handset.position.y = 0.86 + (Math.sin(time * 60) > 0 ? 0.006 : 0);
    if (PHONE.ring <= 0) { PHONE.it.active = false; msg('O telefone parou de tocar.', 2.5); }
  }
  // 4) a porta corta-fogo bate atrás de você no Pavilhão Leste
  if (PROG.ch === 2 && P.region === 'privacao' && DOORS.fogo.open >= 1 && scareOnce('porta')) {
    const d = DOORS.fogo; hush(1.5);
    setTimeout(() => {
      d.cells.forEach(([x, z]) => { grid[idx(x, z)] = 'X'; }); rebuildBlocked(); computeLightGrid();
      d.mesh.position.y = CFG.wallH / 2; HSFX.slam(new THREE.Vector3(43 * CS + 1, 1.5, 14 * CS));
      LIGHTS.filter(l => l.sector === 'leste').forEach(l => { l.flickT = 6; });
      setTimeout(() => HSFX.scratch(new THREE.Vector3(43 * CS + 1, 1.4, 14 * CS)), 2500);
      msg('A porta corta-fogo bateu sozinha.', 3);
      setTimeout(() => { d.cells.forEach(([x, z]) => { grid[idx(x, z)] = '.'; }); rebuildBlocked(); computeLightGrid(); d.mesh.position.y = CFG.wallH / 2 + CFG.wallH - 0.3; burst({ f: 120, q: 2, peak: 0.3, d: 0.5 }); msg('A trava eletromagnética oscila. A porta volta a subir.', 3); }, 9000);
    }, 1500);
  }
  // 5) as velas da capela apagam todas de uma vez
  if (PROG.ch >= 3 && P.region === 'capela' && scareOnce('velas')) {
    hush(1.8);
    setTimeout(() => {
      const l = LIGHTS.find(x => x.sector === 'capela'); if (l) { l.on = false; computeLightGrid(); setTimeout(() => { l.on = true; l.flickT = 1.5; computeLightGrid(); }, 7000); }
      burst({ f: 600, q: 0.6, peak: 0.25, a: 0.3, d: 1.2 });
      const b = HB('voz_apaga') || (A.tapes && A.tapes[6] && A.tapes[6][1]); if (b) setTimeout(() => playBuf(b, { pos: center(48, 23), rate: 0.8, gain: 0.7, verb: 1, dark: 1900 }), 1500);
    }, 1800);
  }
  // 6) galerias: alguém chorando do outro lado do reservatório
  if (PROG.ch === 4 && (P.region === 'ossario' || P.region === 'reservatorio') && scareOnce('choro')) {
    const b = HB('sfx_choro') || (A.tapes && A.tapes[6] && A.tapes[6][4]); if (b) playBuf(b, { pos: center(40, 40), gain: 0.8, verb: 1.1, dark: 2500, ref: 4 });
  }
  if (PROG.ch === 4 && UNDER.has(P.region)) { SCARE.dripCD = (SCARE.dripCD || 0) - dt; if (SCARE.dripCD <= 0) { SCARE.dripCD = rand(4, 9); const pp = new THREE.Vector3(P.pos.x + rand(-8, 8), 2.5, P.pos.z + rand(-8, 8)); if (HB('sfx_pingos')) playBuf(HB('sfx_pingos'), { pos: pp, gain: 0.5, verb: 0.8, rate: rand(0.9, 1.1) }); else HSFX.drip(pp); } }
}
function answerPhone() {
  PHONE.ring = 0; PHONE.it.active = false; SFX.click(); hush(6);
  if (A.sfx_respira) playBuf(A.sfx_respira, { phone: true, gain: 1.2 }); else burst({ f: 900, q: 1, peak: 0.2, a: 0.5, d: 2 });
  msg('Do outro lado da linha, alguém respira.', 3.5);
  setTimeout(() => { const b = HB('voz_horas') || (A.tapes && A.tapes[3] && A.tapes[3][1]); if (b) playBuf(b, { phone: true, rate: 0.9, gain: 1.1 }); }, 3800);
  setTimeout(() => { const b = HB('voz_noite'); if (b) playBuf(b, { phone: true, rate: 0.88, gain: 1.0 }); }, 6200);
  setTimeout(() => { tone({ f: 420, type: 'square', peak: 0.05, d: 0.08 }); msg('A linha da recepção está cortada desde 1984.', 4); emitNoise(P.pos, 20, 2); }, 8000);
}

// ---------- medo e alucinações ----------
function updateFear(dt, time) {
  if (AI.state === 'dead' || P.dead) { FEAR = Math.max(0, FEAR - dt * 0.2); return; }
  const lit = lightAt(P.pos), dark = lit < 0.15 && !(fl.on && fl.battery > 0), d = AI.pos.distanceTo(P.pos);
  const hunting = AI.state === 'hunt' || AI.state === 'search' || AI.state === 'chase';
  let up = (dark ? 0.022 : 0) + (hunting && d < 14 ? 0.06 : 0) + (AI.state === 'chase' ? 0.05 : 0) + (P.hidden && d < 5 ? 0.08 : 0);
  if (OPT.hard) up *= 1.4;
  const down = lit > 0.5 ? 0.06 : fl.on ? 0.02 : 0.006;
  FEAR = clamp(FEAR + (up - down) * dt, 0, 1);
  // sons que não existem
  SCARE.fakeCD -= dt;
  if (FEAR > 0.3 && SCARE.fakeCD <= 0 && Math.random() < dt * FEAR * 0.25) {
    SCARE.fakeCD = rand(14, 30);
    const back = new THREE.Vector3(P.pos.x + Math.sin(P.yaw) * rand(4, 7) + rand(-1.5, 1.5), 1.2, P.pos.z + Math.cos(P.yaw) * rand(4, 7) + rand(-1.5, 1.5));
    const r = Math.random();
    if (r < 0.35) HSFX.steps(back, 3); else if (r < 0.6) creatureVoice(back, 0.35); else if (r < 0.8) HSFX.knock(back); else HSFX.scratch(back, 1.6);
  }
  // o vulto no fim do corredor
  SCARE.phantomCD -= dt;
  const ph = PHANTOM.userData;
  if (!PHANTOM.visible && FEAR > 0.5 && SCARE.phantomCD <= 0 && !P.hidden && Math.random() < dt * 0.15) {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    for (let dist = 16; dist >= 9; dist -= 1) {
      const px = P.pos.x + fx * dist, pz = P.pos.z + fz * dist, [cx, cz] = cellOf({ x: px, z: pz });
      if (!inb(cx, cz) || blocked[idx(cx, cz)] || !los(camera.position, { x: px, z: pz })) continue;
      if (AI.pos.distanceTo(new THREE.Vector3(px, 0, pz)) < 6) break;
      PHANTOM.position.set(px, 0, pz); PHANTOM.rotation.y = Math.atan2(P.pos.x - px, P.pos.z - pz); PHANTOM.visible = true; ph.t = 0; ph.lit = 0; SCARE.phantomCD = rand(45, 80);
      break;
    }
  }
  if (PHANTOM.visible) {
    ph.t += dt; const dpp = Math.hypot(PHANTOM.position.x - P.pos.x, PHANTOM.position.z - P.pos.z);
    const cf = _v1.set(0, 0, -1).applyQuaternion(camera.quaternion), v = _v2.set(PHANTOM.position.x, 1.5, PHANTOM.position.z).sub(camera.position).normalize();
    if (flash.intensity > 5 && Math.acos(clamp(v.dot(cf), -1, 1)) < flash.angle) ph.lit += dt;
    if (ph.lit > 0.12 || ph.t > 2.4 || dpp < 6) { PHANTOM.visible = false; if (ph.lit > 0.12) burst({ f: 300, q: 0.7, peak: 0.12, a: 0.02, d: 0.5 }); }
  }
}

// ---------- vozes da criatura e a imitação da Celeste ----------
function updateCreatureVoice(dt) {
  if (AI.ambush || AI.state === 'dead' || AI.state === 'dying' || AI.state === 'sunwalk' || P.dead || AI.grace > 0) return;
  const d = AI.pos.distanceTo(P.pos), hp = AI.headPos(_v3).clone();
  SCARE.voiceCD -= dt;
  if (SCARE.voiceCD <= 0 && d < 20 && (AI.state === 'hunt' || AI.state === 'search' || AI.state === 'chase' || AI.state === 'investigate')) {
    SCARE.voiceCD = AI.state === 'chase' ? rand(5, 9) : rand(10, 20);
    if (Math.random() < 0.65) creatureVoice(hp, AI.state === 'chase' ? 1.1 : 0.8); else HSFX.sniff(hp);
  }
  // com o jogador escondido e ele perto: farejando
  if (P.hidden && d < 3.5 && Math.random() < dt * 0.8) HSFX.sniff(hp);
  // ele imita a voz da Celeste para te atrair (a partir do capítulo II)
  SCARE.mimicCD -= dt;
  if (PROG.ch >= 2 && SCARE.mimicCD <= 0 && d > 10 && d < 28 && !AI.canSee && !los(hp, camera.position) && AI.state !== 'chase') {
    SCARE.mimicCD = rand(80, 140); const b = HB(pick(['voz_imita1', 'voz_imita2'])) || (A.radio && A.radio[0]);
    if (b) { playBuf(b, { pos: hp, rate: 0.96, gain: 1.0, verb: 0.6, ref: 3 }); msg('Uma voz de mulher chama você no escuro. Não vem dos alto-falantes.', 4); }
  }
}

// ---------- objetos soltos no chão ----------
function updateDebris(dt) {
  const spd = P.vel ? Math.hypot(P.vel.x, P.vel.z) : 0;
  for (const o of DEBRIS) {
    o.cd -= dt;
    const dx = o.g.position.x - P.pos.x, dz = o.g.position.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.45 && spd > 0.6 && o.cd <= 0 && !P.hidden) {
      o.cd = 1.2; o.vx = P.vel.x * 0.9 + dx * 2; o.vz = P.vel.z * 0.9 + dz * 2;
      if (!P.crouch) { HSFX.clatter(o.kind, o.g.position); emitNoise(P.pos, 11, 2); STATS.kicks++; STATS.kicksCh++; }
      else { o.vx *= 0.3; o.vz *= 0.3; }
    }
    if (o.vx || o.vz) {
      const nx = o.g.position.x + o.vx * dt, nz = o.g.position.z + o.vz * dt, [cx, cz] = cellOf({ x: nx, z: nz });
      if (inb(cx, cz) && !blocked[idx(cx, cz)]) { o.g.position.x = nx; o.g.position.z = nz; o.g.rotation.y += (o.vx + o.vz) * dt * 3; } else { o.vx *= -0.3; o.vz *= -0.3; }
      o.vx *= Math.pow(0.08, dt); o.vz *= Math.pow(0.08, dt); if (Math.hypot(o.vx, o.vz) < 0.05) o.vx = o.vz = 0;
    }
  }
}
function updateTerror(dt, time) {
  if (HUSH > 0) HUSH -= dt;
  updateScares(dt, time); updateFear(dt, time); updateCreatureVoice(dt); updateDebris(dt);
}


/* ---------------------------------------------------------------
   v1.1 — narração do Elias, trilha por capítulo, cutscenes, sinalizador e garrafa,
   fotos colecionáveis, conquistas, final alternativo, estatísticas, controle (gamepad)
   --------------------------------------------------------------- */
// ---------- narração do Elias (ElevenLabs, voz Brian) ----------
const ELIAS_TXT = [
  'Cinco fusíveis. Eu já troquei mil fusíveis. Nunca no escuro, com alguma coisa respirando atrás de mim.',
  'Um. Faltam quatro. Não pensa. Só continua.',
  'Aquilo não é um homem. Aquilo já foi um homem.',
  'Não abriu. Claro que não abriu.',
  'Isso não é um hospital. Isso é uma prisão sem janelas.',
  'Ele queimou um garoto vivo. E anotou o código.',
  'Covarde. Morreu antes de ter que olhar pra mim.',
  'Dez mil lux. Se é assim que se para essa coisa, é assim que vai ser.',
  'Ele levantou. Queimado, e levantou.',
  'Debaixo do prédio inteiro. Ela viveu aqui embaixo esse tempo todo.',
  'A mãe dele. Ela era a mãe dele.',
  'Seis e quatro. Eu só preciso durar até as seis e quatro.',
  'Ele só queria ver o dia.',
  'Ninguém devia morrer assim. Nem ele.',
  'A pilha tá acabando. Agora não. Agora não.',
  'Não respira. Não respira.',
  'Osmar… Então foi aqui que você se escondeu.'
];
const ELIAS = { done: new Set(), busy: false };
function eliasSay(i, delay = 0, force) {
  if ((!force && ELIAS.done.has(i)) || !ELIAS_TXT[i]) return; ELIAS.done.add(i);
  setTimeout(function tryIt(n = 0) {
    if ((TP.n || ELIAS.busy || UI.modal) && n < 12) { setTimeout(() => tryIt(n + 1), 2500); return; }
    const buf = A['elias' + i], dur = buf ? buf.duration : 1.5 + ELIAS_TXT[i].length * 0.06; ELIAS.busy = true;
    if (buf) playBuf(buf, { gain: 1.05, verb: 0.08 });
    $('tsub').innerHTML = `<b>ELIAS:</b> <i>${ELIAS_TXT[i]}</i>`; $('tsub').style.opacity = 1;
    setTimeout(() => { if (!TP.n) $('tsub').style.opacity = 0; ELIAS.busy = false; }, dur * 1000 + 500);
  }, delay * 1000);
}

// ---------- trilha sonora (laços gerados na ElevenLabs) ----------
const MUS = { key: null, src: null, g: null, chase: null, chaseG: null };
function setMusic(key, vol = 0.2) {
  if (!A.ctx || MUS.key === key) return; const old = MUS.src, oldG = MUS.g, t = A.ctx.currentTime;
  if (oldG) { oldG.gain.setTargetAtTime(0, t, 0.8); setTimeout(() => { try { old.stop(); } catch (e) { } }, 4000); }
  MUS.key = key; MUS.src = MUS.g = null; const buf = A[key]; if (!buf) return;
  const s = A.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0.3; s.loopEnd = buf.duration - 0.3;
  const g = A.ctx.createGain(); g.gain.value = 0; s.connect(g).connect(A.master); g.connect(A.verb); s.start(); g.gain.setTargetAtTime(vol, t, 1.5);
  MUS.src = s; MUS.g = g;
}
function chapterMusic() { setMusic(PROG.ch >= 4 && DAWN.phase === 'sun' ? 'mus_dawn' : 'mus_ch' + PROG.ch); }
function updateMusic(dt) {
  if (!A.ctx) return;
  if (!MUS.chase && A.mus_chase) { const s = A.ctx.createBufferSource(); s.buffer = A.mus_chase; s.loop = true; const g = A.ctx.createGain(); g.gain.value = 0; s.connect(g).connect(A.master); s.start(); MUS.chase = s; MUS.chaseG = g; }
  const chasing = AI.state === 'chase' && !P.dead && AI.pos.distanceTo(P.pos) < 24;
  if (MUS.chaseG) MUS.chaseG.gain.setTargetAtTime(chasing ? 0.22 : 0, A.ctx.currentTime, chasing ? 0.3 : 1.5);
  if (MUS.g && MUS.key !== 'mus_dawn') MUS.g.gain.setTargetAtTime(HUSH > 0 ? 0 : chasing ? 0.06 : 0.2, A.ctx.currentTime, 0.8);
}

// ---------- cutscenes curtas entre capítulos ----------
async function cutscene(shots, done) {
  MODE = 'cut'; CINE.skip = false; CINE.hold = 0; CINE.holding = false;
  $('cine').style.display = 'block'; $('cine').classList.add('on'); card('', false); $('subs').style.opacity = 0; $('skip').style.opacity = 0.5;
  for (const s of shots) { if (CINE.skip) break; shot(s); if (s.say != null) eliasSay(s.say, 0.6, true); await sleep(s.dur * 1000); }
  CINE.shot = null; $('cine').classList.remove('on'); $('skip').style.opacity = 0; setTimeout(() => { if (MODE !== 'intro' && MODE !== 'cut') $('cine').style.display = 'none'; }, 900);
  MODE = 'game'; if (done) done();
}
const CUTS = {
  fogo: [{ from: V3(38.5 * CS, 1.6, 13.6 * CS), to: V3(41.6 * CS, 1.55, 13.9 * CS), look: V3(47 * CS, 1.7, 14 * CS), look2: V3(52 * CS, 1.5, 14 * CS), dur: 7, say: 4 }],
  varela: [{ from: V3(59 * CS, 1.55, 6.6 * CS), to: V3(60.6 * CS, 1.25, 5.9 * CS), look: V3(62 * CS + 1.3, 0.3, 5 * CS + 0.8), dur: 6.5, say: 6 }],
  alcapao: [{ from: V3(50 * CS, 1.7, 29.3 * CS), to: V3(52.2 * CS, 1.55, 31 * CS), look: V3(53 * CS + 1, 0.4, 33.4 * CS), dur: 6.5, say: 8 }]
};

// ---------- sinalizador e garrafa ----------
const THROWN = [];
function throwItem(kind) {
  if (P.hidden || P.dead || UI.modal) return;
  if (kind === 'flare' ? P.flares <= 0 : P.bottles <= 0) { msg(kind === 'flare' ? 'Sem sinalizadores.' : 'Sem garrafas para jogar.', 1.5); return; }
  if (kind === 'flare') P.flares--; else P.bottles--;
  const g = new THREE.Group(), cf = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  if (kind === 'flare') { const m = cyl(0.02, 0.02, 0.22, new THREE.MeshStandardMaterial({ color: 0x7a1010, emissive: 0xff3020, emissiveIntensity: 3 }), 0, 0, 0, g, 8); m.rotation.z = Math.PI / 2; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xff4020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(0.9); g.add(sp); }
  else { const m = cyl(0.035, 0.035, 0.24, new THREE.MeshPhysicalMaterial({ color: 0x2c4a2a, roughness: 0.15, transparent: true, opacity: 0.8 }), 0, 0, 0, g, 8); m.rotation.z = Math.PI / 2; }
  g.position.copy(camera.position).addScaledVector(cf, 0.4); scene.add(g);
  THROWN.push({ kind, g, v: cf.multiplyScalar(kind === 'flare' ? 9 : 11).add(new THREE.Vector3(0, 3, 0)), landed: false, t: 0 });
  burst({ f: 1200, q: 0.8, peak: 0.08, d: 0.15 }); if (kind === 'flare') burst({ f: 4000, type: 'highpass', peak: 0.2, a: 0.02, d: 0.6 });
}
function updateThrown(dt) {
  for (let i = THROWN.length - 1; i >= 0; i--) {
    const o = THROWN[i]; o.t += dt;
    if (!o.landed) {
      o.v.y -= 9.8 * dt; const np = o.g.position.clone().addScaledVector(o.v, dt), [cx, cz] = cellOf(np);
      if (!inb(cx, cz) || blocked[idx(cx, cz)] || np.y > CFG.wallH - 0.1) { o.v.x *= -0.25; o.v.z *= -0.25; if (np.y > CFG.wallH - 0.1) o.v.y = -Math.abs(o.v.y) * 0.3; }
      else o.g.position.copy(np);
      o.g.rotation.x += dt * 8; o.g.rotation.z += dt * 5;
      if (o.g.position.y <= 0.04) { o.g.position.y = 0.03; o.landed = true; o.t = 0; o.g.rotation.set(0, Math.random() * 6, 0); land(o); }
    } else if (o.kind === 'flare') {
      const k = o.t < 16 ? 1 : Math.max(0, 1 - (o.t - 16) / 2); o.light.L.intensity = o.light.base * k * (0.85 + Math.random() * 0.15); o.light.on = k > 0;
      if (Math.random() < dt * 30) puff(o.g.position.clone().add(new THREE.Vector3(0, 0.1, 0)), 1, true, true);
      if (o.t > 18) { scene.remove(o.g); LIGHTS.splice(LIGHTS.indexOf(o.light), 1); computeLightGrid(); THROWN.splice(i, 1); }
    } else if (o.t > 30) { scene.remove(o.g); THROWN.splice(i, 1); }
  }
}
function land(o) {
  const p = o.g.position;
  if (o.kind === 'bottle') {
    if (A.sfx_garrafa) playBuf(A.sfx_garrafa, { pos: p, gain: 1.8, verb: 0.5, rate: 1.15 }); else HSFX.clatter('bottle', p);
    spatialOneShot(p, q => { for (const f of [2600, 3400, 4500, 5200]) burst({ f, q: 30, peak: 0.3, d: 0.5, dest: q }); });
    emitNoise(p.clone(), 18, 2); o.g.visible = false;
  } else {
    const fx = { intensity: 0, color: new THREE.Color(0xff3a1c) }, fixture = { material: { emissiveIntensity: 0 } };
    o.light = { L: fx, fixture, pos: new THREE.Vector3(p.x, 0.6, p.z), base: 14, range: 10, strength: 1.0, sector: 'flare', on: true, kind: 'red', flick: 1, flickT: 0, broken: false };
    LIGHTS.push(o.light); computeLightGrid();
    spatialOneShot(p, q => burst({ f: 3500, type: 'highpass', peak: 0.07, a: 0.2, d: 16, dest: q }));
    if (AI.pos.distanceTo(p) < 6) AI.flee(7, true);
  }
}

// ---------- fotos, extras persistentes e conquistas ----------
const EXTRAS = Object.assign({ fotos: [], fitas: [] }, loadJ('formol_extras') || {});
const ACH = new Set(loadJ('formol_ach') || []);
const ACH_LIST = {
  apagao: ['APAGÃO', 'Termine o capítulo I.'], noite: ['NOITE LONGA', 'Termine o capítulo II.'], formol: ['FORMOL', 'Termine o capítulo III.'],
  amanhecer: ['JÁ É DIA', 'Veja o final verdadeiro.'], eterna: ['NOITE ETERNA', 'Veja o outro final.'], fitas: ['ARQUIVO COMPLETO', 'Encontre as 9 fitas.'],
  fotos: ['ÁLBUM', 'Encontre as 6 fotografias.'], osmar: ['O VIGIA', 'Encontre o esconderijo do Osmar.'], intocavel: ['INTOCÁVEL', 'Termine o jogo sem morrer.'],
  pesadelo: ['PESADELO', 'Termine o jogo no modo Pesadelo.'], escuro: ['SEM LUZ', 'Termine o capítulo IV sem acender a lanterna.'], silencio: ['PÉS DE GATO', 'Termine um capítulo sem chutar nenhum objeto.']
};
function achieve(k) {
  if (ACH.has(k) || !ACH_LIST[k]) return; ACH.add(k); saveJ('formol_ach', [...ACH]);
  const el = $('ach'); el.innerHTML = `<small>CONQUISTA</small>${ACH_LIST[k][0]}<span>${ACH_LIST[k][1]}</span>`; el.style.opacity = 1; el.style.transform = 'translateY(0)';
  tone({ f: 660, f2: 880, type: 'sine', peak: 0.05, d: 0.4 }); clearTimeout(achieve.t); achieve.t = setTimeout(() => { el.style.opacity = 0; el.style.transform = 'translateY(-10px)'; }, 4200);
}
function saveExtras() { saveJ('formol_extras', EXTRAS); }
function noteExtra(kind, n) { if (!EXTRAS[kind].includes(n)) { EXTRAS[kind].push(n); saveExtras(); } if (EXTRAS.fotos.length >= 6) achieve('fotos'); if (EXTRAS.fitas.length >= Object.keys(TAPEDATA).length) achieve('fitas'); }
const FOTOS = {
  1: ['FOTO 1 — ALA DE PACIENTES, 1979', 'Doze leitos, doze rostos virados para a câmera.\n\nUm deles cobre os olhos com as duas mãos.'],
  2: ['FOTO 2 — INAUGURAÇÃO DO QG-1, 1979', 'O Dr. Varela corta a fita do quadro novo, sorrindo.\n\nAtrás dele, uma enfermeira de cabelo preso olha para outro lado. Alguém escreveu a caneta, em cima do rosto dela: "C."'],
  3: ['FOTO 3 — GAVETA 7, MARÇO DE 1983', 'Foto de perícia, nunca anexada ao processo.\n\nO lado de dentro da gaveta, arranhado até o metal brilhar.'],
  4: ['FOTO 4 — CÂMARA 3, COM FLASH', 'Paredes pintadas de preto. Um colchão no chão.\n\nNo canto, desenhado a unha no reboco: uma janela com um sol.'],
  5: ['FOTO 5 — CAPELA, NATAL DE 1984', 'Velas acesas em todos os bancos.\n\nNa última fila, uma silhueta branca, alta demais, sentada no escuro.'],
  6: ['FOTO 6 — CABO FRIO, 1971 (SEGUNDA CÓPIA)', 'Celeste e Tomás, de costas para a câmera, olhando o mar ao meio-dia.\n\nNo verso: "o dia em que ele não teve medo".']
};
function openExtras() {
  const ul = $('achList'); ul.innerHTML = '';
  for (const k in ACH_LIST) { const li = document.createElement('li'); li.className = ACH.has(k) ? 'got' : ''; li.innerHTML = `${ACH.has(k) ? '◆' : '◇'} ${ACH_LIST[k][0]}<small>${ACH_LIST[k][1]}</small>`; ul.appendChild(li); }
  const gl = $('galList'); gl.innerHTML = '';
  for (const n in FOTOS) { const li = document.createElement('li'); const got = EXTRAS.fotos.includes(+n); li.textContent = got ? FOTOS[n][0] : '— foto não encontrada —'; li.className = got ? '' : 'dis'; if (got) li.onclick = () => { uiSfx('sel'); showPanel(null); setTimeout(() => showDoc(FOTOS[n][0], FOTOS[n][1], 'photo', () => { $('menu').style.display = 'block'; showPanel('p_extras'); }), 50); $('menu').style.display = 'none'; }; gl.appendChild(li); }
  $('extInfo').textContent = `${ACH.size}/${Object.keys(ACH_LIST).length} CONQUISTAS · ${EXTRAS.fotos.length}/6 FOTOS · ${EXTRAS.fitas.length}/${Object.keys(TAPEDATA).length} FITAS`;
  showPanel('p_extras');
}

// ---------- estatísticas ----------
const STATS = { chStart: {}, chTime: {}, seen: 0, kicks: 0, kicksCh: 0, darkCh4: true };
function chapterBegin(n) { STATS.chStart[n] = performance.now(); STATS.kicksCh = 0; if (n === 4) STATS.darkCh4 = true; }
function chapterEnd(n) {
  if (STATS.chStart[n]) STATS.chTime[n] = (performance.now() - STATS.chStart[n]) / 1000;
  achieve(['', 'apagao', 'noite', 'formol'][n] || '');
  if (STATS.kicksCh === 0 && STATS.chStart[n]) achieve('silencio');
}
const fmtT = s => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;

// ---------- controle de videogame ----------
const PAD = { prev: {}, look: [0, 0], active: false };
function updateGamepad(dt) {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null; if (!gp) return;
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = i => b(i) && !PAD.prev[i], dz = v => Math.abs(v) < 0.18 ? 0 : v;
  const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
  if (lx || ly || rx || ry || gp.buttons.some(x => x.pressed)) PAD.active = true; if (!PAD.active) return;
  if (UI.modal) { if (edge(0) || edge(1)) { UI.t0 = 0; closeModal(); } }
  else if (playing && !paused && !P.dead && MODE === 'game') {
    keys.KeyW = ly < -0.3; keys.KeyS = ly > 0.3; keys.KeyA = lx < -0.3; keys.KeyD = lx > 0.3; keys.ShiftLeft = b(10) || b(4);
    const sens = 2.6 * OPT.sens / 100; P.yaw -= rx * sens * dt; P.pitch = clamp(P.pitch - ry * sens * dt, -1.35, 1.35);
    mouseFocus = b(7) || (gp.buttons[7] && gp.buttons[7].value > 0.4);
    if (edge(0)) { eHeld = true; pressInteract(); } if (!b(0) && PAD.prev[0]) { eHeld = false; installT = 0; }
    if (edge(1)) P.crouch = !P.crouch; if (edge(2) && !P.hidden && OPT.noLight !== true) { fl.on = !fl.on; SFX.click(); TORCH.clickT = 0.16; }
    if (edge(5)) throwItem('flare'); if (edge(6)) throwItem('bottle'); if (edge(3)) { if (!OPT.hard) showMap($('map').style.display !== 'flex'); }
    if (edge(9)) pauseGame();
  } else if (paused && edge(9)) resumeGame();
  PAD.prev = gp.buttons.map(x => x.pressed);
}

// ---------- atualização por quadro ----------
const WIN_TXT = {
  good: '<p>06:04. Pela primeira vez em cinco anos, Tomás Aurélio Reis viu o dia. Quando a luz o alcançou, ele não gritou. Sentou nas pedras do pátio, ao lado da mãe, e fechou os olhos.</p><p>Elias Prado saiu pelo portão dos fundos e andou até a avenida sem olhar para trás.</p><p>Horas depois, os bombeiros encontraram no pátio interno uma mulher de uniforme branco, sentada num banco, abraçada a um corpo embalsamado em 1983. Ela não quis sair de lá.</p><p>O laudo oficial falou em curto-circuito. O Instituto São Lázaro foi demolido em 1989.</p><p class="small">Até o fim da vida, Elias dormiu com a cortina aberta.</p>',
  bad: '<p>06:04. O sol nasce sobre o pátio interno. Tomás Aurélio Reis entra na luz sem ninguém à espera e grita até não sobrar voz.</p><p>Elias Prado sai pelo portão dos fundos com aquele grito nos ouvidos.</p><p>Celeste nunca chegou ao pátio. Dias depois, encontraram-na nas galerias, sentada diante de um gravador desligado, repetindo que ainda era noite.</p><p>O laudo oficial falou em curto-circuito. O Instituto São Lázaro foi demolido em 1989.</p><p class="small">Até o fim da vida, Elias não conseguiu dormir no escuro. Nem no claro.</p>'
};
function winExtras() {
  const good = !!PROG.heard7; STATS.chTime[4] = STATS.chStart[4] ? (performance.now() - STATS.chStart[4]) / 1000 : 0;
  $('win_title').textContent = good ? 'JÁ É DIA' : 'NOITE ETERNA'; $('win_txt').innerHTML = WIN_TXT[good ? 'good' : 'bad'];
  achieve(good ? 'amanhecer' : 'eterna'); if (stats.deaths === 0) achieve('intocavel'); if (OPT.hard) achieve('pesadelo'); if (STATS.darkCh4) achieve('escuro'); if (STATS.kicksCh === 0) achieve('silencio');
  saveJ('formol_beaten', true);
  const rows = [1, 2, 3, 4].filter(n => STATS.chTime[n]).map(n => `CAP. ${['', 'I', 'II', 'III', 'IV'][n]} · ${fmtT(STATS.chTime[n])}`).join('   ');
  $('win_stats').innerHTML = `${rows}<br>VISTO ${STATS.seen}× · OBJETOS CHUTADOS ${STATS.kicks} · FOTOS ${EXTRAS.fotos.length}/6 · CONQUISTAS ${ACH.size}/${Object.keys(ACH_LIST).length}`;
  $('roll').classList.add('go');
}
function updateV11(dt, time) {
  updateMusic(dt); updateThrown(dt);
  if (fl.battery < 20 && fl.battery > 0 && !OPT.noLight) eliasSay(14, 0.5);
  if (P.hidden && AI.pos.distanceTo(P.pos) < 6 && AI.state !== 'dead') eliasSay(15, 0.2);
  if (P.region === 'vigia') { eliasSay(16, 0.8); achieve('osmar'); }
  if (PROG.ch === 4 && fl.on && fl.battery > 0) STATS.darkCh4 = false;
  $('items').textContent = (P.flares || P.bottles) ? `SINALIZADOR [G] ${P.flares} · GARRAFA [Q] ${P.bottles}` : '';
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
  const col = { pacientes: '#3b2b2b', enfermaria: '#2a3b33', admin: '#3a3726', corredor: '#3b1d1d', necroterio: '#22303b', recepcao: '#2b3a44', autopsia: '#33363a', subsolo: '#2a2420', rua: '#3a2c1c', leste: '#3b1d1d', privacao: '#241f2a', diretoria: '#3a2f22', gravacao: '#2c2a24', capela: '#3a2a1a', fototerapia: '#26323a', crematorio: '#3a2018', vigia: '#2a2a22', galerias: '#2a2420', ossario: '#33302a', reservatorio: '#1c2a2a', quarto: '#3a2a22', patio: '#2a3428' };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const v = grid[idx(x, z)]; if (v === '#') continue; const rg = regionAt(x, z); if (rg === 'vigia' && !ACH.has('osmar') && P.region !== 'vigia') continue;
    if (PROG.ch < (REGION_CH[rg] || 1)) { if (PROG.ch + 1 >= (REGION_CH[rg] || 1)) { g.fillStyle = '#141414'; g.fillRect(x * s, z * s, s, s); } continue; }   // área do próximo capítulo: só a silhueta
    g.fillStyle = v === 'X' ? '#b8901c' : col[rg]; g.fillRect(x * s, z * s, s, s);
  }
  g.fillStyle = '#9ab'; g.font = '10px monospace';
  [['ALA DE PACIENTES', 2, 6.5], ['ENFERMARIA', 18, 6.5], ['ADMINISTRAÇÃO', 32, 9.6], ['CORREDOR CENTRAL', 16, 14.3], ['NECROTÉRIO', 2, 19], ['RECEPÇÃO', 19, 21], ['AUTÓPSIA / LAB', 30, 23], ['SUBSOLO', 3, 33.3], ['SAÍDA', 21, 33.3]].forEach(([t, x, z]) => g.fillText(t, x * s, z * s));
  if (PROG.ch >= 2) [['CÂMARAS DE PRIVAÇÃO', 44.2, 8.9], ['DIRETORIA', 58.6, 4.5], ['GRAVAÇÃO', 58.6, 10.6], ['PAVILHÃO LESTE', 49, 14.3]].forEach(([t, x, z]) => g.fillText(t, x * s, z * s));
  else { g.fillStyle = '#556'; g.fillText('PAVILHÃO LESTE — INTERDITADO', 46 * s, 9 * s); }
  if (PROG.ch >= 3) [['CAPELA', 46.5, 19.5], ['FOTOTERAPIA', 57, 18.6], ['CREMATÓRIO', 48, 30]].forEach(([t, x, z]) => g.fillText(t, x * s, z * s));
  if (PROG.ch >= 4) [['GALERIAS', 31, 36.8], ['OSSÁRIO', 16.5, 40.2], ['RESERVATÓRIO', 33, 39.4], ['QUARTO DA CELESTE', 55.6, 44.2], ['PÁTIO INTERNO', 26.5, 47.2]].forEach(([t, x, z]) => g.fillText(t, x * s, z * s));
  if (PROG.ch === 3 && !PROG.burned) { g.fillStyle = '#9fd0ff'; g.fillRect(63.6 * s, 19.6 * s, 8, 8); g.fillText(`CONSOLE ${PROG.lamps.length}/3`, 58.5 * s, 22.3 * s); }
  g.fillStyle = '#f0b35a'; g.fillRect(17.6 * s, 15.6 * s, 8, 8); g.fillText(PROG.ch >= 4 ? 'QG-1 QUEIMADO' : PROG.ch >= 2 ? 'QG-1 ENERGIZADO' : `PAINEL ${P.installed}/5`, 19 * s, 17 * s);
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
  u.uCA.value = 0.0018 + DANGER * 0.006 + CAM.trauma * 0.01 + FEAR * FEAR * 0.008 * (1 + Math.sin(time * 2.3) * 0.5); u.uDanger.value = Math.max(DANGER, FEAR * 0.45); u.uGrain.value = 0.026; u.uHaze.value.set(HAZE.x, HAZE.y, HAZE.on * HAZE.i, HAZE.r); u.uAsp.value = innerWidth / innerHeight;
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
  if (rg !== P.region && PROG.ch === 2 && EAST.has(rg) && !PROG.metCeleste && !PROG.celesteQueued) { PROG.celesteQueued = true; setTimeout(() => { radio([4]); setTimeout(saveProgress, 9000); }, 1500); }
  if (rg !== P.region) { P.region = rg; $('zone').textContent = REGION_NAME[rg]; $('zone').style.opacity = 0.8; zoneT = 3; }
  // instalar (segurar E)
  const it = focusItem;
  if (eHeld && it && it.type === 'panel' && P.carry.length && P.installed < 5) {
    installT += dt; $('prog').style.display = 'block'; $('prog').firstChild.style.width = (installT / 3 * 100) + '%';
    if (Math.random() < dt * 6) burst({ f: 4000, type: 'highpass', peak: 0.1, d: 0.04 });
    if (installT >= 3) { installT = 0; installOne(); }
  } else if (eHeld && it && it.type === 'door' && it.door.key === 'patio' && PROG.crank && !PROG.gateOpen) {
    installT += dt; $('prog').style.display = 'block'; $('prog').firstChild.style.width = (installT / 5 * 100) + '%';
    if (Math.random() < dt * 5) { burst({ f: 700, q: 4, peak: 0.12, d: 0.12 }); emitNoise(P.pos, 12, 2); }
    if (installT >= 5) { installT = 0; startDawnRun(); }
  } else if (eHeld && it && it.type === 'console' && P.lamps.length && PROG.ch >= 3 && PROG.lamps.length < 3) {
    installT += dt; $('prog').style.display = 'block'; $('prog').firstChild.style.width = (installT / 2 * 100) + '%';
    if (Math.random() < dt * 6) burst({ f: 2500, type: 'highpass', peak: 0.08, d: 0.05 });
    if (installT >= 2) { installT = 0; installLamp(); }
  } else { if (!eHeld) installT = 0; $('prog').style.display = 'none'; }
  // vitória
  if (exitDoor.open > 0.8 && regionAt(cx, cz) === 'rua') win();
}
function updateFlashlight(dt, time) {
  const F = CFG.flash;
  const usable = fl.on && !P.hidden && !P.dead && !OPT.noLight;
  const focusing = usable && mouseFocus && fl.battery > 0;
  if (usable && fl.battery > 0) fl.battery = Math.max(0, fl.battery - dt * (focusing ? F.drainFocus : F.drainNormal) * (OPT.hard ? 1.6 : 1));
  fl.focus = focusing;
  let I = 0;
  if (usable) {
    if (fl.battery > 0 && AI.state !== 'dead' && AI.state !== 'sunwalk') { const dc = AI.pos.distanceTo(P.pos); if (dc < 11 && Math.random() < dt * (11 - dc) * 0.9) { fl.glitch = rand(0.05, 0.25); if (Math.random() < 0.3) burst({ f: 5000, type: 'highpass', peak: 0.04, d: 0.05 }); } }
    if (fl.glitch > 0) fl.glitch -= dt;
    if (fl.battery > 0) { I = focusing ? F.focusI : F.normalI; if (fl.glitch > 0) I *= rand(0.02, 0.3); I *= 0.55 + 0.45 * clamp(fl.battery / 30, 0, 1); if (fl.battery < 15 && Math.random() < 0.08) { I *= rand(0.05, 0.5); if (Math.random() < 0.06 && TORCH.tapT <= 0) { TORCH.tapT = 0.35; burst({ f: 900, q: 3, peak: 0.12, d: 0.05 }); } } }
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
  if (A.ctx) { A.focusG.gain.setTargetAtTime(focusing ? 0.025 : 0, A.ctx.currentTime, 0.05); A.focusOsc.frequency.setTargetAtTime(240, A.ctx.currentTime, 0.1); }

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
          AI.burns++; stats.burns++; AI.burnAcc = 0; AI.flee(CFG.creature.recoilTime, false); SFX.scream(1.5); puff(hp, 12, false); msg('Ele recuou. Vai voltar.', 2);
        }
      }
    }
  }
  if (!burning) AI.burnAcc = Math.max(0, AI.burnAcc - dt * 0.5);
  // ele odeia luz: o feixe no rosto OU no corpo por um instante faz ele sair correndo
  let beamOnBody = 0;
  if (I > 1 && !P.dead && AI.state !== 'recoil' && !burning) {
    const cp = camera.position, cf = _v1.set(0, 0, -1).applyQuaternion(camera.quaternion);
    for (const [obj, y] of [[C.spine, 0.45], [C.hips, -0.25]]) {
      const bp = obj.localToWorld(_v2.set(0, y, 0)), v = _v3.copy(bp).sub(cp), d = v.length(); v.normalize();
      const angle = Math.acos(clamp(v.dot(cf), -1, 1));
      if (d < dist && angle < ang * 1.05 && los(cp, bp)) beamOnBody = Math.max(beamOnBody, 1 - angle / (ang * 1.05));
    }
  }
  if ((beamOnEyes > 0 || beamOnBody > 0) && AI.state !== 'recoil' && !burning && !P.dead) {
    AI.lightExp += dt * (focusing ? 2.5 : 1) * (beamOnEyes > 0 ? 1.4 : 1);
    if (AI.lightExp >= CFG.creature.fleeExposure) {
      const hp = AI.headPos(_v2);
      AI.flee(CFG.creature.fleeTime, true); SFX.scream(0.7); puff(hp, 5, false); addTrauma(0.15);
      if (time - AI.fleeMsgT > 20) { msg('Ele foge da luz.', 1.6); AI.fleeMsgT = time; }
    }
  } else AI.lightExp = Math.max(0, AI.lightExp - dt * 0.6);
  // olhos: pupilas contraem com luz, brilho reflexivo
  C.eyes.forEach(e => e.userData.pupil.scale.setScalar(lerp(e.userData.pupil.scale.x, beamOnEyes > 0 ? 0.25 : 1.1, dt * 6)));
  C.eyeGlow.material.opacity = beamOnEyes * 0.9 + (lightAt(AI.pos) < 0.2 ? 0.08 : 0);
  C.eyeMat.color.setRGB(0.75 + beamOnEyes * 0.25, 0.78 + beamOnEyes * 0.2, 0.72 + beamOnEyes * 0.2);
  if (A.ctx) A.sizzleG.gain.setTargetAtTime(burning ? 0.35 : 0, A.ctx.currentTime, 0.04);
  // HUD
  $('batt').firstChild.style.width = fl.battery + '%'; $('batt_t').textContent = Math.ceil(fl.battery) + '%';
  $('batt').firstChild.style.background = fl.battery < 15 ? '#c23a2c' : '#d9e6d0';
}
function assignLightPool() {
  const cp = camera.position, act = [];
  for (const l of LIGHTS) if (l.L.intensity > 0.01) act.push([l.pos.distanceToSquared(cp), l]);
  act.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < LIGHT_POOL.length; i++) {
    const p = LIGHT_POOL[i], e = act[i];
    if (e) { const l = e[1]; p.position.copy(l.pos); p.color.copy(l.L.color); p.intensity = l.L.intensity; p.distance = l.range; } else p.intensity = 0;
  }
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
  assignLightPool();
}
function updateDanger() {
  const st = AI.state, d = AI.pos.distanceTo(P.pos);
  DANGER = clamp((st === 'chase' ? 1 : st === 'hunt' || st === 'search' ? 0.6 : 0.3) * (1 - clamp((d - 3) / 22, 0, 1)), 0, 1);
  CAM.floor = Math.min(0.55, DANGER * 0.38 + FEAR * 0.12 + (AI.ignition ? 0.22 : 0) + (P.exhausted > 0 ? 0.12 : 0) + (st === 'chase' && d < 8 ? 0.12 : 0));
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
  const growl = (st === 'dead' || (AI.ambush && st === 'patrol') ? 0.02 : st === 'chase' || st === 'dying' ? 0.9 : st === 'hunt' || st === 'search' ? 0.55 : st === 'recoil' ? 0.3 : 0.35) * hideMuffle;
  A.growlG.gain.setTargetAtTime(growl, t, 0.2); A.growlOsc.frequency.setTargetAtTime(st === 'chase' ? 62 : 44, t, 0.3); A.breathLfo.frequency.setTargetAtTime(st === 'chase' ? 2.2 : 0.35, t, 0.3);
  A.dragG.gain.setTargetAtTime(Math.min(1, AI.speed / 3) * 0.25 * hideMuffle, t, 0.1);
  if ((st === 'investigate' || st === 'search') && AI.speed < 0.5 && Math.random() < dt * 2) SFX.tick();
  // perigo → coração, tensão, perseguição
  const d = AI.pos.distanceTo(P.pos);
  const danger = clamp((st === 'chase' ? 1 : st === 'hunt' || st === 'search' ? 0.6 : 0.3) * (1 - clamp((d - 3) / 22, 0, 1)), 0, 1);
  DANGER = danger;
  CAM.floor = Math.min(0.55, danger * 0.38 + (AI.ignition ? 0.22 : 0) + (P.exhausted > 0 ? 0.12 : 0) + (st === 'chase' && d < 8 ? 0.12 : 0));
  A.tension.gain.setTargetAtTime(HUSH > 0 ? 0 : Math.max(danger, FEAR * 0.5) * 0.07, t, HUSH > 0 ? 0.15 : 0.6);
  A.chase.gain.setTargetAtTime(st === 'chase' && !P.dead ? 0.6 : 0, t, 0.8);
  const beatK = Math.max(danger, FEAR > 0.55 ? FEAR * 0.6 : 0, P.hidden && d < 4 ? 0.9 : 0);
  A.nextBeat -= dt; if (beatK > 0.15 && A.nextBeat <= 0 && HUSH <= 0) { SFX.heart(0.4 + beatK * 0.8); A.nextBeat = lerp(1.1, 0.4, beatK); }
  A.nextKick -= dt; if (st === 'chase' && A.nextKick <= 0) { SFX.kick(); A.nextKick = 0.34; }
  // zumbido das lâmpadas próximas
  let hum = 0; for (const lt of LIGHTS) if (lt.on && lt.kind === 'fluo') hum = Math.max(hum, 1 - lt.pos.distanceTo(camera.position) / 8);
  A.hum.gain.setTargetAtTime(HUSH > 0 ? 0 : Math.max(0, hum) * 0.025, t, 0.2);
  // prédio vivo: batidas metálicas distantes
  A.nextClank -= dt; if (A.nextClank <= 0 && HUSH <= 0) { A.nextClank = rand(14, 40); const a = rand(0, 6.28); SFX.clank({ x: camera.position.x + Math.cos(a) * rand(15, 30), y: 2, z: camera.position.z + Math.sin(a) * rand(15, 30) }); }
  if (AI.ignition) A.sirenG.gain.setTargetAtTime(0.06, t, 0.5);
  // tela
  $('danger').style.opacity = (danger * 0.9 + (st === 'chase' ? Math.sin(time * 8) * 0.1 : 0)).toFixed(2);
}
let last = performance.now(), grainTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; const time = now / 1000;
  updateGamepad(dt);
  if (MODE === 'intro' || MODE === 'cut') {
    if (MODE === 'cut') { updateDoors(dt); updateMusic(dt); }
    updateCine(dt, time); animateCreature(dt, time); updateLights(dt, time); updateListenerOnly();
    for (const s of steam) if (s.life > 0) { s.life -= dt * 0.8; s.s.position.addScaledVector(s.v, dt); s.s.material.opacity = s.life * 0.3; if (s.life <= 0) s.s.visible = false; }
    if (AI.burnAcc > 0.5 && Math.random() < dt * 25) puff(AI.headPos(_v3), 1, true);
    DANGER = 0; renderFrame(time, dt); return;
  }
  if (!playing) { // câmera de menu
    if (A.mus_menu) setMusic('mus_menu'); else menuMusic(dt); updateListenerOnly();
    camera.position.set(9, 1.55, 28); camera.rotation.set(Math.sin(time * 0.2) * 0.03, -Math.PI / 2 + Math.sin(time * 0.13) * 0.05, 0, 'YXZ');
    const mx = 31 + Math.sin(time * 0.09) * 5; AI.yaw = Math.cos(time * 0.09) > 0 ? Math.PI / 2 : -Math.PI / 2;
    AI.pos.set(mx, 0, 27.4); AI.state = 'patrol'; AI.speed = 1.1;
    animateCreature(dt, time); updateLights(dt, time); flash.intensity = 30; beam.visible = false;
    renderFrame(time, dt); return;
  }
  if (paused || P.won || UI.modal) { renderFrame(time, dt); return; }
  if (P.dead) {
    P.deathT += dt; const hp = AI.headPos(_v1);
    AI.anim.jaw = lerp(AI.anim.jaw, 1.0, dt * 4); C.jaw.rotation.x = AI.anim.jaw;
    const lookAt = new THREE.Matrix4().lookAt(camera.position, hp, new THREE.Vector3(0, 1, 0)); const q = new THREE.Quaternion().setFromRotationMatrix(lookAt);
    camera.quaternion.slerp(q, Math.min(1, dt * 16)); const ds = 0.03 + 0.06 * Math.max(CAM.level, 0.3); camera.position.x += (Math.random() - .5) * ds; camera.position.y += (Math.random() - .5) * ds; DANGER = 1; CAM.trauma = 1;
    if (P.deathT < 0.4) camera.position.lerp(hp, dt * 0.7);
    if (P.deathT > 0.8) $('fade').style.opacity = 1;
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
    if (AI.ignT > CFG.ignitionTime && PROG.ch === 1) endChapter1();
    if (Math.random() < dt * 0.4) emitNoise(panel.pos, CFG.noise.ignition, 3);
  } else panel.needle.rotation.z = lerp(panel.needle.rotation.z, 1.2 - P.installed * 0.38 + Math.sin(time * 7) * 0.008 * P.installed, Math.min(1, dt * 3));
  if (exitDoor.opening && exitDoor.open < 1) {
    exitDoor.open = Math.min(1, exitDoor.open + dt / 3); exitDoor.mesh.position.y = CFG.wallH / 2 + exitDoor.open * (CFG.wallH - 0.4);
    if (exitDoor.open > 0.5) { grid[idx(21, 26)] = '.'; grid[idx(22, 26)] = '.'; rebuildBlocked(); }
  }
  updateDoors(dt);
  // descarga da fototerapia
  if (FOTO.cool > 0) FOTO.cool -= dt;
  if (FOTO.flashT > 0) { FOTO.flashT -= dt; const k = Math.max(0, FOTO.flashT / 2.8); FOTO.light.intensity = 1400 * k * k * (Math.random() < 0.15 ? 0.5 : 1); ARC_RIGS.forEach(g => { g.material.emissiveIntensity = 12 * k; }); if (FOTO.flashT <= 0) { FOTO.light.intensity = 0; ARC_RIGS.forEach(g => { g.material.emissiveIntensity = 0; }); } }
  // capítulo IV: primeira descida às galerias, contagem até o amanhecer, o sol
  if (PROG.ch === 4 && !PROG.visitedGal && UNDER.has(P.region)) { PROG.visitedGal = true; saveProgress(); setTimeout(() => radio([12]), 1200); eliasSay(9, 11); }
  if (DAWN.phase === 'run') { DAWN.t += dt; if (Math.random() < dt * 0.35) emitNoise(P.pos, 40, 3); if (DAWN.t >= CFG.dawnTime) sunrise(); }
  if (DAWN.phase === 'sun') {
    SUN.intensity = lerp(SUN.intensity, 420, dt * 0.25); moon.base = lerp(moon.base, 30, dt * 0.2);
    scene.background.lerp(_c1.set(0x9a7a6a), dt * 0.08);
  }
  if (AI.state === 'sunwalk') {
    AI.t += dt; AI.speed = lerp(AI.speed, 1.0, dt * 2); AI.move(dt);
    if (!AI.path.length || AI.t > 30) { AI.state = 'dying'; AI.dyingKind = PROG.heard7 ? 'peace' : 'burn'; AI.t = 0; AI.speed = 0; if (!PROG.heard7) { SFX.scream(3); AI.burnAcc = 1; } }
  }
  // a criatura queimando (cap. III) ou se desfazendo em paz ao sol (cap. IV)
  if (AI.state === 'dying') {
    AI.t += dt;
    if (AI.dyingKind === 'peace') {
      AI.burnAcc = 0; C.root.position.y = -Math.min(0.75, AI.t * 0.12); C.root.rotation.x = -Math.min(0.3, AI.t * 0.05);
      if (Math.random() < dt * 14) puff(C.spine.localToWorld(_v3.set(rand(-.2, .2), rand(0, .9), 0)), 1, false, true);
      if (AI.t > 11) { AI.state = 'dead'; C.root.visible = false; for (let k = 0; k < 18; k++) puff(AI.headPos(_v3), 1, false); }
    } else {
      AI.burnAcc = 1;
      C.root.rotation.x = -Math.min(1.45, Math.max(0, AI.t - 2) * 1.1);
      if (Math.random() < dt * 30) puff(AI.headPos(_v3), 1, true);
      if (Math.random() < dt * 12) puff(C.spine.localToWorld(_v3.set(rand(-.15, .15), rand(0, .8), 0)), 1, true);
      if (A.ctx) A.sizzleG.gain.setTargetAtTime(0.4, A.ctx.currentTime, 0.05);
      if (DAWN.phase === 'sun' && AI.t > 7) { AI.state = 'dead'; C.root.visible = false; if (A.ctx) A.sizzleG.gain.setTargetAtTime(0, A.ctx.currentTime, 0.5); }
    }
  }
  updateObjective();
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
  updateTerror(dt, time);
  chapterMusic(); updateV11(dt, time);
  // HUD
  $('stam').firstChild.style.width = (P.stamina * 100) + '%';
  $('stam').firstChild.style.background = P.holdBreath ? '#e0d070' : '#8fb3c9';
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').style.opacity = 0; }
  if (zoneT > 0) { zoneT -= dt; if (zoneT <= 0) $('zone').style.opacity = 0; }
  P.noiseLevel = Math.max(0, P.noiseLevel - dt);
}
requestAnimationFrame(frame);
window.__FORMOL = { A, get paused() { return paused; }, get playing() { return playing; }, pauseGame: () => pauseGame(), quickStart: () => { audioInit(); decodeAssets(); $('splash').style.display = 'none'; $('menu').style.display = 'none'; startGame(); }, get MODE() { return MODE; }, CINE, TORCH, hand, CAM, cycleShake, AI, P, fl, CFG, scene, camera, renderer, LIGHTS, lightGrid, interact, sim: (sec) => { let t = performance.now() / 1000; for (let k = 0; k < sec * 30; k++) { if (P.dead || P.won) break; step(1 / 30, t += 1 / 30); } }, setPaused: v => { paused = v; }, startPlaying: () => { playing = true; stats.t0 = performance.now(); }, killPlayer, respawn, installOne, startIgnition, computeLightGrid, PROG, UI, closeModal, DOORS, TAPES, LAMPS, CARD, CONSOLE, FOTO, FUSES, pressInteract, findInteract, regionAt, installLamp, showMap, get blocked() { return blocked; }, W, H, DAWN, CRANK, STREET, playTape, stopTape, TP, sunrise, startDawnRun, playChapter, refreshChapters, openTapeList, CELESTE, SUN, MANDATORY_TAPES, applyLights, THROWN, throwItem, cutscene, CUTS, eliasSay, ACH, EXTRAS, STATS, MUS, setMusic, PHOTOS, DRAWER, PHONE, DEBRIS, PHANTOM, SCARE, answerPhone, stats, OPT, get FEAR() { return FEAR; }, set FEAR(v) { FEAR = v; } };
})();
