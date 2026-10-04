import type { Map as MlMap } from "maplibre-gl";

type LngLat = { lng: number; lat: number };
type Road = { pts: LngLat[]; cum: number[]; total: number; minor: boolean };
type Kind =
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

const FLEET: { id: string; kind: Kind; speed: number; accent: string; back: boolean }[] = [
  { id: "TRK-2372", kind: "truck", speed: 8, accent: "#2f6fe0", back: false },
  { id: "AMB-03", kind: "ambulance", speed: 11, accent: "#f4f7fb", back: false },
  { id: "PNC-118", kind: "police", speed: 12, accent: "#1d4e9c", back: true },
  { id: "PER-22", kind: "crew", speed: 7, accent: "#3d7ee8", back: false },
  { id: "BUS-04", kind: "bus", speed: 6.5, accent: "#f0c230", back: true },
  { id: "SED-19", kind: "sedan", speed: 13, accent: "#2a3344", back: false },
  { id: "TAX-07", kind: "taxi", speed: 11, accent: "#f0c230", back: false },
  { id: "RAS-01", kind: "semi", speed: 7.5, accent: "#c23b2e", back: true },
  { id: "VOL-12", kind: "dump", speed: 6, accent: "#e07a2f", back: false },
  { id: "CIS-05", kind: "tanker", speed: 6.5, accent: "#d7dee8", back: true },
  { id: "BOM-01", kind: "fire", speed: 10, accent: "#d12626", back: false },
  { id: "CAT-320", kind: "excavator", speed: 2.4, accent: "#f0b429", back: false },
  { id: "CAT-950", kind: "loader", speed: 3.2, accent: "#f0b429", back: true },
  { id: "FL-07", kind: "fork", speed: 2.2, accent: "#f0b429", back: false },
  { id: "FL-08", kind: "fork", speed: 1.8, accent: "#f0b429", back: true },
];

type FleetMarker = {
  setLngLat(at: [number, number]): FleetMarker;
  addTo(map: MlMap): FleetMarker;
  remove(): void;
};

export function startFleet(map: MlMap, createMarker: (element: HTMLElement) => FleetMarker): (() => void) | null {
  const roads = collectRoads(map);
  if (roads.length === 0) return null;
  const majors = roads.filter((road) => !road.minor);
  const minors = roads.filter((road) => road.minor);
  const pool = majors.length > 0 ? majors : roads;
  const movers = FLEET.map((vehicle, index) => {
    const yard = vehicle.kind === "fork" || vehicle.kind === "excavator" || vehicle.kind === "loader";
    const yardPool = minors.length > 0 ? minors : pool;
    const road = yard ? yardPool[index % yardPool.length] : pool[index % pool.length];
    const element = document.createElement("div");
    element.className = "fleet-unit";
    const tag = document.createElement("div");
    tag.className = "fleet-tag";
    tag.textContent = vehicle.kind === "truck" ? `${vehicle.id}  En route` : vehicle.id;
    const body = document.createElement("canvas");
    body.className = "fleet-body";
    body.width = 200;
    body.height = 260;
    const ctx = body.getContext("2d");
    if (ctx) paintVehicle(ctx, vehicle.kind, vehicle.accent, 0.4, map.getPitch());
    element.append(tag, body);
    const marker = createMarker(element).setLngLat([road.pts[0].lng, road.pts[0].lat]).addTo(map);
    return { vehicle, road, along: ((index * 0.17) * road.total) % road.total, body, marker };
  });

  let frame = 0;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    for (const mover of movers) {
      mover.along = (mover.along + mover.vehicle.speed * dt) % mover.road.total;
      const at = place(mover.road, mover.along, mover.vehicle.back);
      mover.marker.setLngLat([at.lng, at.lat]);
      const ctx = mover.body.getContext("2d");
      if (ctx) {
        const yaw = ((at.bearing - map.getBearing()) * Math.PI) / 180;
        paintVehicle(ctx, mover.vehicle.kind, mover.vehicle.accent, yaw, map.getPitch(), now);
      }
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    for (const mover of movers) mover.marker.remove();
  };
}

function collectRoads(map: MlMap): Road[] {
  const bounds = map.getBounds();
  let features: ReturnType<MlMap["querySourceFeatures"]> = [];
  try {
    features = map.querySourceFeatures("openmaptiles", {
      sourceLayer: "transportation",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
    });
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const roads: Road[] = [];
  for (const feature of features) {
    const klass = String(feature.properties?.class ?? "");
    const minor = klass === "service" || klass === "minor";
    const parts = lineParts(feature.geometry as { type: string; coordinates: number[][] | number[][][] });
    for (const part of parts) {
      const inside = part.filter((point) => bounds.contains([point.lng, point.lat]));
      if (inside.length < 2) continue;
      const key = `${inside[0].lng.toFixed(4)},${inside[0].lat.toFixed(4)}:${inside[inside.length - 1].lng.toFixed(4)},${inside[inside.length - 1].lat.toFixed(4)}`;
      if (seen.has(key)) continue;
      const road = measure(inside, minor);
      if (road.total < 80) continue;
      seen.add(key);
      roads.push(road);
    }
  }
  roads.sort((a, b) => b.total - a.total);
  return roads.slice(0, 12);
}

function lineParts(geometry: { type: string; coordinates: number[][] | number[][][] }): LngLat[][] {
  if (geometry.type === "LineString") return [asPoints(geometry.coordinates as number[][])];
  if (geometry.type === "MultiLineString") return (geometry.coordinates as number[][][]).map(asPoints);
  return [];
}

function asPoints(coordinates: number[][]): LngLat[] {
  return coordinates.map(([lng, lat]) => ({ lng, lat }));
}

function measure(pts: LngLat[], minor: boolean): Road {
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1] + meters(pts[i - 1], pts[i]));
  return { pts, cum, total: cum[cum.length - 1] || 1, minor };
}

function place(road: Road, along: number, back: boolean): LngLat & { bearing: number } {
  const dist = back ? road.total - along : along;
  let index = 1;
  while (index < road.cum.length - 1 && road.cum[index] < dist) index += 1;
  const start = road.cum[index - 1];
  const end = road.cum[index];
  const span = Math.max(1, end - start);
  const t = (dist - start) / span;
  const a = road.pts[index - 1];
  const b = road.pts[index];
  const forward = bearing(a, b);
  return {
    lng: a.lng + (b.lng - a.lng) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    bearing: back ? (forward + 180) % 360 : forward,
  };
}

function meters(a: LngLat, b: LngLat): number {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a: LngLat, b: LngLat): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

type Vec = [number, number, number];
type Face = { pts: Vec[]; color: string; depth: number; layer: number; cull?: boolean };

let glow = 0;

function paintVehicle(ctx: CanvasRenderingContext2D, kind: Kind, accent: string, yaw: number, pitch: number, time = 0) {
  glow = Math.floor(time / 170) % 2;
  ctx.clearRect(0, 0, 200, 260);
  const faces: Face[] = [];
  switch (kind) {
    case "fork":
      modelFork(faces, accent);
      break;
    case "ambulance":
      modelAmbulance(faces, accent);
      break;
    case "police":
      modelPolice(faces, accent);
      break;
    case "crew":
      modelCrew(faces, accent);
      break;
    case "bus":
      modelBus(faces, accent);
      break;
    case "sedan":
      modelSedan(faces, accent, false);
      break;
    case "taxi":
      modelSedan(faces, accent, true);
      break;
    case "semi":
      modelSemi(faces, accent);
      break;
    case "dump":
      modelDump(faces, accent);
      break;
    case "tanker":
      modelTanker(faces, accent);
      break;
    case "fire":
      modelFire(faces, accent);
      break;
    case "excavator":
      modelExcavator(faces, accent);
      break;
    case "loader":
      modelLoader(faces, accent);
      break;
    default:
      modelTruck(faces, accent);
  }
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const p = (pitch * Math.PI) / 180;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const scale = 30;
  const project = (v: Vec) => {
    const x1 = v[0] * c + v[1] * s;
    const y1 = -v[0] * s + v[1] * c;
    return { x: 100 + x1 * scale, y: 168 - (y1 * cp + v[2] * sp) * scale, depth: y1 * sp - v[2] * cp };
  };
  const toCam = (v: Vec): Vec => [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]];
  const facing = (pts: Vec[]) => {
    const a = toCam(pts[0]);
    const b = toCam(pts[1]);
    const d = toCam(pts[2]);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    return ny * sp - nz * cp < 0;
  };
  const drawn = faces
    .filter((face) => face.layer < 0 || face.cull === false || facing(face.pts))
    .map((face, order) => {
      const pts = face.pts.map(project);
      const depth = pts.reduce((sum, pt) => sum + pt.depth, 0) / pts.length;
      return { pts, color: face.color, depth, layer: face.layer, order };
    })
    .sort((a, b) => a.layer - b.layer || b.depth - a.depth || a.order - b.order);
  for (const face of drawn) {
    ctx.beginPath();
    ctx.moveTo(face.pts[0].x, face.pts[0].y);
    for (let i = 1; i < face.pts.length; i += 1) ctx.lineTo(face.pts[i].x, face.pts[i].y);
    ctx.closePath();
    ctx.fillStyle = face.color;
    ctx.fill();
    if (face.layer < 0) continue;
    ctx.strokeStyle = "rgba(20, 32, 48, 0.14)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function modelTruck(faces: Face[], _accent: string) {
  addShadow(faces, 1.35, -3.3, 2.35);
  addHull(faces, -1.22, -3.25, 0.82, 1.22, 0.02, 2.42, "#e8eef5", "#ffffff", "#f7f9fc");
  addBox(faces, -1.3, -2.95, 0.95, -1.2, -0.1, 1.38, "#f08a1a", "#ffb15a", "#f08a1a");
  addBox(faces, 1.2, -2.95, 0.95, 1.3, -0.1, 1.38, "#f08a1a", "#ffb15a", "#f08a1a");
  for (let i = 0; i < 4; i += 1) {
    const y = -2.55 + i * 0.58;
    addBox(faces, -1.26, y, 1.45, -1.2, y + 0.05, 2.28, "#d5dee8", "#d5dee8", "#d5dee8");
    addBox(faces, 1.2, y, 1.45, 1.26, y + 0.05, 2.28, "#d5dee8", "#d5dee8", "#d5dee8");
  }
  addHull(faces, -0.98, 0.12, 0.48, 0.98, 2.05, 1.82, "#f4f7fb", "#ffffff", "#e7eef6");
  addFace(faces, [
    [-0.72, 1.55, 0.95],
    [0.72, 1.55, 0.95],
    [0.58, 0.72, 1.72],
    [-0.58, 0.72, 1.72],
  ], "#243044");
  addBox(faces, -0.9, 1.9, 0.32, 0.9, 2.2, 0.55, "#2a3344", "#2a3344", "#2a3344");
  addBox(faces, -0.62, 1.95, 0.5, -0.22, 2.16, 0.72, "#fff4c2", "#fff4c2", "#fff4c2");
  addBox(faces, 0.22, 1.95, 0.5, 0.62, 2.16, 0.72, "#fff4c2", "#fff4c2", "#fff4c2");
  addBox(faces, -1.15, 0.85, 0.85, -0.95, 1.15, 1.05, "#1c2430", "#1c2430", "#1c2430");
  addBox(faces, 0.95, 0.85, 0.85, 1.15, 1.15, 1.05, "#1c2430", "#1c2430", "#1c2430");
  addWheel(faces, -1.05, 1.25, 0.42, "#8eb4e8");
  addWheel(faces, 1.05, 1.25, 0.42, "#8eb4e8");
  addWheel(faces, -1.18, -1.05, 0.48, "#8eb4e8");
  addWheel(faces, 1.18, -1.05, 0.48, "#8eb4e8");
  addWheel(faces, -1.18, -2.15, 0.48, "#8eb4e8");
  addWheel(faces, 1.18, -2.15, 0.48, "#8eb4e8");
}

function modelAmbulance(faces: Face[], accent: string) {
  addHull(faces, -1.08, -2.3, 0.55, 1.08, 2.05, 2.18, "#f4f7fb", "#ffffff", accent);
  sidePanel(faces, -1.14, -1.8, 0.2, 1.05, 1.32, "#e23b3b");
  sidePanel(faces, 1.14, -1.8, 0.2, 1.05, 1.32, "#e23b3b");
  addBox(faces, -0.16, -0.55, 2.2, 0.16, 0.45, 2.42, "#e23b3b", "#ff4d4d", "#e23b3b");
  addBox(faces, -0.5, -0.12, 2.2, 0.5, 0.12, 2.42, "#e23b3b", "#ff4d4d", "#e23b3b");
  glass(faces, 1.95, 1.25, 1.95);
  const red = glow ? "#ff2a2a" : "#7a1414";
  const blue = glow ? "#3d7eff" : "#14357a";
  addBox(faces, -0.42, 0.45, 2.2, -0.08, 0.9, 2.48, red, red, red);
  addBox(faces, 0.08, 0.45, 2.2, 0.42, 0.9, 2.48, blue, blue, blue);
  addWheel(faces, -1.05, 1.2, 0.42);
  addWheel(faces, 1.05, 1.2, 0.42);
  addWheel(faces, -1.05, -1.45, 0.42);
  addWheel(faces, 1.05, -1.45, 0.42);
}

function modelPolice(faces: Face[], accent: string) {
  modelSedan(faces, "#f7f9fc", false);
  sidePanel(faces, -1.0, -1.6, 0.2, 0.45, 0.62, accent);
  sidePanel(faces, 1.0, -1.6, 0.2, 0.45, 0.62, accent);
  addBox(faces, -0.82, -0.42, 1.5, 0.82, 0.52, 1.76, "#14181e", "#1c222a", "#14181e");
  const red = glow ? "#ff2a2a" : "#7a1414";
  const blue = glow ? "#3d7eff" : "#14357a";
  addBox(faces, -0.72, -0.3, 1.76, -0.06, 0.4, 2.22, red, red, red);
  addBox(faces, 0.06, -0.3, 1.76, 0.72, 0.4, 2.22, blue, blue, blue);
}

function modelCrew(faces: Face[], accent: string) {
  addHull(faces, -1.05, 0.3, 0.5, 1.05, 2.1, 1.78, accent, "#163a86", accent);
  glass(faces, 1.9, 1.05, 1.65, -0.65, 0.65);
  addHull(faces, -1.12, -2.7, 0.5, 1.12, 0.2, 0.98, "#d5dee8", "#eef2f6", "#e7edf4");
  addBox(faces, -1.12, -2.7, 1.52, 1.12, -2.55, 1.66, "#c5ced8", "#e8eef4", "#d5dde6");
  addBox(faces, -1.12, 0.08, 1.52, 1.12, 0.22, 1.66, "#c5ced8", "#e8eef4", "#d5dde6");
  addBox(faces, -1.12, -2.7, 1.52, -0.98, 0.22, 1.66, "#c5ced8", "#e8eef4", "#d5dde6");
  addBox(faces, 0.98, -2.7, 1.52, 1.12, 0.22, 1.66, "#c5ced8", "#e8eef4", "#d5dde6");
  addPerson(faces, -0.45, -0.4, "#2f6fe0");
  addPerson(faces, 0.15, -0.9, "#e07a2f");
  addPerson(faces, -0.2, -1.7, "#14a36a");
  addPerson(faces, 0.45, -2.15, "#d12626");
  addWheel(faces, -1.05, 1.35, 0.42);
  addWheel(faces, 1.05, 1.35, 0.42);
  addWheel(faces, -1.12, -1.9, 0.46);
  addWheel(faces, 1.12, -1.9, 0.46);
}

function modelBus(faces: Face[], accent: string) {
  addShadow(faces, 1.3, -3.7, 2.2);
  addHull(faces, -1.12, -3.65, 0.58, 1.12, 2.05, 2.28, "#e2b02a", accent, "#ffe7a3");
  addFace(faces, [
    [-0.72, 2.1, 1.05],
    [-0.72, 2.1, 2.02],
    [0.72, 2.1, 2.02],
    [0.72, 2.1, 1.05],
  ], "#d7ecff");
  for (let i = 0; i < 4; i += 1) {
    const y0 = -2.85 + i * 0.82;
    const y1 = y0 + 0.52;
    addFace(faces, [
      [1.16, y1, 1.22],
      [1.16, y1, 1.95],
      [1.16, y0, 1.95],
      [1.16, y0, 1.22],
    ], "#1b2430");
    addFace(faces, [
      [-1.16, y0, 1.22],
      [-1.16, y0, 1.95],
      [-1.16, y1, 1.95],
      [-1.16, y1, 1.22],
    ], "#1b2430");
  }
  addWheel(faces, -1.12, 1.2, 0.5, "#c5ced8");
  addWheel(faces, 1.12, 1.2, 0.5, "#c5ced8");
  addWheel(faces, -1.12, -2.35, 0.5, "#c5ced8");
  addWheel(faces, 1.12, -2.35, 0.5, "#c5ced8");
}

function modelSedan(faces: Face[], accent: string, taxi: boolean) {
  addHull(faces, -0.95, -2.15, 0.32, 0.95, 2.15, 0.95, accent, accent, accent);
  addHull(faces, -0.82, -0.95, 0.85, 0.82, 0.85, 1.48, accent, accent, accent);
  addFace(faces, [
    [-0.74, 0.88, 0.9],
    [0.74, 0.88, 0.9],
    [0.64, 0.12, 1.48],
    [-0.64, 0.12, 1.48],
  ], "#b9dcff");
  addFace(faces, [
    [-0.68, -0.95, 1.4],
    [0.68, -0.95, 1.4],
    [0.6, -0.45, 0.95],
    [-0.6, -0.45, 0.95],
  ], "#8fb8de");
  addBox(faces, -0.92, 2.0, 0.28, 0.92, 2.32, 0.52, "#1c2430", "#1c2430", "#1c2430");
  addBox(faces, -0.55, 2.05, 0.48, -0.12, 2.28, 0.68, "#fff4c2", "#fff4c2", "#fff4c2");
  addBox(faces, 0.12, 2.05, 0.48, 0.55, 2.28, 0.68, "#fff4c2", "#fff4c2", "#fff4c2");
  addBox(faces, -1.18, 0.35, 0.78, -0.92, 0.72, 1.02, "#1c2430", "#1c2430", "#1c2430");
  addBox(faces, 0.92, 0.35, 0.78, 1.18, 0.72, 1.02, "#1c2430", "#1c2430", "#1c2430");
  if (taxi) addBox(faces, -0.28, -0.2, 1.5, 0.28, 0.28, 1.92, "#1c2430", "#f7f9fc", "#1c2430");
  addWheel(faces, -0.95, 1.35, 0.38);
  addWheel(faces, 0.95, 1.35, 0.38);
  addWheel(faces, -0.95, -1.4, 0.38);
  addWheel(faces, 0.95, -1.4, 0.38);
}

function modelSemi(faces: Face[], accent: string) {
  addHull(faces, -1.05, 0.5, 0.55, 1.05, 2.4, 2.1, accent, "#163a86", accent);
  glass(faces, 2.15, 1.2, 1.9, -0.65, 0.65);
  addHull(faces, -1.2, -5.1, 0.85, 1.2, -0.2, 2.55, "#e7edf4", "#ffffff", "#d5dee8");
  addWheel(faces, -1.05, 1.15, 0.48);
  addWheel(faces, 1.05, 1.15, 0.48);
  addWheel(faces, -1.15, -1.3, 0.46);
  addWheel(faces, 1.15, -1.3, 0.46);
  addWheel(faces, -1.15, -3.5, 0.46);
  addWheel(faces, 1.15, -3.5, 0.46);
  addWheel(faces, -1.15, -4.35, 0.46);
  addWheel(faces, 1.15, -4.35, 0.46);
}

function modelDump(faces: Face[], accent: string) {
  addHull(faces, -1.05, 0.25, 0.55, 1.05, 2.15, 1.85, "#2a3344", "#1c2430", "#2a3344");
  glass(faces, 1.95, 1.1, 1.7, -0.6, 0.6);
  addHull(faces, -1.18, -3.05, 0.9, 1.18, 0.1, 2.1, "#e0a020", accent, "#ffd27a");
  addBox(faces, -1.2, -3.05, 1.85, 1.2, -2.75, 2.4, accent, accent, accent);
  addWheel(faces, -1.1, 1.25, 0.5);
  addWheel(faces, 1.1, 1.25, 0.5);
  addWheel(faces, -1.15, -1.7, 0.52);
  addWheel(faces, 1.15, -1.7, 0.52);
}

function modelTanker(faces: Face[], accent: string) {
  addHull(faces, -1.05, 0.35, 0.55, 1.05, 2.2, 1.85, "#2a3344", "#1c2430", "#2a3344");
  glass(faces, 2.0, 1.1, 1.7, -0.6, 0.6);
  addTank(faces, -3.35, 0.2, 0.85, 1.55, accent);
  addWheel(faces, -1.05, 1.3, 0.46);
  addWheel(faces, 1.05, 1.3, 0.46);
  addWheel(faces, -1.1, -1.15, 0.46);
  addWheel(faces, 1.1, -1.15, 0.46);
  addWheel(faces, -1.1, -2.55, 0.46);
  addWheel(faces, 1.1, -2.55, 0.46);
}

function modelFire(faces: Face[], accent: string) {
  addHull(faces, -1.15, -3.4, 0.55, 1.15, 2.15, 2.1, "#8d1c1c", accent, "#ff5a4d");
  glass(faces, 1.9, 1.25, 1.9, -0.75, 0.75);
  sidePanel(faces, -1.2, -2.5, 0.5, 1.15, 1.35, "#f7f9fc");
  sidePanel(faces, 1.2, -2.5, 0.5, 1.15, 1.35, "#f7f9fc");
  addBox(faces, -0.28, -2.8, 2.12, -0.08, 1.3, 2.28, "#e8eef4", "#ffffff", "#d5dde6");
  addBox(faces, 0.08, -2.8, 2.12, 0.28, 1.3, 2.28, "#e8eef4", "#ffffff", "#d5dde6");
  addBox(faces, -0.3, 1.5, 2.12, 0.3, 1.85, 2.35, "#ff4d4d", "#ff4d4d", "#ff4d4d");
  addWheel(faces, -1.12, 1.35, 0.48);
  addWheel(faces, 1.12, 1.35, 0.48);
  addWheel(faces, -1.12, -1.5, 0.48);
  addWheel(faces, 1.12, -1.5, 0.48);
  addWheel(faces, -1.12, -2.7, 0.48);
  addWheel(faces, 1.12, -2.7, 0.48);
}

function modelExcavator(faces: Face[], accent: string) {
  addBox(faces, -1.15, -1.35, 0.15, -0.55, 1.35, 0.55, "#1c2430", "#2a313a", "#10141a");
  addBox(faces, 0.55, -1.35, 0.15, 1.15, 1.35, 0.55, "#1c2430", "#2a313a", "#10141a");
  addHull(faces, -0.85, -0.85, 0.55, 0.85, 0.7, 1.25, "#c48a12", accent, "#ffe08a");
  addBox(faces, -0.55, -0.35, 1.2, 0.45, 0.55, 2.05, "#d7ecff", "#eef6ff", "#d7ecff");
  addBox(faces, 0.15, 0.35, 1.15, 0.45, 1.7, 1.4, accent, accent, accent);
  addBox(faces, 0.15, 1.45, 0.55, 0.45, 2.35, 0.85, accent, accent, accent);
  addBox(faces, -0.05, 2.15, 0.25, 0.65, 2.55, 0.7, "#2a313a", "#1c2430", "#2a313a");
}

function modelLoader(faces: Face[], accent: string) {
  addHull(faces, -1.05, -1.35, 0.7, 1.05, 0.85, 1.7, "#c48a12", accent, "#ffe08a");
  addBox(faces, -0.7, -0.2, 1.6, 0.55, 0.7, 2.35, "#d7ecff", "#eef6ff", "#d7ecff");
  addBox(faces, -1.35, 0.9, 0.35, 1.35, 1.7, 1.15, "#2a313a", accent, "#1c2430");
  addWheel(faces, -1.05, -0.85, 0.62);
  addWheel(faces, 1.05, -0.85, 0.62);
  addWheel(faces, -1.05, 0.35, 0.62);
  addWheel(faces, 1.05, 0.35, 0.62);
}

function addPerson(faces: Face[], x: number, y: number, shirt: string) {
  addBox(faces, x - 0.16, y - 0.12, 0.95, x + 0.16, y + 0.12, 1.55, shirt, "#1c2430", shirt);
  addBox(faces, x - 0.12, y - 0.1, 1.55, x + 0.12, y + 0.1, 1.82, "#e6c2a0", "#e6c2a0", "#e6c2a0");
}

function addTank(faces: Face[], y0: number, y1: number, radius: number, z: number, color: string) {
  const steps = 12;
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    const light = Math.sin((a0 + a1) / 2) > 0;
    faces.push({
      pts: [
        [Math.cos(a0) * radius, y0, z + Math.sin(a0) * radius],
        [Math.cos(a1) * radius, y0, z + Math.sin(a1) * radius],
        [Math.cos(a1) * radius, y1, z + Math.sin(a1) * radius],
        [Math.cos(a0) * radius, y1, z + Math.sin(a0) * radius],
      ],
      color: light ? "#f7f9fc" : color,
      depth: 0,
      layer: 0,
    });
  }
}

function modelFork(faces: Face[], accent: string) {
  addShadow(faces, 1.05, -0.9, 2.2);
  addHull(faces, -0.82, -0.95, 0.38, 0.82, 0.05, 1.15, "#2f6fe0", "#4b86ea", "#2457b8");
  addHull(faces, -0.72, -0.15, 0.48, 0.72, 0.85, 1.28, "#e0a020", accent, "#f0b429");
  addBox(faces, -0.22, 0.05, 0.85, 0.22, 0.42, 1.45, "#f08a1a", "#ffb15a", "#f08a1a");
  addBox(faces, -0.16, 0.02, 1.42, 0.16, 0.28, 1.72, "#e6c2a0", "#e6c2a0", "#e6c2a0");
  addBox(faces, -0.1, 0.75, 0.28, 0.1, 0.95, 2.45, "#1c2430", "#1c2430", "#1c2430");
  addBox(faces, -0.62, -0.35, 1.85, -0.48, 0.55, 2.05, "#1c2430", "#1c2430", "#1c2430");
  addBox(faces, 0.48, -0.35, 1.85, 0.62, 0.55, 2.05, "#1c2430", "#1c2430", "#1c2430");
  addBox(faces, -0.68, -0.4, 2.02, 0.68, 0.6, 2.18, "#1c2430", "#1c2430", "#1c2430");
  addBox(faces, -0.48, 0.85, 0.16, -0.24, 2.35, 0.28, "#3a4452", "#5c6774", "#3a4452");
  addBox(faces, 0.24, 0.85, 0.16, 0.48, 2.35, 0.28, "#3a4452", "#5c6774", "#3a4452");
  addWheel(faces, -0.78, -0.45, 0.34, "#d5dde6");
  addWheel(faces, 0.78, -0.45, 0.34, "#d5dde6");
  addWheel(faces, -0.72, 0.4, 0.3, "#d5dde6");
  addWheel(faces, 0.72, 0.4, 0.3, "#d5dde6");
}

function addShadow(faces: Face[], rx: number, y0: number, y1: number) {
  const pts: Vec[] = [];
  const cy = (y0 + y1) / 2;
  const ry = (y1 - y0) / 2;
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    pts.push([Math.cos(a) * rx, cy + Math.sin(a) * ry, 0.02]);
  }
  faces.push({ pts, color: "rgba(8, 14, 24, 0.38)", depth: 0, layer: -1 });
}

function addHull(
  faces: Face[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  side: string,
  top: string,
  front: string,
) {
  const bevel = 0.28;
  const ring = (y: number): Vec[] => [
    [x0 + bevel, y, z0],
    [x0, y, z0 + bevel],
    [x0, y, z1 - bevel],
    [x0 + bevel, y, z1],
    [x1 - bevel, y, z1],
    [x1, y, z1 - bevel],
    [x1, y, z0 + bevel],
    [x1 - bevel, y, z0],
  ];
  const back = ring(y0);
  const nose = ring(y1);
  for (let i = 0; i < 8; i += 1) {
    const j = (i + 1) % 8;
    const roof = i >= 2 && i <= 4;
    faces.push({ pts: [back[i], back[j], nose[j], nose[i]], color: roof ? top : side, depth: 0, layer: 0 });
  }
  faces.push({ pts: nose, color: front, depth: 0, layer: 0 });
  faces.push({ pts: [...back].reverse(), color: "#c5ced8", depth: 0, layer: 0 });
}

function sidePanel(faces: Face[], x: number, y0: number, y1: number, z0: number, z1: number, color: string) {
  if (x >= 0) {
    addFace(faces, [
      [x, y1, z0],
      [x, y1, z1],
      [x, y0, z1],
      [x, y0, z0],
    ], color);
  } else {
    addFace(faces, [
      [x, y0, z0],
      [x, y0, z1],
      [x, y1, z1],
      [x, y1, z0],
    ], color);
  }
}

function glass(faces: Face[], y: number, z0: number, z1: number, x0 = -0.7, x1 = 0.7) {
  addFace(faces, [
    [x0, y, z0],
    [x0, y, z1],
    [x1, y, z1],
    [x1, y, z0],
  ], "#d7ecff");
}

function addFace(faces: Face[], pts: Vec[], color: string, layer = 0) {
  faces.push({ pts, color, depth: 0, layer });
}

function addBox(
  faces: Face[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  side: string,
  top: string,
  front: string,
  layer = 0,
) {
  const f = (pts: Vec[], color: string) => faces.push({ pts, color, depth: 0, layer });
  f([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top);
  f([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], "#8d97a3");
  f([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], front);
  f([[x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0]], side);
  f([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], side);
  f([[x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]], side);
}

function addWheel(faces: Face[], x: number, y: number, radius: number, hub = "#d5dde6") {
  const steps = 10;
  const half = 0.18;
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    const y0 = y + Math.cos(a0) * radius;
    const z0 = radius + Math.sin(a0) * radius;
    const y1 = y + Math.cos(a1) * radius;
    const z1 = radius + Math.sin(a1) * radius;
    const light = Math.sin((a0 + a1) / 2) > 0.2;
    faces.push({
      pts: [
        [x - half, y0, z0],
        [x + half, y0, z0],
        [x + half, y1, z1],
        [x - half, y1, z1],
      ],
      color: light ? "#2a313a" : "#10141a",
      depth: 0,
      layer: 0,
      cull: false,
    });
  }
  const cap = (side: number, color: string) => {
    const pts: Vec[] = [];
    for (let i = 0; i < steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      pts.push([x + side * half, y + Math.cos(a) * radius * 0.45, radius + Math.sin(a) * radius * 0.45]);
    }
    faces.push({ pts, color, depth: 0, layer: 0, cull: false });
  };
  cap(1, hub);
  cap(-1, hub);
}
