import type { Map as MlMap } from "maplibre-gl";

export type Atmosphere = {
  label: string;
  rain: number;
  clouds: number;
  sky: string;
  horizon: string;
  fog: string;
  skyBlend: number;
  horizonBlend: number;
  groundBlend: number;
  atmosphere: number;
  brightness: number;
  saturation: number;
  contrast: number;
  hillLight: string;
  hillShadow: string;
};

export type WeatherCell = {
  lat: number;
  lng: number;
  look: Atmosphere;
};

type CurrentWeather = {
  weather_code: number;
  cloud_cover: number;
  precipitation: number;
  is_day: number;
};

const GRID_LATS = [14.3, 13.95, 13.6, 13.25];
const GRID_LNGS = [-90.0, -89.45, -88.9, -88.35, -88.05, -87.8];

export async function fetchWeatherField(signal?: AbortSignal): Promise<WeatherCell[]> {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const lat of GRID_LATS) {
    for (const lng of GRID_LNGS) {
      lats.push(lat);
      lngs.push(lng);
    }
  }
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lats.join(","));
  url.searchParams.set("longitude", lngs.join(","));
  url.searchParams.set("current", "weather_code,cloud_cover,precipitation,is_day");
  url.searchParams.set("timezone", "America/El_Salvador");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("clima");
  const body = (await response.json()) as Array<{
    latitude: number;
    longitude: number;
    current?: CurrentWeather;
  }> | { latitude: number; longitude: number; current?: CurrentWeather };
  const rows = Array.isArray(body) ? body : [body];
  return rows
    .filter((row) => row.current)
    .map((row) => ({
      lat: row.latitude,
      lng: row.longitude,
      look: atmosphereFrom(row.current as CurrentWeather),
    }));
}

export function nearestWeather(field: WeatherCell[], lat: number, lng: number): Atmosphere | null {
  let best: WeatherCell | null = null;
  let bestDistance = Infinity;
  for (const cell of field) {
    const dLat = cell.lat - lat;
    const dLng = cell.lng - lng;
    const distance = dLat * dLat + dLng * dLng;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cell;
    }
  }
  return best?.look ?? null;
}

export function applyAtmosphere(map: MlMap, look: Atmosphere, light: number) {
  const night = daylightPaint(light);
  map.setSky({
    "sky-color": mixHex("#07101c", look.sky, light),
    "horizon-color": mixHex(night.horizon, look.horizon, light),
    "fog-color": mixHex(night.fog, look.fog, light),
    "sky-horizon-blend": look.skyBlend,
    "horizon-fog-blend": look.horizonBlend,
    "fog-ground-blend": night.ground + (look.groundBlend - night.ground) * light,
    "atmosphere-blend": 0.9 - light * 0.15,
  });
  if (map.getLayer("esri")) {
    const bright = (0.3 + light * 0.7) * (0.72 + look.brightness * 0.28);
    map.setPaintProperty("esri", "raster-brightness-max", bright);
    map.setPaintProperty("esri", "raster-brightness-min", 0);
    map.setPaintProperty("esri", "raster-saturation", look.saturation * (0.25 + light * 0.75));
    map.setPaintProperty("esri", "raster-contrast", look.contrast);
  }
  if (map.getLayer("hillshade")) {
    map.setPaintProperty("hillshade", "hillshade-highlight-color", mixHex("#6e7c8a", look.hillLight, light));
    map.setPaintProperty("hillshade", "hillshade-shadow-color", look.hillShadow);
  }
}

/** 0 is full night, 1 is full day. Follows the sun over El Salvador. */
export function sunLight(date: Date, lat: number, lng: number): number {
  const elevation = solarElevation(date, lat, lng);
  const raw = (elevation + 10) / 22;
  return Math.min(1, Math.max(0, raw * raw * (3 - 2 * Math.min(1, Math.max(0, raw)))));
}

function daylightPaint(_light: number) {
  return {
    horizon: "#243044",
    fog: "#101820",
    ground: 0.62,
  };
}

function solarElevation(date: Date, lat: number, lng: number): number {
  const rad = Math.PI / 180;
  const n = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const mean = (280.46 + 0.9856474 * n) % 360;
  const anomaly = (357.528 + 0.9856003 * n) * rad;
  const lambda = (mean + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * rad;
  const decl = Math.asin(Math.sin(23.439 * rad) * Math.sin(lambda));
  const utc =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const hourAngle = (utc + lng / 15 - 12) * 15 * rad;
  const latR = lat * rad;
  const sine =
    Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(hourAngle);
  return (Math.asin(Math.min(1, Math.max(-1, sine))) * 180) / Math.PI;
}

function mixHex(from: string, to: string, t: number): string {
  const a = hexRgb(from);
  const b = hexRgb(to);
  const mix = a.map((channel, index) => Math.round(channel + (b[index] - channel) * t));
  return `#${mix.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hexRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function atmosphereFrom(current: CurrentWeather): Atmosphere {
  const night = current.is_day === 0;
  const code = current.weather_code;
  const clouds = Math.min(1, Math.max(0, current.cloud_cover / 100));
  const hard =
    code === 65 || code === 82 || code === 95 || code === 96 || code === 99 || current.precipitation >= 2;
  const wet =
    hard ||
    code === 61 ||
    code === 63 ||
    code === 80 ||
    code === 81 ||
    current.precipitation >= 0.35;
  const fog = code === 45 || code === 48;
  const cloudy = clouds >= 0.55 || code === 2 || code === 3;

  if (hard) {
    return night
      ? paint("Tormenta", 0.9, clouds, "#12161c", "#2a333c", "#3d4852", 0.35, 0.8, 0.78, 0.95, 0.42, -0.45, 0.02)
      : paint("Tormenta", 0.85, clouds, "#3e4852", "#6a737a", "#7d868c", 0.4, 0.78, 0.7, 0.9, 0.55, -0.4, 0.04);
  }
  if (wet) {
    return night
      ? paint(label(code, true), 0.55, clouds, "#1a2430", "#3d4c5c", "#546270", 0.42, 0.74, 0.62, 0.88, 0.5, -0.32, 0.05)
      : paint(label(code, false), 0.5, clouds, "#6d7c88", "#a7b3bb", "#c5ced4", 0.48, 0.7, 0.55, 0.82, 0.68, -0.22, 0.06);
  }
  if (fog) {
    return night
      ? paint("Niebla", 0, 0.85, "#242830", "#8d9398", "#c5c8c6", 0.3, 0.85, 0.82, 0.7, 0.58, -0.35, -0.05)
      : paint("Niebla", 0, 0.8, "#d5dbdf", "#eef1f2", "#f4f6f6", 0.25, 0.9, 0.8, 0.55, 0.85, -0.2, -0.08);
  }
  if (cloudy) {
    return night
      ? paint(clouds > 0.9 ? "Noche nublada" : "Noche con nubes", 0, clouds, "#1c2633", "#4a5968", "#6a7784", 0.5, 0.68, 0.48, 0.8, 0.62, -0.18, 0.04)
      : paint(code === 3 || clouds > 0.85 ? "Nublado" : "Parcialmente nublado", 0, clouds, "#8ea0ae", "#d5dee4", "#e4ebef", 0.55, 0.62, 0.4, 0.7, 0.86, -0.08, 0.08);
  }
  if (night) {
    return paint("Noche despejada", 0, clouds, "#07111f", "#1d3550", "#24384a", 0.62, 0.5, 0.28, 0.85, 0.78, 0.02, 0.1);
  }
  return paint(code === 0 ? "Soleado" : "Casi despejado", 0, clouds, "#7eb6e6", "#f3e2c4", "#d7e7f2", 0.58, 0.55, 0.28, 0.72, 1, 0.1, 0.14);
}

function label(code: number, night: boolean): string {
  if (code === 65 || code === 82) return "Lluvia fuerte";
  if (code === 80 || code === 81) return night ? "Chubascos de noche" : "Chubascos";
  if (code === 61 || code === 63) return night ? "Lluvia de noche" : "Lluvia";
  return night ? "Lluvia de noche" : "Lluvia";
}

function paint(
  label: string,
  rain: number,
  clouds: number,
  sky: string,
  horizon: string,
  fog: string,
  skyBlend: number,
  horizonBlend: number,
  groundBlend: number,
  atmosphere: number,
  brightness: number,
  saturation: number,
  contrast: number,
): Atmosphere {
  const wet = rain > 0;
  return {
    label,
    rain,
    clouds,
    sky,
    horizon,
    fog,
    skyBlend,
    horizonBlend,
    groundBlend,
    atmosphere,
    brightness,
    saturation,
    contrast,
    hillLight: wet ? "#d5e2ea" : "#fff3d6",
    hillShadow: wet ? "#07090c" : "#140e09",
  };
}
