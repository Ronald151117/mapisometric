import type { Map as MlMap, MapMouseEvent } from "maplibre-gl";
import { renderVehicleIcon, type Kind } from "@/lib/fleet-models";

type LngLat = { lng: number; lat: number };
type Mode = "drive" | "shuttle" | "park";

type Unit = { id: string; kind: Kind; speed: number; accent: string; mode: Mode; work?: string };

const FLEET: Unit[] = [
  { id: "TRK-2372", kind: "truck", speed: 9, accent: "#f2861e", mode: "drive" },
  { id: "AMB-03", kind: "ambulance", speed: 13, accent: "#f4f7fb", mode: "drive" },
  { id: "PNC-118", kind: "police", speed: 12, accent: "#1d4e9c", mode: "drive" },
  { id: "PER-22", kind: "crew", speed: 8, accent: "#2f6fe0", mode: "drive" },
  { id: "BUS-04", kind: "bus", speed: 7.5, accent: "#f0c230", mode: "drive" },
  { id: "SED-19", kind: "sedan", speed: 12.5, accent: "#1fb5a8", mode: "drive" },
  { id: "TAX-07", kind: "taxi", speed: 11, accent: "#f2c230", mode: "drive" },
  { id: "RAS-01", kind: "semi", speed: 8, accent: "#c23b2e", mode: "drive" },
  { id: "VOL-12", kind: "dump", speed: 7, accent: "#e9792a", mode: "drive" },
  { id: "CIS-05", kind: "tanker", speed: 7.5, accent: "#dfe5ec", mode: "drive" },
  { id: "BOM-01", kind: "fire", speed: 11, accent: "#d12626", mode: "drive" },
  { id: "CAT-320", kind: "excavator", speed: 0, accent: "#f0b429", mode: "park", work: "En obra" },
  { id: "CAT-950", kind: "loader", speed: 2.6, accent: "#f0b429", mode: "shuttle", work: "Cargando" },
  { id: "FL-07", kind: "fork", speed: 2.2, accent: "#f0b429", mode: "shuttle", work: "En patio" },
  { id: "FL-08", kind: "fork", speed: 1.9, accent: "#f0b429", mode: "shuttle", work: "En patio" },
];

/** Tamaño en pantalla de cada ícono isométrico. */
const ICON_PX: Record<Kind, number> = {
  truck: 92,
  semi: 118,
  dump: 100,
  tanker: 104,
  fire: 96,
  ambulance: 90,
  police: 76,
  crew: 94,
  bus: 108,
  sedan: 72,
  taxi: 74,
  excavator: 90,
  loader: 90,
  fork: 72,
};
const SIM_SPEED = 1.5;
const CELL = 40;

type Road = { xy: [number, number][]; cum: number[]; total: number; major: boolean };
type Net = { origin: LngLat; kx: number; ky: number; roads: Road[]; grid: Map<string, [number, number][]> };

type Mover = {
  unit: Unit;
  road: number;
  dir: 1 | -1;
  s: number;
  seg: number;
  pause: number;
  pace: number;
  shuttle: { from: number; to: number; back: boolean } | null;
  x: number;
  y: number;
  heading: number;
  root: HTMLDivElement;
  icon: HTMLImageElement;
  tag: HTMLButtonElement;
  status: HTMLSpanElement;
  speedText: HTMLSpanElement;
  screen: { x: number; y: number; on: boolean };
  iconKey: string;
};

export type FleetHandle = { stop(): void; setVisible(on: boolean): void };

export function startFleet(map: MlMap): FleetHandle | null {
  const first = buildNet(map);
  if (!first) return null;
  let net: Net = first;

  const overlay = document.createElement("div");
  overlay.className = "fleet-tags";
  map.getContainer().append(overlay);
  const icons = new Map<string, string>();

  const movers: Mover[] = FLEET.map((unit) => {
    const root = document.createElement("div");
    root.className = "fleet-unit";
    const icon = document.createElement("img");
    icon.className = "fleet-icon";
    icon.alt = "";
    icon.draggable = false;
    icon.style.setProperty("--icon", `${ICON_PX[unit.kind]}px`);
    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = "fleet-tag";
    tag.dataset.kind = unit.kind;
    const dot = document.createElement("span");
    dot.className = "fleet-dot";
    const name = document.createElement("b");
    name.textContent = unit.id;
    const status = document.createElement("span");
    status.className = "fleet-status";
    const speedText = document.createElement("span");
    speedText.className = "fleet-speed";
    tag.append(dot, name, status, speedText);
    tag.style.top = `${-Math.round(ICON_PX[unit.kind] * 0.62) - 2}px`;
    root.append(icon, tag);
    overlay.append(root);
    return {
      unit,
      road: 0,
      dir: 1,
      s: 0,
      seg: 0,
      pause: 0,
      pace: 0,
      shuttle: null,
      x: 0,
      y: 0,
      heading: 0,
      root,
      icon,
      tag,
      status,
      speedText,
      screen: { x: 0, y: 0, on: false },
      iconKey: "",
    };
  });

  const seed = (network: Net) => {
    const bounds = map.getBounds();
    const reach = Math.max(120, ((bounds.getNorth() - bounds.getSouth()) * network.ky) / 2) * 0.55;
    const middle = map.getCenter();
    const cx = (middle.lng - network.origin.lng) * network.kx;
    const cy = (middle.lat - network.origin.lat) * network.ky;
    const taken = new Set<number>();
    movers.forEach((mover, i) => {
      const angle = i * 2.39996;
      const radius = reach * Math.sqrt((i + 0.6) / movers.length);
      const spot = snap(network, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, mover.unit.mode === "drive", taken);
      mover.road = spot.road;
      taken.add(spot.road);
      const road = network.roads[spot.road];
      mover.dir = i % 2 === 0 ? 1 : -1;
      mover.s = mover.dir === 1 ? spot.along : road.total - spot.along;
      mover.seg = 0;
      mover.pause = 0;
      mover.pace = mover.unit.speed;
      if (mover.unit.mode === "shuttle") {
        const span = Math.min(45, road.total * 0.5);
        const from = Math.max(0, Math.min(mover.s - span / 2, road.total - span));
        mover.s = from;
        mover.shuttle = { from, to: from + span, back: false };
      } else {
        mover.shuttle = null;
      }
      const at = pointAt(road, mover.dir, mover.s);
      mover.x = at.x;
      mover.y = at.y;
      mover.heading = at.heading;
    });
  };
  seed(net);

  let selected: Mover | null = null;
  let following = false;
  let visible = true;

  const select = (mover: Mover | null) => {
    if (selected) selected.tag.classList.remove("is-selected");
    selected = mover;
    following = Boolean(mover);
    if (!mover) return;
    mover.tag.classList.add("is-selected");
    const at = toLngLat(net, mover.x, mover.y);
    map.easeTo({ center: [at.lng, at.lat], zoom: Math.max(map.getZoom(), 17.4), duration: 900 });
  };

  for (const mover of movers) {
    const choose = (event: Event) => {
      event.stopPropagation();
      select(selected === mover ? null : mover);
    };
    mover.tag.addEventListener("click", choose);
    mover.icon.addEventListener("click", choose);
  }

  const onClick = (event: MapMouseEvent) => {
    let best: Mover | null = null;
    let bestDistance = 34;
    for (const mover of movers) {
      if (!mover.screen.on) continue;
      const distance = Math.hypot(mover.screen.x - event.point.x, mover.screen.y - event.point.y);
      if (distance < bestDistance) {
        best = mover;
        bestDistance = distance;
      }
    }
    select(best);
  };
  const onDrag = () => {
    following = false;
  };
  const onMoveEnd = () => {
    if (!visible || map.getZoom() < 13) return;
    const bounds = map.getBounds();
    const anyInside = movers.some((mover) => {
      const at = toLngLat(net, mover.x, mover.y);
      return bounds.contains([at.lng, at.lat]);
    });
    if (anyInside) return;
    const fresh = buildNet(map);
    if (!fresh) return;
    net = fresh;
    select(null);
    seed(net);
  };
  map.on("click", onClick);
  map.on("dragstart", onDrag);
  map.on("moveend", onMoveEnd);

  const paint = () => {
    if (!visible) return;
    const bearing = map.getBearing();
    const pitch = Math.max(18, Math.min(70, map.getPitch()));
    const pitchKey = Math.round(pitch / 6) * 6;
    const bounds = map.getBounds();
    for (const mover of movers) {
      const at = toLngLat(net, mover.x, mover.y);
      const point = map.project([at.lng, at.lat]);
      const on = bounds.contains([at.lng, at.lat]);
      mover.screen = { x: point.x, y: point.y, on };
      mover.root.hidden = !on;
      if (!on) continue;
      mover.root.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
      const heading = Math.round((((mover.heading - bearing) % 360) + 360) % 360 / 12) * 12;
      const key = `${mover.unit.kind}|${mover.unit.accent}|${heading}|${pitchKey}`;
      if (key === mover.iconKey) continue;
      mover.iconKey = key;
      try {
        mover.icon.src = iconUrl(icons, mover.unit.kind, mover.unit.accent, heading, pitchKey);
      } catch {
        mover.iconKey = "";
      }
    }
  };
  paint();

  let frame = 0;
  let last = performance.now();
  let lastText = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const mover of movers) step(net, mover, dt);
    paint();
    if (now - lastText > 400) {
      lastText = now;
      for (const mover of movers) label(mover, mover === selected);
    }
    if (selected && following) {
      const at = toLngLat(net, selected.x, selected.y);
      if (!map.isEasing()) map.jumpTo({ center: [at.lng, at.lat] });
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    stop() {
      cancelAnimationFrame(frame);
      map.off("click", onClick);
      map.off("dragstart", onDrag);
      map.off("moveend", onMoveEnd);
      overlay.remove();
    },
    setVisible(on: boolean) {
      visible = on;
      overlay.hidden = !on;
      if (!on) select(null);
    },
  };
}

function label(mover: Mover, selected: boolean) {
  const moving = mover.pace > 0.3;
  const text = mover.unit.work ?? (moving ? "En ruta" : "Detenido");
  if (mover.status.textContent !== text) mover.status.textContent = text;
  mover.tag.dataset.state = mover.unit.work ? "work" : moving ? "moving" : "stopped";
  const kmh = selected && moving ? `${Math.round(mover.pace * 3.6)} km/h` : "";
  if (mover.speedText.textContent !== kmh) mover.speedText.textContent = kmh;
}

function step(net: Net, mover: Mover, dt: number) {
  const road = net.roads[mover.road];
  if (!road) return;
  if (mover.unit.mode === "park") {
    mover.pace = 0;
    return;
  }
  if (mover.pause > 0) mover.pause -= dt;
  const target = mover.pause > 0 ? 0 : mover.unit.speed;
  mover.pace += (target - mover.pace) * Math.min(1, dt * (target > mover.pace ? 0.8 : 2.5));
  const travel = mover.pace * dt * SIM_SPEED;

  if (mover.shuttle) {
    const lane = mover.shuttle;
    mover.s += lane.back ? -travel : travel;
    if (!lane.back && mover.s >= lane.to) {
      mover.s = lane.to;
      lane.back = true;
      mover.pause = 1.5 + Math.random() * 2;
    } else if (lane.back && mover.s <= lane.from) {
      mover.s = lane.from;
      lane.back = false;
      mover.pause = 1.5 + Math.random() * 2;
    }
    const at = pointAt(road, mover.dir, mover.s);
    ease(mover, at.x, at.y, at.heading, dt);
    return;
  }

  mover.s += travel;
  if (mover.s >= road.total) {
    const end = pointAt(road, mover.dir, road.total);
    const next = chooseNext(net, mover.road, end.x, end.y, end.heading, 22, 0, 115);
    if (next) {
      mover.road = next.road;
      mover.dir = next.dir;
      mover.s = next.s;
    } else {
      mover.dir = mover.dir === 1 ? -1 : 1;
      mover.s = 0;
    }
    mover.seg = -1;
    if (Math.random() < 0.22) mover.pause = 2 + Math.random() * 4;
  }
  const current = net.roads[mover.road];
  const at = pointAt(current, mover.dir, mover.s);
  if (at.seg !== mover.seg) {
    const fresh = mover.seg !== -1;
    mover.seg = at.seg;
    if (fresh && Math.random() < 0.3) {
      const turn = chooseNext(net, mover.road, at.x, at.y, at.heading, 5, 45, 135);
      if (turn) {
        mover.road = turn.road;
        mover.dir = turn.dir;
        mover.s = turn.s;
        mover.seg = -1;
        if (Math.random() < 0.3) mover.pause = 1.5 + Math.random() * 2.5;
      }
    }
  }
  const now = pointAt(net.roads[mover.road], mover.dir, mover.s);
  ease(mover, now.x, now.y, now.heading, dt);
}

function ease(mover: Mover, x: number, y: number, heading: number, dt: number) {
  const k = 1 - Math.exp(-dt * 9);
  mover.x += (x - mover.x) * k;
  mover.y += (y - mover.y) * k;
  let delta = ((heading - mover.heading + 540) % 360) - 180;
  if (Math.abs(delta) > 170 && Math.hypot(x - mover.x, y - mover.y) < 0.5) delta = Math.sign(delta) * 170;
  mover.heading = (mover.heading + delta * (1 - Math.exp(-dt * 5)) + 360) % 360;
}

function chooseNext(net: Net, from: number, x: number, y: number, heading: number, radius: number, minTurn: number, maxTurn: number) {
  const options: { road: number; dir: 1 | -1; s: number; weight: number }[] = [];
  const seen = new Set<string>();
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  for (let i = -1; i <= 1; i += 1) {
    for (let j = -1; j <= 1; j += 1) {
      for (const [roadIndex, segIndex] of net.grid.get(`${cx + i},${cy + j}`) ?? []) {
        if (roadIndex === from) continue;
        const key = `${roadIndex}:${segIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const road = net.roads[roadIndex];
        const a = road.xy[segIndex];
        const b = road.xy[segIndex + 1];
        const hit = nearest(a, b, x, y);
        if (hit.distance > radius) continue;
        const along = road.cum[segIndex] + hit.t * (road.cum[segIndex + 1] - road.cum[segIndex]);
        const forward = headingOf(a, b);
        for (const dir of [1, -1] as const) {
          const left = dir === 1 ? road.total - along : along;
          if (left < 25) continue;
          const course = dir === 1 ? forward : (forward + 180) % 360;
          const turn = Math.abs(((course - heading + 540) % 360) - 180);
          if (turn < minTurn || turn > maxTurn) continue;
          options.push({ road: roadIndex, dir, s: dir === 1 ? along : road.total - along, weight: turn < 25 ? 3 : 1.4 });
        }
      }
    }
  }
  if (options.length === 0) return null;
  let roll = Math.random() * options.reduce((sum, option) => sum + option.weight, 0);
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option;
  }
  return options[options.length - 1];
}

/** Punto de calle más cercano a (x, y); prefiere calles distintas para no amontonar unidades. */
function snap(net: Net, x: number, y: number, major: boolean, taken: Set<number>) {
  let best = { road: 0, along: 0, score: Infinity };
  net.roads.forEach((road, index) => {
    const penalty = (taken.has(index) ? 150 : 0) + (road.major === major ? 0 : 70);
    for (let i = 0; i < road.xy.length - 1; i += 1) {
      const hit = nearest(road.xy[i], road.xy[i + 1], x, y);
      const along = road.cum[i] + hit.t * (road.cum[i + 1] - road.cum[i]);
      const score = hit.distance + penalty;
      if (score < best.score) best = { road: index, along, score };
    }
  });
  return best;
}

function nearest(a: [number, number], b: [number, number], x: number, y: number) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len));
  return { t, distance: Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) };
}

function pointAt(road: Road, dir: 1 | -1, s: number) {
  const dist = Math.max(0, Math.min(road.total, dir === 1 ? s : road.total - s));
  let index = 1;
  while (index < road.cum.length - 1 && road.cum[index] < dist) index += 1;
  const start = road.cum[index - 1];
  const span = Math.max(0.001, road.cum[index] - start);
  const t = (dist - start) / span;
  const a = road.xy[index - 1];
  const b = road.xy[index];
  const forward = headingOf(a, b);
  return {
    x: a[0] + (b[0] - a[0]) * t,
    y: a[1] + (b[1] - a[1]) * t,
    heading: dir === 1 ? forward : (forward + 180) % 360,
    seg: index - 1,
  };
}

function headingOf(a: [number, number], b: [number, number]) {
  return ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}

function buildNet(map: MlMap): Net | null {
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
    return null;
  }
  const origin = map.getCenter();
  const kx = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  const ky = 110574;
  const bounds = map.getBounds();
  const padX = (bounds.getEast() - bounds.getWest()) * 0.35;
  const padY = (bounds.getNorth() - bounds.getSouth()) * 0.35;
  const inside = (p: number[]) =>
    p[0] > bounds.getWest() - padX && p[0] < bounds.getEast() + padX && p[1] > bounds.getSouth() - padY && p[1] < bounds.getNorth() + padY;
  const roads: Road[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const klass = String(feature.properties?.class ?? "");
    const major = ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(klass);
    const geometry = feature.geometry as { type: string; coordinates: number[][] | number[][][] };
    const parts =
      geometry.type === "LineString"
        ? [geometry.coordinates as number[][]]
        : geometry.type === "MultiLineString"
          ? (geometry.coordinates as number[][][])
          : [];
    for (const part of parts) {
      if (part.length < 2 || !part.some(inside)) continue;
      const key = `${part[0][0].toFixed(5)},${part[0][1].toFixed(5)}:${part[part.length - 1][0].toFixed(5)},${part[part.length - 1][1].toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const xy = part.map(([lng, lat]) => [(lng - origin.lng) * kx, (lat - origin.lat) * ky] as [number, number]);
      const cum = [0];
      for (let i = 1; i < xy.length; i += 1) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
      const total = cum[cum.length - 1];
      if (total < 40) continue;
      roads.push({ xy, cum, total, major });
    }
  }
  if (roads.length === 0) return null;
  roads.sort((a, b) => Number(b.major) - Number(a.major) || b.total - a.total);
  const kept = roads.slice(0, 700);
  const grid = new Map<string, [number, number][]>();
  kept.forEach((road, roadIndex) => {
    for (let i = 0; i < road.xy.length - 1; i += 1) {
      const [ax, ay] = road.xy[i];
      const [bx, by] = road.xy[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 2)));
      const cells = new Set<string>();
      for (let k = 0; k <= steps; k += 1) {
        const t = k / steps;
        cells.add(`${Math.floor((ax + (bx - ax) * t) / CELL)},${Math.floor((ay + (by - ay) * t) / CELL)}`);
      }
      for (const cell of cells) {
        const list = grid.get(cell);
        if (list) list.push([roadIndex, i]);
        else grid.set(cell, [[roadIndex, i]]);
      }
    }
  });
  return { origin: { lng: origin.lng, lat: origin.lat }, kx, ky, roads: kept, grid };
}

function toLngLat(net: Net, x: number, y: number): LngLat {
  return { lng: net.origin.lng + x / net.kx, lat: net.origin.lat + y / net.ky };
}

function iconUrl(cache: Map<string, string>, kind: Kind, accent: string, heading: number, pitch: number) {
  const key = `${kind}|${accent}|${heading}|${pitch}`;
  const found = cache.get(key);
  if (found) return found;
  const url = renderVehicleIcon(kind, { size: 192, heading, pitch, accent });
  cache.set(key, url);
  return url;
}
