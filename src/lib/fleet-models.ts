import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Modelos 3D de la flota. Unidades en metros: x a la derecha, y hacia el frente, z hacia arriba.
 * Cada modelo devuelve un grupo listo para la escena y sus piezas animadas.
 */

export type Kind =
  | "truck"
  | "ambulance"
  | "police"
  | "crew"
  | "bus"
  | "sedan"
  | "taxi"
  | "semi"
  | "dump"
  | "tanker"
  | "fire"
  | "excavator"
  | "loader"
  | "fork";

export const KINDS: Kind[] = [
  "truck",
  "semi",
  "dump",
  "tanker",
  "fire",
  "ambulance",
  "police",
  "crew",
  "bus",
  "sedan",
  "taxi",
  "excavator",
  "loader",
  "fork",
];

export type VehicleRig = {
  root: THREE.Group;
  /** Ancho y largo del contorno en metros, para sombra y marco de selección. */
  width: number;
  length: number;
  height: number;
  /** Desfase del centro del contorno sobre el eje y del modelo. */
  centerY: number;
  /** Avanza las animaciones propias del modelo. `moving` indica si va rodando. */
  animate(time: number, moving: boolean): void;
};

const C = {
  white: "#f4f6fa",
  paper: "#fbfcfe",
  cool: "#e2e8f0",
  steel: "#c3ccd8",
  chrome: "#dfe5ec",
  dark: "#2b313b",
  ink: "#1d222a",
  tire: "#252a32",
  hub: "#cfd6df",
  glass: "#2a3a55",
  glassHi: "#3b5378",
  head: "#fff2c4",
  tail: "#e8423a",
  amber: "#ffb13b",
  orange: "#f2861e",
  orangeHi: "#ffb15a",
  blue: "#2f6fe0",
  navy: "#1d4e9c",
  red: "#d93a32",
  yellow: "#f2b51c",
  cat: "#f0b429",
  catDark: "#c98e10",
  wood: "#b98a55",
  box: "#d6a46a",
  boxHi: "#e6bd87",
  tape: "#efd6ad",
  skin: "#e9c39b",
  vest: "#f07a1a",
  gravel: "#8e7c69",
  gravelHi: "#a8937d",
};

const materials = new Map<string, THREE.Material>();

function mat(color: string, glow = false): THREE.Material {
  const key = `${color}:${glow ? 1 : 0}`;
  let found = materials.get(key);
  if (!found) {
    found = glow
      ? new THREE.MeshBasicMaterial({ color, toneMapped: false })
      : new THREE.MeshStandardMaterial({
          color,
          roughness: color === C.glass || color === C.glassHi ? 0.32 : color === C.chrome ? 0.38 : 0.68,
          metalness: color === C.chrome ? 0.25 : 0.02,
        });
    materials.set(key, found);
  }
  return found;
}

/** Junta piezas por color en una sola malla para que cada vehículo cueste pocos draw calls. */
class Kit {
  private buckets = new Map<string, THREE.BufferGeometry[]>();
  private glows = new Set<string>();

  box(color: string, x: number, y: number, z: number, w: number, l: number, h: number, r = 0.12, rx = 0, rz = 0) {
    const radius = Math.max(0.001, Math.min(r, w / 2 - 0.001, l / 2 - 0.001, h / 2 - 0.001));
    const geo = new RoundedBoxGeometry(w, l, h, radius > 0.08 ? 3 : 1, radius);
    if (rx) geo.rotateX(rx);
    if (rz) geo.rotateZ(rz);
    geo.translate(x, y, z + h / 2);
    this.push(color, geo);
  }

  cyl(color: string, x: number, y: number, z: number, radius: number, length: number, axis: "x" | "y" | "z", seg = 18, top = radius) {
    const geo = new THREE.CylinderGeometry(top, radius, length, seg);
    if (axis === "x") geo.rotateZ(Math.PI / 2);
    if (axis === "z") geo.rotateX(Math.PI / 2);
    geo.translate(x, y, z);
    this.push(color, geo);
  }

  capsule(color: string, x: number, y: number, z: number, radius: number, length: number, axis: "y" | "z", sx = 1, sz = 1) {
    const geo = new THREE.CapsuleGeometry(radius, length, 6, 20);
    if (axis === "z") geo.rotateX(Math.PI / 2);
    geo.scale(sx, 1, sz);
    geo.translate(x, y, z);
    this.push(color, geo);
  }

  sphere(color: string, x: number, y: number, z: number, radius: number, sz = 1) {
    const geo = new THREE.SphereGeometry(radius, 16, 12);
    geo.scale(1, 1, sz);
    geo.translate(x, y, z);
    this.push(color, geo);
  }

  dome(color: string, x: number, y: number, z: number, radius: number) {
    const geo = new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.rotateX(Math.PI / 2);
    geo.translate(x, y, z);
    this.push(color, geo);
  }

  glow(color: string, x: number, y: number, z: number, w: number, l: number, h: number) {
    this.glows.add(color);
    this.box(color, x, y, z, w, l, h, Math.min(w, l, h) * 0.3);
  }

  wheel(x: number, y: number, radius: number, width = 0.42, hub = C.hub) {
    this.cyl(C.tire, x, y, radius, radius, width, "x", 20);
    const out = Math.sign(x) || 1;
    this.cyl(hub, x + out * (width / 2), y, radius, radius * 0.52, 0.06, "x", 16);
    this.cyl(C.dark, x + out * (width / 2 + 0.03), y, radius, radius * 0.18, 0.05, "x", 10);
  }

  person(x: number, y: number, z: number, vest = C.vest, hat = C.yellow, sitting = false) {
    const legs = sitting ? 0.25 : 0.62;
    this.box(C.navy, x, y, z, 0.34, 0.24, legs, 0.08);
    this.capsule(vest, x, y, z + legs + 0.3, 0.2, 0.28, "z", 1.1, 1);
    this.sphere(C.skin, x, y, z + legs + 0.78, 0.17);
    this.dome(hat, x, y, z + legs + 0.83, 0.2);
  }

  pallet(x: number, y: number, z: number, cols = 2, rows = 2, tiers = 2, size = 0.52) {
    const span = size * Math.max(cols, rows) + 0.1;
    this.box(C.wood, x, y, z, span, span, 0.14, 0.03);
    for (let t = 0; t < tiers; t += 1) {
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const bx = x + (i - (cols - 1) / 2) * size;
          const by = y + (j - (rows - 1) / 2) * size;
          const bz = z + 0.14 + t * size * 0.86;
          this.box((i + j + t) % 2 ? C.box : C.boxHi, bx, by, bz, size - 0.04, size - 0.04, size * 0.84, 0.05);
          this.box(C.tape, bx, by, bz + size * 0.84 - 0.01, size * 0.16, size - 0.03, 0.02, 0.005);
        }
      }
    }
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    for (const [color, list] of this.buckets) {
      const clean = list.map((geo) => {
        const flat = geo.index ? geo.toNonIndexed() : geo;
        for (const name of Object.keys(flat.attributes)) {
          if (name !== "position" && name !== "normal") flat.deleteAttribute(name);
        }
        if (flat !== geo) geo.dispose();
        return flat;
      });
      const merged = mergeGeometries(clean, false);
      for (const geo of clean) geo.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat(color, this.glows.has(color)));
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }

  private push(color: string, geo: THREE.BufferGeometry) {
    const list = this.buckets.get(color);
    if (list) list.push(geo);
    else this.buckets.set(color, [geo]);
  }
}

function cabover(k: Kit, y0: number, y1: number, w: number, z0: number, h: number, color: string, trim?: string) {
  const l = y1 - y0;
  const cy = (y0 + y1) / 2;
  k.box(color, 0, cy, z0, w, l, h, 0.34);
  k.box(C.glass, 0, y1 - 0.03, z0 + h * 0.5, w - 0.34, 0.14, h * 0.36, 0.06);
  k.box(C.glass, 0, y1 - l * 0.3, z0 + h * 0.52, w + 0.04, l * 0.4, h * 0.32, 0.06);
  k.box(C.dark, 0, y1 + 0.02, z0 - 0.12, w + 0.04, 0.32, 0.46, 0.12);
  k.box(C.ink, 0, y1 + 0.01, z0 + 0.42, w * 0.5, 0.08, h * 0.2, 0.03);
  for (const side of [-1, 1]) {
    k.glow(C.head, side * (w / 2 - 0.34), y1 + 0.04, z0 + 0.45, 0.42, 0.06, 0.2);
    k.box(C.ink, side * (w / 2 + 0.16), y1 - 0.35, z0 + h * 0.5, 0.08, 0.14, 0.55, 0.03);
    k.box(C.dark, side * (w / 2 + 0.1), y1 - 0.38, z0 + h * 0.62, 0.16, 0.06, 0.06, 0.02);
  }
  if (trim) k.box(trim, 0, cy, z0 + 0.32, w + 0.03, l - 0.2, 0.22, 0.05);
}

function lightbar(k: Kit, y: number, z: number, width: number) {
  k.box(C.ink, 0, y, z, width, 0.34, 0.1, 0.04);
  const red = new Kit();
  const blue = new Kit();
  red.box("#ff3b3b", -width / 4 - 0.02, y, z + 0.08, width / 2 - 0.1, 0.28, 0.16, 0.06);
  blue.box("#3d7eff", width / 4 + 0.02, y, z + 0.08, width / 2 - 0.1, 0.28, 0.16, 0.06);
  return { red: red.build(), blue: blue.build() };
}

/** Luces de emergencia: un material propio por unidad para que destellen a destiempo. */
function flasher(redGroup: THREE.Group, blueGroup: THREE.Group, phase: number) {
  const red = new THREE.MeshBasicMaterial({ color: "#ff3b3b", toneMapped: false });
  const blue = new THREE.MeshBasicMaterial({ color: "#3d7eff", toneMapped: false });
  redGroup.traverse((node) => {
    if (node instanceof THREE.Mesh) node.material = red;
  });
  blueGroup.traverse((node) => {
    if (node instanceof THREE.Mesh) node.material = blue;
  });
  const onRed = new THREE.Color("#ff3b3b");
  const offRed = new THREE.Color("#5c1a1a");
  const onBlue = new THREE.Color("#4a8bff");
  const offBlue = new THREE.Color("#18306a");
  return (time: number) => {
    const beat = Math.floor((time + phase) / 140) % 4;
    red.color.copy(beat === 0 || beat === 1 ? onRed : offRed);
    blue.color.copy(beat === 2 || beat === 3 ? onBlue : offBlue);
  };
}

function tailLights(k: Kit, y: number, z: number, half: number) {
  for (const side of [-1, 1]) k.glow(C.tail, side * half, y, z, 0.3, 0.06, 0.2);
}

function modelTruck(accent: string): VehicleRig {
  const k = new Kit();
  k.box(C.dark, 0, -0.2, 0.45, 1.7, 7.7, 0.36, 0.06);
  cabover(k, 1.75, 4.05, 2.3, 0.6, 2.15, C.white);
  k.box(C.white, 0, 2.55, 2.55, 2.1, 1.2, 0.95, 0.4, -0.32);
  k.box(C.orange, 0, 2.92, 0.98, 2.33, 1.9, 0.2, 0.05);
  k.box(C.paper, 0, -1.25, 0.85, 2.5, 5.7, 2.9, 0.18);
  k.box(accent === C.blue ? C.orange : accent, 0, -1.25, 1.18, 2.54, 5.45, 0.3, 0.06);
  k.box(C.orangeHi, 0, -1.25, 1.56, 2.54, 5.45, 0.1, 0.03);
  for (let i = -3; i <= 3; i += 1) k.box(C.cool, i * 0.34, -4.1, 1.05, 0.07, 0.06, 2.5, 0.02);
  k.box(C.steel, 0, -4.12, 0.62, 2.3, 0.14, 0.18, 0.04);
  tailLights(k, -4.13, 0.95, 1.0);
  for (const side of [-1, 1]) {
    k.glow(C.amber, side * 1.26, -0.2, 1.0, 0.04, 0.16, 0.1);
    k.glow(C.amber, side * 1.26, -3.6, 1.0, 0.04, 0.16, 0.1);
    k.box(C.ink, side * 0.94, -0.6, 0.45, 0.4, 1.0, 0.45, 0.1);
  }
  for (const side of [-1, 1]) {
    k.wheel(side * 1.02, 2.75, 0.55);
    k.wheel(side * 1.02, -2.05, 0.55);
    k.wheel(side * 1.02, -3.15, 0.55);
  }
  return finish(k, 2.55, 8.4, 3.75);
}

function modelSemi(accent: string): VehicleRig {
  const k = new Kit();
  const shift = -1.1;
  k.box(C.dark, 0, 3.3 - shift, 0.48, 1.6, 6.2, 0.36, 0.06);
  k.box(accent, 0, 5.4 - shift, 0.78, 2.1, 2.1, 1.38, 0.38);
  k.box(C.chrome, 0, 6.45 - shift, 0.95, 1.25, 0.08, 1.05, 0.06);
  for (let i = 0; i < 5; i += 1) k.box(C.dark, 0, 6.5 - shift, 1.05 + i * 0.2, 1.1, 0.04, 0.06, 0.01);
  k.box(C.chrome, 0, 6.5 - shift, 0.4, 2.35, 0.32, 0.42, 0.12);
  for (const side of [-1, 1]) {
    k.glow(C.head, side * 0.82, 6.47 - shift, 1.25, 0.32, 0.06, 0.2);
    k.box(accent, side * 1.08, 5.4 - shift, 0.72, 0.36, 2.05, 0.58, 0.2);
  }
  k.box(accent, 0, 3.45 - shift, 0.72, 2.35, 1.8, 2.5, 0.32);
  k.box(C.glass, 0, 4.32 - shift, 2.22, 2.05, 0.14, 0.78, 0.06, -0.22);
  k.box(C.glass, 0, 3.7 - shift, 2.18, 2.39, 0.86, 0.72, 0.06);
  k.box(accent, 0, 2.05 - shift, 0.82, 2.35, 1.35, 2.75, 0.34);
  k.box(accent, 0, 2.5 - shift, 3.2, 2.2, 2.0, 0.55, 0.26, 0.22);
  k.box(C.white, 0, 3.0 - shift, 1.2, 2.39, 3.5, 0.16, 0.05);
  for (const side of [-1, 1]) {
    k.cyl(C.chrome, side * 1.28, 2.75 - shift, 2.6, 0.11, 2.8, "z", 12);
    k.cyl(C.chrome, side * 1.08, 3.55 - shift, 0.78, 0.36, 1.15, "y", 16);
    k.box(C.ink, side * 1.32, 4.15 - shift, 2.3, 0.08, 0.14, 0.6, 0.03);
  }
  k.box(C.paper, 0, -4.5 - shift + 1.0, 1.35, 2.55, 10.4, 2.95, 0.16);
  k.box(accent, 0, -4.5 - shift + 1.0, 1.62, 2.59, 10.1, 0.26, 0.06);
  k.box(C.cool, 0, -4.5 - shift + 1.0, 1.36, 2.4, 10.3, 0.2, 0.04);
  for (let i = -3; i <= 3; i += 1) k.box(C.cool, i * 0.34, -9.72 - shift + 1.0, 1.5, 0.07, 0.06, 2.6, 0.02);
  tailLights(k, -9.75 - shift + 1.0, 1.15, 1.0);
  for (const side of [-1, 1]) {
    k.box(C.dark, side * 0.7, -0.6 - shift + 1.0, 0.25, 0.12, 0.2, 1.1, 0.04);
    k.wheel(side * 1.02, 5.25 - shift, 0.55);
    k.wheel(side * 1.02, 1.9 - shift, 0.55);
    k.wheel(side * 1.02, 0.8 - shift, 0.55);
    k.wheel(side * 1.08, -7.6 - shift + 1.0, 0.52);
    k.wheel(side * 1.08, -8.7 - shift + 1.0, 0.52);
  }
  return finish(k, 2.6, 15.3, 4.3, 0);
}

function modelBus(accent: string): VehicleRig {
  const k = new Kit();
  k.box(accent, 0, -1.2, 0.62, 2.5, 9.3, 2.6, 0.32);
  k.box(C.white, 0, -1.2, 3.06, 2.36, 9.0, 0.28, 0.14);
  k.box(accent, 0, 4.15, 0.75, 2.12, 1.75, 1.28, 0.4);
  k.box(C.ink, 0, 5.05, 0.5, 2.3, 0.28, 0.4, 0.12);
  k.box(C.ink, 0, 5.0, 1.05, 1.1, 0.08, 0.7, 0.04);
  for (const side of [-1, 1]) k.glow(C.head, side * 0.78, 5.03, 1.3, 0.36, 0.06, 0.24);
  k.box(C.glass, 0, 3.32, 2.05, 2.25, 0.14, 0.95, 0.06, -0.12);
  k.box(C.glass, 0, -1.55, 1.98, 2.54, 8.0, 0.88, 0.06);
  for (let i = 0; i < 9; i += 1) k.box(accent, 0, 2.3 - i * 0.92, 1.98, 2.56, 0.14, 0.88, 0.02);
  k.box(C.red, 0, -1.2, 1.38, 2.54, 9.2, 0.2, 0.05);
  k.box(C.blue, 0, -1.2, 1.12, 2.54, 9.2, 0.14, 0.04);
  k.box(C.ink, 0, -5.88, 0.55, 2.3, 0.22, 0.38, 0.1);
  tailLights(k, -5.86, 1.05, 0.95);
  for (const side of [-1, 1]) {
    k.box(C.ink, side * 0.95, -1.4, 3.34, 0.07, 6.8, 0.18, 0.03);
    k.box(C.ink, side * 1.4, 3.15, 1.9, 0.08, 0.14, 0.6, 0.03);
  }
  for (let i = 0; i < 6; i += 1) k.box(C.ink, 0, 1.8 - i * 1.25, 3.34, 1.95, 0.07, 0.07, 0.02);
  k.box("#5f8fd6", -0.35, 0.6, 3.34, 0.8, 1.3, 0.55, 0.16);
  k.box(C.box, 0.4, -1.4, 3.34, 0.9, 0.9, 0.5, 0.08);
  k.box("#c44b4b", 0.1, -3.4, 3.34, 1.2, 0.9, 0.45, 0.16);
  for (const side of [-1, 1]) {
    k.wheel(side * 1.1, 3.95, 0.56);
    k.wheel(side * 1.1, -3.65, 0.56);
  }
  return finish(k, 2.55, 11.0, 3.8, -0.4);
}

function modelSedan(color: string, extra?: (k: Kit) => void): VehicleRig {
  const k = new Kit();
  k.box(color, 0, 0, 0.3, 1.88, 4.5, 0.72, 0.32);
  k.box(C.glass, 0, -0.3, 0.92, 1.66, 2.35, 0.6, 0.3);
  k.box(color, 0, -0.42, 1.44, 1.58, 1.78, 0.16, 0.07);
  k.box(C.ink, 0, 2.2, 0.28, 1.84, 0.2, 0.26, 0.08);
  k.box(C.ink, 0, -2.2, 0.28, 1.84, 0.2, 0.26, 0.08);
  for (const side of [-1, 1]) {
    k.glow(C.head, side * 0.62, 2.24, 0.72, 0.38, 0.05, 0.14);
    k.glow(C.tail, side * 0.66, -2.24, 0.74, 0.36, 0.05, 0.14);
    k.box(color, side * 0.98, 0.72, 0.98, 0.1, 0.14, 0.12, 0.03);
    k.wheel(side * 0.84, 1.42, 0.36, 0.3);
    k.wheel(side * 0.84, -1.42, 0.36, 0.3);
  }
  extra?.(k);
  return finish(k, 1.9, 4.6, 1.65);
}

function modelTaxi(color: string): VehicleRig {
  return modelSedan(color, (k) => {
    k.box(C.paper, 0, -0.4, 1.6, 0.66, 0.3, 0.24, 0.06);
    k.box(C.ink, 0, -0.4, 1.66, 0.68, 0.24, 0.08, 0.02);
    for (let i = 0; i < 6; i += 1) k.box(i % 2 ? C.ink : C.paper, 0, 1.6 - i * 0.62, 0.62, 1.9, 0.3, 0.14, 0.02);
  });
}

function modelPolice(accent: string): VehicleRig {
  let bar: { red: THREE.Group; blue: THREE.Group } | null = null;
  const rig = modelSedan(C.paper, (k) => {
    k.box(accent, 0, -0.1, 0.42, 1.91, 2.5, 0.44, 0.1);
    k.box(C.ink, 0, 1.55, 0.86, 1.6, 1.0, 0.12, 0.06);
    bar = lightbar(k, -0.2, 1.6, 1.3);
  });
  return withFlasher(rig, bar, 0);
}

function withFlasher(rig: VehicleRig, bar: { red: THREE.Group; blue: THREE.Group } | null, phase: number): VehicleRig {
  if (!bar) return rig;
  const { red, blue } = bar;
  rig.root.add(red, blue);
  const flash = flasher(red, blue, phase);
  const base = rig.animate;
  rig.animate = (time, moving) => {
    base(time, moving);
    flash(time);
  };
  return rig;
}

function modelAmbulance(): VehicleRig {
  const k = new Kit();
  k.box(C.paper, 0, -0.65, 0.52, 2.3, 4.7, 2.4, 0.28);
  k.box(C.paper, 0, 2.1, 0.55, 2.12, 1.4, 1.58, 0.42);
  k.box(C.glass, 0, 1.69, 2.0, 1.98, 0.12, 0.72, 0.05);
  k.box(C.glass, 0, 1.1, 1.92, 2.33, 0.85, 0.7, 0.06);
  k.box(C.ink, 0, 2.82, 0.42, 2.18, 0.28, 0.4, 0.12);
  k.box(C.ink, 0, 2.8, 0.9, 1.0, 0.08, 0.4, 0.04);
  for (const side of [-1, 1]) {
    k.glow(C.head, side * 0.72, 2.81, 1.1, 0.36, 0.06, 0.2);
    k.box(C.ink, side * 1.24, 1.5, 1.85, 0.08, 0.14, 0.5, 0.03);
  }
  k.box(C.red, 0, -0.65, 1.3, 2.34, 4.65, 0.34, 0.06);
  k.box(C.red, 0, 2.1, 1.3, 2.16, 1.32, 0.34, 0.06);
  k.box(C.red, 0, -1.05, 2.9, 0.32, 1.25, 0.06, 0.02);
  k.box(C.red, 0, -1.05, 2.9, 1.25, 0.32, 0.06, 0.02);
  for (const side of [-1, 1]) {
    k.box(C.red, side * 1.16, -1.3, 1.85, 0.04, 0.24, 0.8, 0.01);
    k.box(C.red, side * 1.16, -1.3, 2.13, 0.04, 0.8, 0.24, 0.01);
  }
  k.box(C.glass, 0, -3.02, 1.85, 1.5, 0.08, 0.6, 0.04);
  k.box(C.ink, 0, -3.05, 0.95, 0.04, 0.08, 1.75, 0.01);
  tailLights(k, -3.03, 0.95, 0.95);
  const bar = lightbar(k, 1.35, 2.9, 1.7);
  for (const side of [-1, 1]) {
    k.wheel(side * 0.98, 1.85, 0.45, 0.36);
    k.wheel(side * 0.98, -1.75, 0.45, 0.36);
  }
  return withFlasher(finish(k, 2.35, 6.0, 3.1, -0.15), bar, 70);
}

function modelCrew(accent: string): VehicleRig {
  const k = new Kit();
  k.box(C.dark, 0, -0.4, 0.45, 1.6, 6.6, 0.34, 0.06);
  cabover(k, 1.35, 3.45, 2.2, 0.58, 2.0, accent, C.white);
  k.box(C.steel, 0, -1.25, 0.92, 2.36, 4.9, 0.22, 0.05);
  for (const side of [-1, 1]) {
    k.box(C.cool, side * 1.12, -1.25, 1.75, 0.08, 4.9, 0.09, 0.03);
    k.box(C.cool, side * 1.12, -1.25, 1.35, 0.08, 4.9, 0.07, 0.02);
    for (let i = 0; i < 5; i += 1) k.box(C.cool, side * 1.12, 1.1 - i * 1.18, 1.1, 0.08, 0.08, 0.72, 0.02);
  }
  k.box(C.cool, 0, -3.66, 1.35, 2.3, 0.08, 0.5, 0.02);
  k.box(C.steel, 0, -0.5, 1.1, 0.5, 3.2, 0.36, 0.06);
  k.person(-0.62, 0.55, 1.12, C.vest, C.yellow, true);
  k.person(0.62, 0.05, 1.12, "#3cc47a", C.paper, true);
  k.person(-0.62, -0.9, 1.12, C.vest, C.paper, true);
  k.person(0.62, -1.5, 1.12, C.vest, C.yellow, true);
  k.person(-0.6, -2.55, 1.12, "#3cc47a", C.yellow);
  tailLights(k, -3.72, 0.7, 0.95);
  for (const side of [-1, 1]) {
    k.wheel(side * 0.98, 2.45, 0.5);
    k.wheel(side * 0.98, -2.2, 0.5);
  }
  return finish(k, 2.4, 7.3, 3.1, -0.1);
}

function modelDump(accent: string): VehicleRig {
  const k = new Kit();
  k.box(C.dark, 0, -0.4, 0.5, 1.6, 7.0, 0.38, 0.06);
  cabover(k, 1.8, 3.95, 2.35, 0.65, 2.15, C.white, accent);
  for (const side of [-1, 1]) {
    k.box(C.ink, side * 1.0, -0.35, 0.5, 0.42, 0.7, 0.5, 0.12);
    k.cyl(C.chrome, side * 1.22, 1.55, 2.0, 0.09, 2.4, "z", 10);
    k.wheel(side * 1.06, 2.85, 0.6, 0.46);
    k.wheel(side * 1.06, -1.85, 0.6, 0.46);
    k.wheel(side * 1.06, -3.05, 0.6, 0.46);
  }
  tailLights(k, -3.95, 0.7, 1.0);
  const bed = new Kit();
  const len = 5.1;
  bed.box(accent, 0, len / 2, 0, 2.5, len, 0.26, 0.06);
  for (const side of [-1, 1]) {
    bed.box(accent, side * 1.2, len / 2, 0.1, 0.16, len, 1.3, 0.08);
    for (let i = 0; i < 5; i += 1) bed.box(C.orangeHi, side * 1.29, 0.5 + i * 1.02, 0.15, 0.06, 0.16, 1.18, 0.02);
  }
  bed.box(accent, 0, len - 0.05, 0.1, 2.5, 0.18, 1.75, 0.08);
  bed.box(accent, 0, len + 0.3, 1.62, 2.4, 0.9, 0.16, 0.06);
  bed.box(C.orangeHi, 0, 0.06, 0.1, 2.5, 0.16, 1.2, 0.06);
  bed.box(C.gravel, 0, len / 2 + 0.1, 0.25, 2.2, len - 0.5, 1.15, 0.5);
  bed.sphere(C.gravelHi, -0.3, len / 2 + 0.5, 1.35, 0.85, 0.42);
  bed.sphere(C.gravel, 0.45, len / 2 - 0.9, 1.3, 0.7, 0.4);
  const bedGroup = bed.build();
  const pivot = new THREE.Group();
  pivot.position.set(0, -3.9, 0.95);
  pivot.add(bedGroup);
  const rig = finish(k, 2.55, 8.0, 3.2, -0.1);
  rig.root.add(pivot);
  let tilt = 0;
  rig.animate = (time, moving) => {
    const target = moving ? 0 : 0.5 + Math.sin(time / 900) * 0.05;
    tilt += (target - tilt) * 0.04;
    pivot.rotation.x = tilt;
  };
  return rig;
}

function modelTanker(accent: string): VehicleRig {
  const k = new Kit();
  k.box(C.dark, 0, -0.5, 0.48, 1.6, 7.4, 0.36, 0.06);
  cabover(k, 1.95, 4.1, 2.3, 0.62, 2.12, C.blue, C.white);
  k.capsule(accent, 0, -1.45, 2.08, 1.08, 3.85, "y", 1.05, 0.92);
  for (const y of [0.25, -1.45, -3.15]) k.cyl(C.steel, 0, y, 2.08, 1.15, 0.14, "y", 24);
  k.box(C.dark, 0, -1.45, 3.08, 0.6, 4.6, 0.08, 0.02);
  for (const side of [-1, 1]) k.box(C.chrome, side * 0.34, -1.45, 3.16, 0.05, 4.6, 0.28, 0.01);
  k.box(C.dark, 0, -1.45, 1.0, 2.2, 5.6, 0.18, 0.04);
  k.box(C.orange, 0, -4.36, 2.0, 0.6, 0.06, 0.45, 0.04);
  tailLights(k, -4.3, 0.9, 1.0);
  for (const side of [-1, 1]) {
    k.wheel(side * 1.02, 3.0, 0.55);
    k.wheel(side * 1.02, -2.55, 0.55);
    k.wheel(side * 1.02, -3.65, 0.55);
  }
  return finish(k, 2.5, 8.7, 3.25, -0.2);
}

function modelFire(accent: string): VehicleRig {
  const k = new Kit();
  k.box(C.dark, 0, -0.5, 0.48, 1.7, 8.4, 0.36, 0.06);
  cabover(k, 2.0, 4.35, 2.45, 0.62, 2.3, accent, C.paper);
  k.box(accent, 0, -1.25, 0.72, 2.5, 6.4, 2.25, 0.2);
  k.box(C.paper, 0, -1.25, 1.02, 2.54, 6.2, 0.22, 0.05);
  for (let i = 0; i < 5; i += 1) {
    const y = 1.2 - i * 1.18;
    for (const side of [-1, 1]) k.box("#b52020", side * 1.255, y - 0.55, 1.35, 0.03, 1.02, 1.42, 0.02);
  }
  k.box(C.chrome, 0, -4.48, 0.65, 2.4, 0.2, 0.18, 0.04);
  tailLights(k, -4.46, 1.1, 1.05);
  for (const side of [-1, 1]) k.box(C.chrome, side * 0.48, -1.2, 3.02, 0.1, 7.7, 0.14, 0.03);
  for (let i = 0; i < 16; i += 1) k.box(C.chrome, 0, 2.5 - i * 0.48, 3.04, 0.92, 0.06, 0.08, 0.01);
  k.box(C.dark, 0, -1.2, 2.96, 1.2, 0.5, 0.08, 0.02);
  k.cyl(C.chrome, 0, -4.0, 3.2, 0.28, 0.4, "z", 14);
  const bar = lightbar(k, 3.4, 2.92, 1.9);
  for (const side of [-1, 1]) {
    k.wheel(side * 1.08, 3.05, 0.56);
    k.wheel(side * 1.08, -2.15, 0.56);
    k.wheel(side * 1.08, -3.25, 0.56);
  }
  return withFlasher(finish(k, 2.55, 9.0, 3.25, -0.1), bar, 210);
}

function modelExcavator(accent: string): VehicleRig {
  const k = new Kit();
  for (const side of [-1, 1]) {
    k.box(C.ink, side * 1.15, 0, 0, 0.78, 4.3, 0.86, 0.38);
    k.box(C.dark, side * 1.15, 0, 0.18, 0.82, 3.3, 0.5, 0.12);
    for (let i = 0; i < 4; i += 1) k.cyl(C.steel, side * 1.58, -1.2 + i * 0.8, 0.42, 0.16, 0.05, "x", 12);
  }
  k.box(C.dark, 0, 0, 0.45, 1.6, 2.2, 0.5, 0.15);
  k.cyl(C.ink, 0, 0, 1.0, 0.85, 0.2, "z", 20);
  const house = new Kit();
  house.box(accent, 0, -0.35, 0, 2.6, 3.2, 1.0, 0.3);
  house.box(C.catDark, 0, -1.85, 0.1, 2.5, 0.75, 1.15, 0.36);
  house.box(accent, 0.45, -0.75, 1.0, 1.5, 1.6, 0.42, 0.2);
  for (let i = 0; i < 4; i += 1) house.box(C.ink, 0.45, -0.25 - i * 0.32, 1.42, 1.2, 0.08, 0.02, 0.01);
  house.cyl(C.ink, 0.95, -1.3, 1.7, 0.08, 0.6, "z", 10);
  house.box(accent, -0.68, 0.5, 1.0, 1.05, 1.35, 1.65, 0.18);
  house.box(C.glass, -0.68, 0.52, 1.25, 1.08, 1.2, 1.15, 0.1);
  house.box(C.glassHi, -0.68, 1.17, 1.3, 0.9, 0.06, 1.05, 0.04);
  house.box(accent, -0.68, 0.5, 2.62, 1.12, 1.4, 0.1, 0.04);
  house.person(-0.68, 0.45, 1.05, C.vest, C.paper, true);
  const houseGroup = house.build();
  const turret = new THREE.Group();
  turret.position.set(0, 0, 1.08);
  turret.add(houseGroup);
  const boom = new Kit();
  boom.box(accent, 0, 1.75, -0.28, 0.48, 3.7, 0.56, 0.14);
  boom.cyl(C.chrome, 0.32, 1.2, 0.0, 0.08, 1.6, "y", 10);
  boom.cyl(C.catDark, 0.32, 0.6, 0.0, 0.13, 1.1, "y", 10);
  const boomGroup = boom.build();
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.32, 0.95, 0.7);
  boomPivot.add(boomGroup);
  turret.add(boomPivot);
  const stick = new Kit();
  stick.box(accent, 0, 1.25, -0.22, 0.4, 2.6, 0.44, 0.12);
  stick.cyl(C.chrome, 0, 0.8, 0.32, 0.07, 1.3, "y", 10);
  const stickGroup = stick.build();
  const stickPivot = new THREE.Group();
  stickPivot.position.set(0, 3.5, 0);
  stickPivot.add(stickGroup);
  boomPivot.add(stickPivot);
  const bucket = new Kit();
  bucket.box(C.dark, 0, 0.35, -0.45, 0.95, 0.75, 0.75, 0.25);
  for (let i = -1; i <= 1; i += 1) bucket.box(C.steel, i * 0.3, 0.75, -0.55, 0.12, 0.25, 0.12, 0.03);
  const bucketGroup = bucket.build();
  const bucketPivot = new THREE.Group();
  bucketPivot.position.set(0, 2.5, 0);
  bucketPivot.add(bucketGroup);
  stickPivot.add(bucketPivot);
  const rig = finish(k, 3.2, 4.4, 3.3, 0, 7.6);
  rig.root.add(turret);
  rig.animate = (time) => {
    const t = time / 1000;
    turret.rotation.z = Math.sin(t * 0.35) * 0.55;
    boomPivot.rotation.x = 0.72 + Math.sin(t * 0.9) * 0.16;
    stickPivot.rotation.x = -1.95 + Math.sin(t * 0.9 + 1.1) * 0.3;
    bucketPivot.rotation.x = -0.7 + Math.sin(t * 0.9 + 2) * 0.45;
  };
  return rig;
}

function modelLoader(accent: string): VehicleRig {
  const k = new Kit();
  k.box(accent, 0, -1.4, 0.85, 2.2, 2.4, 1.35, 0.4);
  k.box(C.catDark, 0, -2.55, 0.75, 2.25, 0.4, 1.1, 0.16);
  for (let i = 0; i < 4; i += 1) k.box(C.ink, 0, -1.0 - i * 0.3, 2.2, 1.7, 0.08, 0.02, 0.01);
  k.cyl(C.ink, 0.6, -1.9, 2.45, 0.09, 0.7, "z", 10);
  k.box(C.dark, 0, 0.3, 0.7, 1.5, 3.4, 0.55, 0.12);
  k.box(accent, 0, 0.0, 1.15, 1.75, 1.6, 0.5, 0.15);
  k.box(accent, 0, 0.0, 1.6, 1.55, 1.45, 1.6, 0.18);
  k.box(C.glass, 0, 0.02, 1.85, 1.58, 1.3, 1.1, 0.1);
  k.box(C.glassHi, 0, 0.7, 1.9, 1.35, 0.06, 1.0, 0.04);
  k.box(accent, 0, 0.0, 3.18, 1.75, 1.6, 0.12, 0.05);
  k.person(0, -0.1, 1.62, C.vest, C.paper, true);
  for (const side of [-1, 1]) {
    k.wheel(side * 1.12, -1.45, 0.82, 0.62);
    k.wheel(side * 1.12, 1.45, 0.82, 0.62);
    k.box(accent, side * 1.12, 1.45, 1.55, 0.7, 1.4, 0.12, 0.05);
    k.box(accent, side * 1.12, -1.45, 1.6, 0.7, 1.4, 0.12, 0.05);
  }
  const arm = new Kit();
  for (const side of [-1, 1]) arm.box(accent, side * 0.65, 1.3, -0.2, 0.26, 2.7, 0.4, 0.1);
  arm.box(accent, 0, 1.6, -0.15, 1.3, 0.3, 0.3, 0.08);
  arm.cyl(C.chrome, 0, 0.8, 0.35, 0.08, 1.4, "y", 10);
  const armGroup = arm.build();
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 1.2, 1.55);
  armPivot.add(armGroup);
  const scoop = new Kit();
  scoop.box(C.catDark, 0, 0.3, -0.5, 2.8, 0.9, 0.95, 0.22);
  scoop.box(accent, 0, 0.0, -0.5, 2.8, 0.14, 1.0, 0.05);
  scoop.box(C.steel, 0, 0.78, -0.58, 2.7, 0.12, 0.1, 0.03);
  const scoopGroup = scoop.build();
  const scoopPivot = new THREE.Group();
  scoopPivot.position.set(0, 2.7, 0);
  scoopPivot.add(scoopGroup);
  armPivot.add(scoopPivot);
  const rig = finish(k, 2.9, 6.0, 3.3, 0.7);
  rig.root.add(armPivot);
  rig.animate = (time) => {
    const t = time / 1000;
    const lift = (Math.sin(t * 0.8) + 1) / 2;
    armPivot.rotation.x = -0.45 + lift * 0.75;
    scoopPivot.rotation.x = 0.35 - lift * 0.65;
  };
  return rig;
}

function modelFork(accent: string): VehicleRig {
  const k = new Kit();
  k.box(accent, 0, -0.05, 0.28, 1.36, 2.1, 0.78, 0.22);
  k.box(C.blue, 0, -1.05, 0.25, 1.42, 0.78, 1.12, 0.3);
  k.box(C.blue, 0, 0.1, 0.25, 1.4, 1.6, 0.3, 0.1);
  k.box(C.ink, 0, -0.35, 1.05, 0.62, 0.58, 0.18, 0.06);
  k.box(C.ink, 0, -0.62, 1.05, 0.6, 0.16, 0.7, 0.06);
  k.person(0, -0.3, 1.05, C.vest, C.yellow, true);
  k.box(C.ink, 0, 0.65, 1.05, 0.28, 0.12, 0.42, 0.04, 0.5);
  for (const sx of [-1, 1]) {
    for (const py of [-0.72, 0.68]) k.box(C.ink, sx * 0.6, py, 1.0, 0.09, 0.09, 1.45, 0.03);
    k.box(C.ink, sx * 0.6, -0.02, 2.4, 0.1, 1.55, 0.1, 0.03);
  }
  for (let i = 0; i < 4; i += 1) k.box(C.ink, 0, -0.66 + i * 0.44, 2.42, 1.3, 0.07, 0.06, 0.02);
  for (const sx of [-1, 1]) k.box(C.steel, sx * 0.42, 1.18, 0.12, 0.14, 0.16, 2.75, 0.03);
  k.box(C.steel, 0, 1.18, 2.72, 0.98, 0.16, 0.12, 0.03);
  k.cyl(C.chrome, 0, 1.12, 1.4, 0.07, 2.4, "z", 10);
  for (const side of [-1, 1]) {
    k.wheel(side * 0.62, 0.62, 0.36, 0.3);
    k.wheel(side * 0.62, -0.88, 0.3, 0.26);
  }
  const carriage = new Kit();
  carriage.box(C.ink, 0, 1.32, 0, 1.05, 0.1, 0.62, 0.03);
  for (const sx of [-1, 1]) carriage.box(C.steel, sx * 0.3, 1.95, 0, 0.14, 1.25, 0.07, 0.02);
  carriage.pallet(0, 2.0, 0.07, 2, 2, 2, 0.54);
  const carriageGroup = carriage.build();
  const lift = new THREE.Group();
  lift.position.set(0, 0, 0.12);
  lift.add(carriageGroup);
  const rig = finish(k, 1.6, 4.2, 2.6, 0.55, 3.6);
  rig.root.add(lift);
  rig.animate = (time) => {
    const t = time / 1000;
    lift.position.z = 0.15 + ((Math.sin(t * 0.7) + 1) / 2) * 0.75;
  };
  return rig;
}

let shadowTexture: THREE.Texture | null = null;

function blobTexture(): THREE.Texture {
  if (shadowTexture) return shadowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.filter = "blur(9px)";
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(14, 14, 36, 100, 14);
    ctx.fill();
  }
  shadowTexture = new THREE.CanvasTexture(canvas);
  return shadowTexture;
}

const shadowMaterial = () =>
  new THREE.MeshBasicMaterial({ color: "#05080e", alphaMap: blobTexture(), transparent: true, opacity: 0.5, depthWrite: false });
let sharedShadow: THREE.MeshBasicMaterial | null = null;

function finish(k: Kit, width: number, length: number, height: number, centerY = 0, shadowLength = length): VehicleRig {
  const root = new THREE.Group();
  sharedShadow ??= shadowMaterial();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.55, shadowLength * 1.18), sharedShadow);
  shadow.position.set(0.25, centerY - 0.2, 0.02);
  shadow.renderOrder = -1;
  root.add(shadow);
  root.add(k.build());
  return { root, width, length, height, centerY, animate: () => {} };
}

export function buildVehicle(kind: Kind, accent: string): VehicleRig {
  switch (kind) {
    case "truck":
      return modelTruck(accent);
    case "semi":
      return modelSemi(accent);
    case "bus":
      return modelBus(accent);
    case "sedan":
      return modelSedan(accent);
    case "taxi":
      return modelTaxi(accent);
    case "police":
      return modelPolice(accent);
    case "ambulance":
      return modelAmbulance();
    case "crew":
      return modelCrew(accent);
    case "dump":
      return modelDump(accent);
    case "tanker":
      return modelTanker(accent);
    case "fire":
      return modelFire(accent);
    case "excavator":
      return modelExcavator(accent);
    case "loader":
      return modelLoader(accent);
    case "fork":
      return modelFork(accent);
  }
}

export const DEFAULT_ACCENT: Record<Kind, string> = {
  truck: C.orange,
  semi: "#c23b2e",
  bus: "#f0c230",
  sedan: "#1fb5a8",
  taxi: "#f2c230",
  police: C.navy,
  ambulance: C.paper,
  crew: C.blue,
  dump: "#e9792a",
  tanker: "#dfe5ec",
  fire: "#d12626",
  excavator: C.cat,
  loader: C.cat,
  fork: C.cat,
};

/** Luz de estudio compartida: cielo suave + sol desde arriba a la izquierda de la pantalla. */
export function studioLights(scene: THREE.Scene) {
  const hemi = new THREE.HemisphereLight("#ffffff", "#6f7c94", 2.1);
  hemi.position.set(0, 0, 1);
  const sun = new THREE.DirectionalLight("#fff4e4", 2.3);
  scene.add(hemi, sun, sun.target);
  return {
    /** Orienta el sol para que venga de arriba-izquierda de la pantalla con el giro del mapa. */
    aim(bearingDeg: number, origin: THREE.Vector3 = new THREE.Vector3()) {
      const b = (bearingDeg * Math.PI) / 180;
      const up = new THREE.Vector2(Math.sin(b), Math.cos(b));
      const left = new THREE.Vector2(-Math.cos(b), Math.sin(b));
      const dir = new THREE.Vector3(left.x * 0.75 + up.x * 0.35, left.y * 0.75 + up.y * 0.35, 1.25).normalize();
      sun.position.copy(origin).addScaledVector(dir, 100);
      sun.target.position.copy(origin);
      sun.target.updateMatrixWorld();
    },
  };
}

let iconRenderer: THREE.WebGLRenderer | null = null;

/**
 * Dibuja una unidad como ícono isométrico (PNG en data URL) para listas, popups o marcadores 2D del GPS.
 * `heading` en grados (0 = norte, sentido horario). `pitch` es la inclinación de la cámara.
 */
export function renderVehicleIcon(
  kind: Kind,
  options: { size?: number; heading?: number; pitch?: number; accent?: string } = {},
): string {
  const { size = 128, heading = 45, pitch = 55, accent = DEFAULT_ACCENT[kind] } = options;
  if (!iconRenderer) {
    iconRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    iconRenderer.setClearColor(0x000000, 0);
  }
  iconRenderer.setPixelRatio(1);
  iconRenderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  const rig = buildVehicle(kind, accent);
  rig.animate(5200, true);
  rig.root.rotation.z = (-heading * Math.PI) / 180;
  scene.add(rig.root);
  studioLights(scene).aim(0);
  rig.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(rig.root);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const far = sphere.radius * 4;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, far * 2);
  const p = (pitch * Math.PI) / 180;
  camera.up.set(0, 0, 1);
  camera.position.copy(sphere.center).add(new THREE.Vector3(0, -Math.sin(p), Math.cos(p)).multiplyScalar(far));
  camera.lookAt(sphere.center);
  camera.updateMatrixWorld(true);
  let reach = 0.1;
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i += 1) {
    corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z);
    corner.applyMatrix4(camera.matrixWorldInverse);
    reach = Math.max(reach, Math.abs(corner.x), Math.abs(corner.y));
  }
  reach *= 1.04;
  camera.left = -reach;
  camera.right = reach;
  camera.top = reach;
  camera.bottom = -reach;
  camera.updateProjectionMatrix();
  iconRenderer.render(scene, camera);
  const url = iconRenderer.domElement.toDataURL("image/png");
  disposeRig(rig);
  return url;
}

export function disposeRig(rig: VehicleRig) {
  rig.root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      const material = node.material as THREE.Material;
      if (![...materials.values()].includes(material) && material !== sharedShadow) material.dispose();
    }
  });
}
