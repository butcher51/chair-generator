import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Seeded RNG: string seed -> 32-bit hash -> mulberry32 stream
// ---------------------------------------------------------------------------

function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed) {
  const next = mulberry32(hashString(String(seed)));
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

// ---------------------------------------------------------------------------
// Parameters: everything random is decided here, so the build step is pure.
// Units are meters.
// ---------------------------------------------------------------------------

function hsl(h, s, l) {
  return '#' + new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace).getHexString();
}

// Shape parameters per style. Every style returns the same field set
// (plus a few style-specific extras) so the UI can list them uniformly.

// Thin seat on tall straight legs
function classicShape(r) {
  const seatShape = r.pick(['square', 'rect', 'round']);
  const seatWidth = r.range(0.4, 0.58);
  const seatHeight = r.range(0.38, 0.52);
  const seatThickness = r.range(0.03, 0.08);
  return {
    seatShape, seatWidth, seatHeight, seatThickness,
    seatDepth: seatShape === 'rect' ? r.range(0.38, 0.52) : seatWidth,
    seatSides: r.pick([6, 8, 10, 12]), // only used for round seats
    puff: r.range(0.006, 0.02), // edge rounding radius
    legCount: r.int(1, 4),
    legThickness: r.range(0.025, 0.065),
    legSides: r.pick([4, 5, 6, 8]),
    legTaper: r.range(0.55, 1.0), // bottom radius as fraction of top
    legSplay: r.range(0, 0.07), // outward offset at the floor
    legHeight: seatHeight - seatThickness,
    backStyle: r.pick(['panel', 'slats', 'rails']),
    backHeight: r.range(0.25, 0.6),
    backWidth: (seatShape === 'round' ? seatWidth * 0.55 : seatWidth) * r.range(0.7, 1.0),
    backThickness: r.range(0.02, 0.045),
    backAngle: r.range(0, 22), // degrees, tilted backwards
    backBarCount: r.int(2, 6),
  };
}

// Fat upholstered armchair on stubby feet
function cozyShape(r) {
  const seatShape = r.pick(['square', 'rect']);
  const seatWidth = r.range(0.5, 0.75);
  const seatHeight = r.range(0.36, 0.46);
  const seatThickness = r.range(0.1, 0.18);
  const legCount = r.pick([4, 4, 4, 3, 2, 1]);
  // Legs only lift the body; a pedestal needs a bit more room for its column
  let legHeight = Math.min(r.range(0.04, 0.18), seatHeight - seatThickness - 0.06);
  if (legCount === 1) legHeight = Math.max(legHeight, 0.12);
  return {
    seatShape, seatWidth, seatHeight, seatThickness, legCount, legHeight,
    seatDepth: seatShape === 'rect' ? r.range(0.55, 0.8) : seatWidth,
    seatSides: 8,
    puff: r.range(0.04, 0.08),
    legThickness: r.range(0.04, 0.08),
    legSides: r.pick([4, 5, 6, 8]),
    legTaper: r.range(0.55, 1.0),
    legSplay: r.range(0, 0.03),
    hasArms: r.chance(0.7),
    armWidth: r.range(0.08, 0.2),
    armHeight: r.range(0.12, 0.26), // above the seat top
    backStyle: 'cushion',
    backHeight: r.range(0.4, 0.7),
    backWidth: seatWidth,
    backThickness: r.range(0.1, 0.2),
    backAngle: r.range(4, 26),
    backBarCount: 0,
  };
}

// Bentwood café chair: rounded seat, curved legs, hoop or bent backs
function curvyShape(r) {
  const seatWidth = r.range(0.4, 0.5);
  const seatHeight = r.range(0.42, 0.48);
  const seatThickness = r.range(0.025, 0.05);
  return {
    seatShape: 'curved', seatWidth, seatHeight, seatThickness,
    seatDepth: r.range(0.38, 0.48),
    seatExponent: r.range(2, 4), // superellipse: 2 = oval, 4 = squircle
    seatSides: 8,
    puff: r.range(0.008, 0.015),
    legCount: r.pick([4, 4, 4, 3]),
    legThickness: r.range(0.025, 0.045),
    legSides: 6,
    legTaper: 1,
    legSplay: r.range(0.03, 0.08), // amplitude of the leg curve
    legCurve: r.pick(['sabre', 'cabriole', 'bow']),
    legHeight: seatHeight - seatThickness,
    hasRing: r.chance(0.6),
    ringHeight: r.range(0.12, 0.25),
    backStyle: r.pick(['hoop', 'crest', 'bent panel']),
    backHeight: r.range(0.35, 0.55),
    backWidth: seatWidth * r.range(0.6, 0.85),
    backThickness: r.range(0.018, 0.03),
    backAngle: r.range(4, 18),
    backBarCount: r.int(3, 6),
  };
}

const WOOD_TONES = [
  { name: 'oak', h: 0.09, s: 0.45, l: 0.6 },
  { name: 'walnut', h: 0.07, s: 0.35, l: 0.3 },
  { name: 'cherry', h: 0.03, s: 0.5, l: 0.4 },
  { name: 'honey', h: 0.1, s: 0.6, l: 0.5 },
  { name: 'birch', h: 0.11, s: 0.35, l: 0.75 },
  { name: 'mahogany', h: 0.01, s: 0.45, l: 0.28 },
];

// Chance that the frame is wood, per style
const WOOD_CHANCE = { classic: 0.55, curvy: 0.8, cozy: 0.4 };

export function generateParams(seed) {
  const r = createRng(seed);

  const roll = r.next();
  const style = roll < 0.35 ? 'classic' : roll < 0.65 ? 'curvy' : 'cozy';
  const shape = { hasArms: false, armWidth: 0, armHeight: 0, ...{ classic: classicShape, curvy: curvyShape, cozy: cozyShape }[style](r) };

  // Upholstery colors
  const hue = r.next();
  const sat = r.range(0.35, 0.75);
  const light = r.range(0.42, 0.62);
  let primary = hsl(hue, sat, light);
  const bodyColor = hsl(hue, sat * 0.85, light - 0.12); // upholstered body/arms of cozy chairs
  const secondaryMode = r.pick(['light', 'dark', 'complement', 'white']);
  let secondary =
    secondaryMode === 'light' ? hsl(hue, 0.4, 0.85) :
    secondaryMode === 'dark' ? hsl(hue, 0.5, 0.22) :
    secondaryMode === 'complement' ? hsl((hue + 0.5) % 1, 0.55, 0.55) :
    '#f4f1ea';
  let pattern = r.pick(['solid', 'stripes', 'checker']);
  let patternScale = r.int(3, 9);
  const stripeDirection = r.pick(['horizontal', 'vertical']);

  // Frame: wood is the most likely finish
  const isWood = r.chance(WOOD_CHANCE[style]);
  const frameMode = isWood ? 'wood' : r.pick(['black', 'white', 'metal', 'match']);
  const wood = r.pick(WOOD_TONES);
  const woodH = wood.h + r.range(-0.01, 0.01);
  const woodL = wood.l + r.range(-0.05, 0.05);
  const frameColor = {
    wood: hsl(woodH, wood.s, woodL),
    black: '#2a2a2c',
    white: '#efefea',
    metal: '#a7abb0',
    match: hsl(hue, 0.4, 0.32),
  }[frameMode];

  // Wooden chairs are often wood all over: seat & back too, sometimes planked
  const allWood = isWood && style !== 'cozy' && r.chance(style === 'curvy' ? 0.6 : 0.4);
  if (allWood) {
    primary = hsl(woodH, wood.s, woodL + 0.04);
    secondary = hsl(woodH, wood.s, woodL - 0.04);
    pattern = r.chance(0.4) ? 'stripes' : 'solid';
    patternScale = r.int(3, 5);
  }

  return {
    seed: String(seed),
    style,
    ...shape,
    primary, secondary, bodyColor, frameMode, frameColor,
    woodName: isWood ? wood.name : null,
    allWood,
    pattern, patternScale, stripeDirection,
  };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function patternTexture(p) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = p.primary;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = p.secondary;
  const half = size / 2;
  if (p.pattern === 'stripes') {
    if (p.stripeDirection === 'horizontal') ctx.fillRect(0, 0, size, half);
    else ctx.fillRect(0, 0, half, size);
  } else if (p.pattern === 'checker') {
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(p.patternScale, p.patternScale);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeMaterials(p) {
  const surface =
    p.pattern === 'solid'
      ? new THREE.MeshStandardMaterial({ color: p.primary, flatShading: true, roughness: 0.8 })
      : new THREE.MeshStandardMaterial({ map: patternTexture(p), flatShading: true, roughness: 0.8 });
  const frame = new THREE.MeshStandardMaterial({
    color: p.frameColor,
    flatShading: true,
    roughness: p.frameMode === 'metal' ? 0.35 : 0.7,
    metalness: p.frameMode === 'metal' ? 0.6 : 0,
  });
  const body = new THREE.MeshStandardMaterial({ color: p.bodyColor, flatShading: true, roughness: 0.9 });
  return { surface, frame, body };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// Corner radius that never exceeds what the thinnest side allows.
function edgeRadius(radius, w, h, d) {
  return Math.max(0.001, Math.min(radius, Math.min(w, h, d) / 2 - 0.001));
}

// Disc with a rounded rim: a lathe profile with quarter-circle corners.
function roundedDiscGeometry(radius, height, edge, sides) {
  const e = edgeRadius(edge, radius * 2, height, radius * 2);
  const steps = 3;
  const pts = [new THREE.Vector2(0, -height / 2)];
  for (let i = 0; i <= steps; i++) { // bottom rim corner
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - e + Math.cos(a) * e, -height / 2 + e + Math.sin(a) * e));
  }
  for (let i = 0; i <= steps; i++) { // top rim corner
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - e + Math.cos(a) * e, height / 2 - e + Math.sin(a) * e));
  }
  pts.push(new THREE.Vector2(0, height / 2));
  return new THREE.LatheGeometry(pts, sides);
}

// Box with rounded corners & edges (3 bevel segments: soft but still low poly).
function puffy(w, h, d, radius, mat) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, edgeRadius(radius, w, h, d)), mat);
}

// Low-poly cylinder between two points (bottom -> top), optionally tapered.
function strut(bottom, top, rTop, rBottom, sides, mat) {
  const dir = new THREE.Vector3().subVectors(top, bottom);
  const geo = new THREE.CylinderGeometry(rTop, rBottom, dir.length(), sides, 1, false, Math.PI / 4);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.addVectors(top, bottom).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

// ---------------------------------------------------------------------------
// Chair parts
// ---------------------------------------------------------------------------

function buildSeat(p, mats) {
  const geo =
    p.seatShape === 'round'
      ? roundedDiscGeometry(p.seatWidth / 2, p.seatThickness, p.puff, p.seatSides)
      : new RoundedBoxGeometry(p.seatWidth, p.seatThickness, p.seatDepth, 3, edgeRadius(p.puff, p.seatWidth, p.seatThickness, p.seatDepth));
  const seat = new THREE.Mesh(geo, mats.surface);
  seat.position.y = p.seatHeight - p.seatThickness / 2;
  return seat;
}

// Leg top positions (x, z) under a footprint. 3+ legs are spread on a
// superellipse so rectangular footprints push legs towards the corners.
function legAnchors(p, fp) {
  const n = p.legCount;
  const inset = p.legThickness * 1.2;
  const hx = fp.width / 2 - inset;
  const hz = fp.depth / 2 - inset;
  if (n === 1) return [[0, 0]];
  if (n === 2) return [[-hx, 0], [hx, 0]];

  const exponent = fp.round ? 2 : 10;
  const start = n % 2 === 0 ? Math.PI / n : -Math.PI / 2; // symmetric layouts
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pts.push([
      hx * Math.sign(c) * Math.abs(c) ** (2 / exponent),
      hz * Math.sign(s) * Math.abs(s) ** (2 / exponent),
    ]);
  }
  return pts;
}

// fp = footprint the legs hold up: { width, depth, top (y), round }
function buildLegs(p, mats, fp) {
  const group = new THREE.Group();
  const r = p.legThickness / 2;

  // 1 leg: pedestal column on a round base
  if (p.legCount === 1) {
    const baseH = 0.03;
    const baseR = Math.min(fp.width, fp.depth) * 0.38;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 0.9, baseR, baseH, 10), mats.frame);
    base.position.y = baseH / 2;
    group.add(base);
    const colR = Math.max(r * 1.6, 0.03);
    group.add(strut(new THREE.Vector3(0, baseH, 0), new THREE.Vector3(0, fp.top, 0), colR, colR, p.legSides, mats.frame));
    return group;
  }

  // 2 legs: side legs standing on floor runners (sled style)
  const runnerH = p.legCount === 2 ? p.legThickness * 0.8 : 0;
  if (p.legCount === 2) {
    for (const sx of [-1, 1]) {
      const x = sx * (fp.width / 2 - r * 1.2 + p.legSplay);
      const runner = puffy(p.legThickness * 1.2, runnerH, fp.depth * 0.9, p.puff, mats.frame);
      runner.position.set(x, runnerH / 2, 0);
      group.add(runner);
    }
  }

  for (const [x, z] of legAnchors(p, fp)) {
    const top = new THREE.Vector3(x, fp.top, z);
    const out = new THREE.Vector2(x, z);
    if (p.legCount === 2) out.set(Math.sign(x), 0);
    if (out.lengthSq() > 0) out.normalize().multiplyScalar(p.legSplay);
    const bottom = new THREE.Vector3(x + out.x, runnerH, z + out.y);
    group.add(strut(bottom, top, r, r * p.legTaper, p.legSides, mats.frame));
  }
  return group;
}

function buildBackrest(p, mats) {
  // Pivot sits on the back edge of the seat; tilting it tilts the whole back.
  const pivot = new THREE.Group();
  const backEdge = p.seatShape === 'round' ? (p.seatWidth / 2) * 0.85 : p.seatDepth / 2;
  pivot.position.set(0, p.seatHeight, -backEdge + p.backThickness / 2);
  pivot.rotation.x = -THREE.MathUtils.degToRad(p.backAngle);

  const w = p.backWidth, h = p.backHeight, t = p.backThickness;

  if (p.backStyle === 'panel') {
    const panel = puffy(w, h, t, p.puff, mats.surface);
    panel.position.y = h / 2;
    pivot.add(panel);
    return pivot;
  }

  // Frame: two posts + a patterned top rail, filled with slats or rails
  const postW = Math.max(t, p.legThickness * 0.8);
  for (const sx of [-1, 1]) {
    const post = puffy(postW, h, t, p.puff, mats.frame);
    post.position.set(sx * (w / 2 - postW / 2), h / 2, 0);
    pivot.add(post);
  }
  const railH = Math.max(h * 0.22, 0.05);
  const topRail = puffy(w, railH, t * 1.1, p.puff, mats.surface);
  topRail.position.y = h - railH / 2;
  pivot.add(topRail);

  const innerW = w - postW * 2;
  const innerH = h - railH;
  const n = p.backBarCount;
  if (p.backStyle === 'slats') {
    const slatW = Math.min(innerW / (n * 2), 0.04);
    for (let i = 0; i < n; i++) {
      const slat = puffy(slatW, innerH, t * 0.6, p.puff, mats.frame);
      slat.position.set(-innerW / 2 + (innerW * (i + 0.5)) / n, innerH / 2, 0);
      pivot.add(slat);
    }
  } else {
    const barH = Math.min(innerH / (n * 2.5), 0.035);
    for (let i = 0; i < n; i++) {
      const bar = puffy(innerW, barH, t * 0.6, p.puff, mats.frame);
      bar.position.y = (innerH * (i + 0.5)) / n;
      pivot.add(bar);
    }
  }
  return pivot;
}

function buildClassic(p, mats) {
  const footprint = {
    width: p.seatWidth,
    depth: p.seatDepth,
    top: p.seatHeight - p.seatThickness,
    round: p.seatShape === 'round',
  };
  return [buildSeat(p, mats), buildLegs(p, mats, footprint), buildBackrest(p, mats)];
}

// Upholstered armchair: short legs -> body block -> fat seat & back cushions,
// with optional chunky arms on both sides of the body.
function buildCozy(p, mats) {
  const parts = [];
  const armW = p.hasArms ? p.armWidth : 0;
  const cushionBottom = p.seatHeight - p.seatThickness;

  const bodyH = cushionBottom - p.legHeight;
  const body = puffy(p.seatWidth, bodyH, p.seatDepth, p.puff, mats.body);
  body.position.y = p.legHeight + bodyH / 2;
  parts.push(body);

  if (p.hasArms) {
    const armH = p.seatHeight + p.armHeight - p.legHeight;
    for (const sx of [-1, 1]) {
      const arm = puffy(armW, armH, p.seatDepth, p.puff * 1.5, mats.body);
      arm.position.set(sx * (p.seatWidth / 2 + armW / 2), p.legHeight + armH / 2, 0);
      parts.push(arm);
    }
  }

  // Seat cushion sits in front of the back cushion
  const cushionDepth = p.seatDepth - p.backThickness;
  const cushion = puffy(p.seatWidth, p.seatThickness, cushionDepth, p.puff * 1.5, mats.surface);
  cushion.position.set(0, cushionBottom + p.seatThickness / 2, p.backThickness / 2);
  parts.push(cushion);

  // Back cushion pivots on its bottom edge at the rear of the body
  const pivot = new THREE.Group();
  pivot.position.set(0, cushionBottom, -p.seatDepth / 2 + p.backThickness / 2);
  pivot.rotation.x = -THREE.MathUtils.degToRad(p.backAngle);
  const back = puffy(p.backWidth, p.backHeight, p.backThickness, p.puff * 1.5, mats.surface);
  back.position.y = p.backHeight / 2;
  pivot.add(back);
  parts.push(pivot);

  const footprint = { width: p.seatWidth + armW * 2, depth: p.seatDepth, top: p.legHeight, round: false };
  parts.push(buildLegs(p, mats, footprint));
  return parts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Bake all parts into one mesh per material, so a chair costs ~3 draw calls
// instead of one per part (matters when hundreds of chairs are on screen).
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const byMaterial = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
    // RoundedBoxGeometry is non-indexed; merging requires all parts to match
    const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    byMaterial.get(o.material).push(geometry.applyMatrix4(o.matrixWorld));
    o.geometry.dispose();
  });
  const merged = new THREE.Group();
  for (const [material, geometries] of byMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = mesh.receiveShadow = true;
    merged.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  return merged;
}

export function buildChair(p) {
  const mats = makeMaterials(p);
  const parts = new THREE.Group();
  parts.add(...(p.style === 'cozy' ? buildCozy(p, mats) : buildClassic(p, mats)));
  return mergeByMaterial(parts);
}

export function disposeObject(root) {
  const materials = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    materials.add(o.material);
  });
  for (const m of materials) {
    m.map?.dispose();
    m.dispose();
  }
}
