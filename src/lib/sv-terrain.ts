/** Keep paint colors aligned with the tokens in src/styles.css. */

export type LngLat = { lng: number; lat: number };

export type Viewpoint = LngLat & {
  id: string;
  name: string;
  detail: string;
  zoom: number;
  pitch: number;
  bearing: number;
};

export const MAP_COLORS = {
  background: "#163044",
  route: "#f0b429",
  routeCasing: "#1a1406",
  hillShadow: "#140e09",
  hillLight: "#fff3d6",
  hillAccent: "#5c4636",
  sky: "#8eb4cc",
  horizon: "#d5e4ee",
  fog: "#c3d3df",
} as const;

export const SV_BOUNDS: [number, number, number, number] = [-90.14, 13.15, -87.68, 14.46];

export const ORTO_PAIS_ID = "cf50094255e411ef8bab858447697b10";
export const ORTO_DEPT_ID = "50caaaa45ef611ee853a00155ddfea0a";

const CNR_HOSTS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `https://ec${n}.elsalvadormaps.sv`);

export function cnrTiles(id: string): string[] {
  return CNR_HOSTS.map((host) => `${host}/stiles/${id}/{z}/{x}/{y}.jpg`);
}

export const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const ESRI_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

export const ESRI_ROADS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";

export const DEM_TILES =
  "https://terrain.reearth.land/terrarium/ellipsoid/tilejson.json";

export const PRESETS = [
  { id: "nitido", label: "Nítido", exaggeration: 1, hillshade: 0.18, pitch: 52 },
  { id: "marcado", label: "Marcado", exaggeration: 1.35, hillshade: 0.28, pitch: 60 },
  { id: "extremo", label: "Extremo", exaggeration: 1.8, hillshade: 0.36, pitch: 66 },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

export const VIEWPOINTS: Viewpoint[] = [
  {
    id: "cadena",
    name: "Cadena volcánica",
    detail: "Desde el litoral",
    lng: -89.58,
    lat: 13.5,
    zoom: 10.15,
    pitch: 72,
    bearing: 32,
  },
  {
    id: "izalco",
    name: "Izalco",
    detail: "Cono 1 950 m",
    lng: -89.633,
    lat: 13.813,
    zoom: 13.7,
    pitch: 74,
    bearing: 48,
  },
  {
    id: "santa-ana",
    name: "Santa Ana",
    detail: "Volcán 2 381 m",
    lng: -89.63,
    lat: 13.853,
    zoom: 13.2,
    pitch: 70,
    bearing: 18,
  },
  {
    id: "ss",
    name: "San Salvador",
    detail: "Volcán y capital",
    lng: -89.25,
    lat: 13.71,
    zoom: 12.4,
    pitch: 66,
    bearing: -24,
  },
  {
    id: "pital",
    name: "Cerro El Pital",
    detail: "Cumbre 2 730 m",
    lng: -89.129,
    lat: 14.382,
    zoom: 13.15,
    pitch: 72,
    bearing: 168,
  },
  {
    id: "apaneca",
    name: "Apaneca",
    detail: "Cordillera",
    lng: -89.81,
    lat: 13.85,
    zoom: 12.5,
    pitch: 68,
    bearing: 120,
  },
  {
    id: "ilopango",
    name: "Ilopango",
    detail: "Caldera",
    lng: -89.053,
    lat: 13.672,
    zoom: 12.5,
    pitch: 62,
    bearing: 24,
  },
  {
    id: "chaparrastique",
    name: "Chaparrastique",
    detail: "San Miguel 2 130 m",
    lng: -88.269,
    lat: 13.434,
    zoom: 13.1,
    pitch: 70,
    bearing: -36,
  },
  {
    id: "surf",
    name: "Surf City",
    detail: "El Tunco",
    lng: -89.383,
    lat: 13.494,
    zoom: 13.6,
    pitch: 58,
    bearing: 200,
  },
  {
    id: "fonseca",
    name: "Fonseca",
    detail: "Golfo y Conchagua",
    lng: -87.78,
    lat: 13.22,
    zoom: 11.1,
    pitch: 60,
    bearing: -18,
  },
  {
    id: "norte",
    name: "Norte",
    detail: "Morazán, otra zona",
    lng: -88.05,
    lat: 14.3,
    zoom: 12.4,
    pitch: 64,
    bearing: 24,
  },
];

/** Capital ridge down to the Pacific — the drop is what the exaggeration shows. */
export const SURF_ROUTE: LngLat[] = [
  { lng: -89.218, lat: 13.702 },
  { lng: -89.279, lat: 13.677 },
  { lng: -89.305, lat: 13.63 },
  { lng: -89.33, lat: 13.56 },
  { lng: -89.322, lat: 13.488 },
  { lng: -89.383, lat: 13.494 },
];

export const START = VIEWPOINTS[0];

export function bearingDeg(a: LngLat, b: LngLat): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function formatLatitude(lat: number): string {
  return formatHemisphere(lat, "N", "S");
}

export function formatLongitude(lng: number): string {
  return formatHemisphere(lng, "E", "O");
}

function formatHemisphere(value: number, pos: string, neg: string): string {
  const hemi = value >= 0 ? pos : neg;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minutes = (abs - deg) * 60;
  return `${deg}° ${minutes.toFixed(3)}′ ${hemi}`;
}

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export function niceDistance(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(meters));
  const n = meters / pow;
  const factor = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return factor * pow;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}
