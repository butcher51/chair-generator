import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateParams, buildChair, disposeObject } from './chair.js';

// --- Scene setup -----------------------------------------------------------

const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f5f3ef');

const GRID_SIZE = 25; // chairs per row/column
const SPACING = 1.7; // meters between chair centers
const extent = ((GRID_SIZE - 1) / 2) * SPACING + 1; // half-size of the occupied area

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, extent * 10 + 50);
camera.position.set(extent * 1.25, extent * 1.2, extent * 1.7);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.3, 0);
controls.enableDamping = true;
controls.minDistance = 0.8;
controls.maxDistance = extent * 4;
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight('#ffffff', '#d9d2c5', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(0.5, 1, 0.75).multiplyScalar(extent + 6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: extent * 4 + 20 });
sun.shadow.normalBias = 0.02;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(extent * 8, extent * 8),
  new THREE.MeshStandardMaterial({ color: '#ece8e1', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(GRID_SIZE * SPACING, GRID_SIZE * 4, '#d8d1c5', '#e2ddd4');
grid.position.y = 0.001;
scene.add(grid);

function resize() {
  const { clientWidth: w, clientHeight: h } = viewport;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((now) => {
  animatePops(now);
  controls.update();
  renderer.render(scene, camera);
});

// --- Generation ------------------------------------------------------------

const seedInput = document.getElementById('seed');
const regenButton = document.getElementById('regen');
const paramsList = document.getElementById('params');
const paramsTitle = document.getElementById('params-title');

// Ring on the floor marking the selected chair
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.62, 0.68, 40),
  new THREE.MeshBasicMaterial({ color: '#2b2a28', transparent: true, opacity: 0.55 })
);
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.003;
scene.add(marker);

const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const loaderBar = document.getElementById('loader-bar');

const RING_DELAY = 100; // ms between each ring of chairs appearing, center outwards
const POP_DURATION = 450; // ms per chair pop
const FRAME_BUDGET = 30; // ms of building per frame before letting the loader repaint

let chairs = []; // { object, params, ring, revealAt, popped }
let generation = 0; // bumped on every generate() so a stale run can bail out

function randomSeed() {
  return Math.random().toString(36).slice(2, 8);
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function setLoader(done, total) {
  loader.hidden = done >= total;
  loaderText.textContent = `Generating chairs… ${done} / ${total}`;
  loaderBar.style.width = `${(done / total) * 100}%`;
}

async function generate(seed) {
  const id = ++generation;
  for (const c of chairs) {
    scene.remove(c.object);
    disposeObject(c.object);
  }
  chairs = [];
  marker.visible = false;
  seedInput.value = seed;
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);

  // Build in time-sliced batches so the loader stays animated
  const total = GRID_SIZE * GRID_SIZE;
  const center = (GRID_SIZE - 1) / 2;
  const built = [];
  setLoader(0, total);
  await nextFrame();
  let sliceStart = performance.now();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const params = generateParams(`${seed}-${built.length + 1}`);
      const object = buildChair(params);
      object.position.set((col - center) * SPACING, 0, (row - center) * SPACING);
      object.userData.chairIndex = built.length;
      object.visible = false;
      const ring = Math.max(Math.abs(row - center), Math.abs(col - center));
      built.push({ object, params, ring, revealAt: 0, popped: false });

      if (performance.now() - sliceStart > FRAME_BUDGET) {
        setLoader(built.length, total);
        await nextFrame();
        if (id !== generation) {
          built.forEach((c) => disposeObject(c.object)); // superseded by a newer seed
          return;
        }
        sliceStart = performance.now();
      }
    }
  }
  setLoader(total, total);

  // Schedule the reveal: one ring every RING_DELAY ms, center first
  const start = performance.now();
  for (const c of built) {
    c.revealAt = start + c.ring * RING_DELAY;
    c.object.scale.setScalar(0.001);
    scene.add(c.object);
  }
  chairs = built;
  select(Math.floor(total / 2));
}

// Ease-out with overshoot: grows past full size, then settles back
function easeOutBack(t, overshoot = 2.2) {
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

function animatePops(now) {
  for (const c of chairs) {
    if (c.popped || now < c.revealAt) continue;
    const t = Math.min((now - c.revealAt) / POP_DURATION, 1);
    c.object.visible = true;
    c.object.scale.setScalar(Math.max(easeOutBack(t), 0.001));
    c.popped = t === 1;
  }
}

function select(index) {
  const { object, params } = chairs[index];
  marker.visible = true;
  marker.position.x = object.position.x;
  marker.position.z = object.position.z;
  paramsTitle.textContent = `Chair ${index + 1} · ${params.seed}`;
  renderParams(params);
}

// --- Picking: click a chair to inspect it (drags still orbit) ----------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;

function chairUnderPointer(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const visible = chairs.filter((c) => c.object.visible).map((c) => c.object);
  const hit = raycaster.intersectObjects(visible, true)[0];
  let o = hit?.object;
  while (o && o.userData.chairIndex === undefined) o = o.parent;
  return o ? o.userData.chairIndex : -1;
}

renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const index = chairUnderPointer(e);
  if (index >= 0) select(index);
});
// Double-click a chair to zoom in on it, double-click the floor to zoom back out
const overview = { position: camera.position.clone(), target: controls.target.clone() };
renderer.domElement.addEventListener('dblclick', (e) => {
  const index = chairUnderPointer(e);
  if (index < 0) {
    camera.position.copy(overview.position);
    controls.target.copy(overview.target);
    return;
  }
  select(index);
  const { x, z } = chairs[index].object.position;
  const viewDir = camera.position.clone().sub(controls.target).setLength(3.2);
  controls.target.set(x, 0.4, z);
  camera.position.copy(controls.target).add(viewDir);
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons) return;
  renderer.domElement.style.cursor = chairUnderPointer(e) >= 0 ? 'pointer' : '';
});

function renderParams(p) {
  const cm = (m) => `${Math.round(m * 100)} cm`;
  const cozy = p.style === 'cozy';
  const rows = [
    ['Style', p.style],
    ['Legs', p.legCount],
    ['Leg thickness', cm(p.legThickness)],
    ...(cozy ? [['Leg height', cm(p.legHeight)]] : []),
    ['Leg sides', p.legSides],
    ['Leg splay', cm(p.legSplay)],
    ['Seat shape', p.seatShape],
    ['Seat height', cm(p.seatHeight)],
    ['Seat size', p.seatShape === 'round' ? `⌀ ${cm(p.seatWidth)}` : `${cm(p.seatWidth)} × ${cm(p.seatDepth)}`],
    ['Seat thickness', cm(p.seatThickness)],
    ...(cozy ? [['Arms', p.hasArms ? `${cm(p.armWidth)} wide` : 'none']] : []),
    ['Back style', p.backStyle],
    ['Back size', `${cm(p.backWidth)} × ${cm(p.backHeight)}`],
    ['Back angle', `${p.backAngle.toFixed(1)}°`],
    ['Pattern', p.pattern === 'stripes' ? `stripes (${p.stripeDirection})` : p.pattern],
    ['Frame', p.frameMode],
  ];
  const swatches = [p.primary, p.pattern === 'solid' ? null : p.secondary, cozy ? p.bodyColor : null, p.frameColor]
    .filter(Boolean)
    .map((c) => `<span class="swatch" style="background:${c}" title="${c}"></span>`)
    .join('');
  paramsList.innerHTML =
    rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') +
    `<dt>Colors</dt><dd>${swatches}</dd>`;
}

seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && seedInput.value.trim()) generate(seedInput.value.trim());
});
regenButton.addEventListener('click', () => generate(randomSeed()));

generate(new URLSearchParams(location.search).get('seed') || randomSeed());
