import type { ExpressionSpecification, FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import { DEM_TILES, ESRI_IMAGERY, ESRI_LABELS, ESRI_ROADS } from "@/lib/sv-terrain";

function road(classes: string[]): FilterSpecification {
  return [
    "all",
    ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
    ["match", ["get", "class"], classes, true, false],
    ["!=", ["get", "brunnel"], "tunnel"],
    ["!=", ["get", "class"], "ferry"],
  ];
}

function width(thin: number, mid: number, wide: number): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], 8, thin, 12, mid, 16, wide];
}

export const TOY_GROUND = [
  "toy-farm",
  "toy-sand",
  "toy-residential",
  "toy-park",
  "toy-wood",
  "toy-canopy",
  "toy-water",
  "toy-ocean",
  "toy-stream",
  "toy-lot",
  "toy-house",
  "toy-park-tree",
  "toy-night",
];

export const TOY_ROADS = [
  "toy-trail",
  "toy-street-casing",
  "toy-street",
  "toy-main-casing",
  "toy-main",
  "toy-highway-casing",
  "toy-highway",
];

export const TOY_LABELS = ["toy-road-name", "toy-place", "toy-peak"];

export const PLANO_LAYERS = [
  "plano-residential",
  "plano-park",
  "plano-water",
  "plano-river",
  "plano-highway-casing",
  "plano-highway",
  "plano-highway-dash",
  "plano-main-casing",
  "plano-main",
  "plano-main-dash",
  "plano-street-casing",
  "plano-street",
  "plano-street-dash",
  "plano-building",
  "plano-roof",
  "plano-tree",
  "plano-name",
  "plano-place",
] as const;

export function planoTreeImage(): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin lienzo");
  ctx.fillStyle = "#8fd0a4";
  ctx.beginPath();
  ctx.arc(32, 34, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c6ead2";
  ctx.beginPath();
  ctx.arc(26, 28, 7, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, 64, 64);
}

export function toyHouseImage(wall: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin lienzo");
  ctx.fillStyle = "rgba(40, 24, 12, 0.2)";
  ctx.beginPath();
  ctx.ellipse(32, 74, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wall;
  ctx.beginPath();
  ctx.roundRect(16, 38, 32, 30, 4);
  ctx.fill();
  ctx.fillStyle = "#e98b6a";
  ctx.beginPath();
  ctx.moveTo(10, 40);
  ctx.lineTo(32, 16);
  ctx.lineTo(54, 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#6a3b22";
  ctx.fillRect(29, 52, 7, 16);
  ctx.fillStyle = "#d7f1fb";
  ctx.fillRect(20, 46, 7, 7);
  return ctx.getImageData(0, 0, 64, 80);
}

export function toyTreeSprite(): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin lienzo");
  ctx.fillStyle = "#7a4a28";
  ctx.fillRect(29, 48, 6, 22);
  ctx.fillStyle = "#2f8d3c";
  ctx.beginPath();
  ctx.arc(32, 36, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7dce63";
  ctx.beginPath();
  ctx.arc(24, 30, 10, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, 64, 80);
}
export function toyTreeImage(): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin lienzo");
  const tree = (x: number, y: number, radius: number) => {
    ctx.fillStyle = "#7a4a28";
    ctx.fillRect(x - 3, y + radius * 0.35, 6, radius * 0.55);
    ctx.beginPath();
    ctx.fillStyle = "#2f8d3c";
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#7dce63";
    ctx.arc(x - radius * 0.28, y - radius * 0.3, radius * 0.48, 0, Math.PI * 2);
    ctx.fill();
  };
  tree(38, 46, 24);
  tree(96, 74, 28);
  const pixels = ctx.getImageData(0, 0, 128, 128);
  return pixels;
}

export function toyMapStyle(): StyleSpecification {
  const land: LayerSpecification[] = [
    {
      id: "toy-farm",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["farmland", "orchard"], true, false],
      paint: { "fill-color": "#d7e07a" },
    },
    {
      id: "toy-sand",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["sand", "wetland"], true, false],
      paint: { "fill-color": "#f3d7a2" },
    },
    {
      id: "toy-residential",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: ["match", ["get", "class"], ["residential", "neighbourhood", "suburb"], true, false],
      paint: { "fill-color": "#f0e2c8", "fill-opacity": 0.85 },
    },
    {
      id: "toy-park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      paint: { "fill-color": "#63c56a" },
    },
    {
      id: "toy-wood",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "wood"],
      paint: { "fill-color": "#3f9a48" },
    },
    {
      id: "toy-canopy",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      minzoom: 11,
      filter: ["==", ["get", "class"], "wood"],
      paint: { "fill-pattern": "toy-tree", "fill-opacity": 0.95 },
    },
    {
      id: "toy-water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: { "fill-color": "#3eb8d8" },
    },
    {
      id: "toy-stream",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      minzoom: 10,
      layout: { "line-cap": "round" },
      paint: {
        "line-color": "#8ad7ea",
        "line-width": width(0.4, 1.2, 3),
      },
    },
  ];

  const buildings: LayerSpecification[] = [
    {
      id: "toy-lot",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-color": "#f6d7c4",
        "fill-outline-color": "#e98b6a",
        "fill-opacity": 0.92,
      },
    },
    {
      id: "toy-house",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 15,
      layout: {
        "icon-image": [
          "match",
          ["%", ["to-number", ["coalesce", ["get", "osm_id"], 1]], 3],
          0,
          "toy-house-0",
          1,
          "toy-house-1",
          "toy-house-2",
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 15, 0.55, 17, 1.15],
        "icon-anchor": "bottom",
        "icon-pitch-alignment": "viewport",
        "icon-allow-overlap": false,
        "icon-padding": 1,
      },
    },
    {
      id: "toy-park-tree",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "park",
      minzoom: 13,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      layout: {
        "icon-image": "toy-tree-icon",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.55, 16, 1],
        "icon-anchor": "bottom",
        "icon-pitch-alignment": "viewport",
        "icon-allow-overlap": false,
      },
    },
  ];

  const roads: LayerSpecification[] = [
    line("toy-trail", ["path", "track"], "#c4a574", 0.2, 0.6, 1.4, 15, [1.1, 1.3]),
    line("toy-street-casing", ["tertiary", "minor", "service"], "#b7c4bc", 0.2, 2.4, 11, 11),
    line("toy-street", ["tertiary", "minor", "service"], "#fffdf8", 0, 1.2, 6.5, 11),
    line("toy-main-casing", ["primary", "secondary"], "#e2c48a", 0.8, 3.4, 13, 9),
    line("toy-main", ["primary", "secondary"], "#fff4d8", 0.3, 1.8, 8, 9),
    line("toy-highway-casing", ["motorway", "trunk"], "#ef7d1a", 1.6, 5, 16, 7),
    line("toy-highway", ["motorway", "trunk"], "#ffc53d", 0.7, 2.6, 10, 7),
  ];

  const labels: LayerSpecification[] = [
    {
      id: "toy-road-name",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 14,
      filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"], true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "symbol-placement": "line",
        "text-max-angle": 28,
      },
      paint: { "text-color": "#3d3428", "text-halo-color": "#fffaf2", "text-halo-width": 1.2 },
    },
    {
      id: "toy-place",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: ["match", ["get", "class"], ["city", "town"], true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 14, 18],
      },
      paint: { "text-color": "#2c241c", "text-halo-color": "#fffaf2", "text-halo-width": 1.4 },
    },
    {
      id: "toy-peak",
      type: "symbol",
      source: "peaks",
      minzoom: 9,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 13,
        "text-offset": [0, -0.6],
      },
      paint: { "text-color": "#6a3418", "text-halo-color": "#fff6e8", "text-halo-width": 1.4 },
    },
  ];

  const style: StyleSpecification = {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
      esri: {
        type: "raster",
        tiles: [ESRI_IMAGERY],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Esri, Maxar, Earthstar Geographics",
      },
      dem: {
        type: "raster-dem",
        url: DEM_TILES,
        encoding: "terrarium",
        tileSize: 512,
        maxzoom: 14,
        attribution: "Re:Earth Terrain, Mapterhorn",
      },
      labels: { type: "raster", tiles: [ESRI_LABELS], tileSize: 256, maxzoom: 19, attribution: "Esri" },
      roads: { type: "raster", tiles: [ESRI_ROADS], tileSize: 256, maxzoom: 19, attribution: "Esri" },
      veil: {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-91.7, 12.3],
                [-86.4, 12.3],
                [-86.4, 15.15],
                [-91.7, 15.15],
                [-91.7, 12.3],
              ],
            ],
          },
        },
      },
      peaks: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            peak("Santa Ana", -89.63, 13.853),
            peak("Izalco", -89.633, 13.813),
            peak("San Salvador", -89.294, 13.738),
            peak("San Vicente", -88.784, 13.595),
            peak("Chaparrastique", -88.269, 13.434),
          ],
        },
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#121820" } },
      {
        id: "esri",
        type: "raster",
        source: "esri",
        layout: { visibility: "none" },
        paint: { "raster-resampling": "linear", "raster-contrast": 0.12, "raster-saturation": 0.06 },
      },
      ...land,
      {
        id: "hillshade",
        type: "hillshade",
        source: "dem",
        paint: {
          "hillshade-exaggeration": 0.35,
          "hillshade-illumination-direction": 315,
          "hillshade-illumination-anchor": "viewport",
          "hillshade-shadow-color": "#5c4636",
          "hillshade-highlight-color": "#fff6d8",
          "hillshade-accent-color": "#6a8f55",
        },
      },
      ...buildings,
      ...roads,
      {
        id: "toy-ocean",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        filter: ["==", ["get", "class"], "ocean"],
        paint: { "fill-color": "#3eb8d8" },
      },
      {
        id: "toy-night",
        type: "fill",
        source: "veil",
        paint: { "fill-color": "#07101c", "fill-opacity": 0 },
      },
      ...labels,
      ...planoStack(),
      { id: "roads", type: "raster", source: "roads", layout: { visibility: "none" }, paint: { "raster-opacity": 0.9 } },
      { id: "labels", type: "raster", source: "labels", layout: { visibility: "none" } },
    ],
    light: { anchor: "viewport", position: [1.3, 210, 35], color: "#e8eefc", intensity: 0.36 },
    sky: {
      "sky-color": "#0e141c",
      "horizon-color": "#1a2433",
      "fog-color": "#121820",
      "sky-horizon-blend": 0.7,
      "horizon-fog-blend": 0.35,
      "fog-ground-blend": 0.08,
      "atmosphere-blend": 0.35,
    },
  };
  for (const layer of style.layers) {
    if (!HIDDEN_ON_PLANO.has(layer.id)) continue;
    const layout = { ...(layer.layout ?? {}), visibility: "none" as const };
    (layer as { layout: typeof layout }).layout = layout;
  }
  return style;
}

const BUILDING_HEIGHT: ExpressionSpecification = ["min", 28, ["max", 7, ["to-number", ["coalesce", ["get", "render_height"], 12]]]];

const HIDDEN_ON_PLANO = new Set<string>([...TOY_GROUND, ...TOY_ROADS, ...TOY_LABELS, "hillshade"]);

function planoStack(): LayerSpecification[] {
  const ground: LayerSpecification[] = [
    {
      id: "plano-residential",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: ["match", ["get", "class"], ["residential", "neighbourhood", "suburb", "industrial", "commercial"], true, false],
      paint: { "fill-color": "#1c2430", "fill-opacity": 0.95 },
    },
    {
      id: "plano-park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      paint: { "fill-color": "#1a2c28" },
    },
    {
      id: "plano-water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": "#17344d" },
    },
    {
      id: "plano-river",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      minzoom: 10,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#1f4664",
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 10, 0.6, 14, 2.5, 18, 9],
      },
    },
  ];
  const roads: LayerSpecification[] = [
    line("plano-highway-casing", ["motorway", "trunk"], "#0b111a", 3, 11, 36, 7, undefined, true),
    line("plano-highway", ["motorway", "trunk"], "#3f536b", 1.4, 8, 28, 7, undefined, true),
    line("plano-highway-dash", ["motorway", "trunk"], "#f0c35a", 0.4, 1.1, 2, 12, [2.4, 1.6], true),
    line("plano-main-casing", ["primary", "secondary"], "#0e151f", 1.8, 8, 28, 9, undefined, true),
    line("plano-main", ["primary", "secondary"], "#35465c", 0.8, 5, 20, 9, undefined, true),
    line("plano-main-dash", ["primary", "secondary"], "#d6e1ee", 0.2, 0.7, 1.5, 13, [1.8, 1.6], true),
    line("plano-street-casing", ["tertiary", "minor", "service"], "#111821", 0.8, 5, 20, 12, undefined, true),
    line("plano-street", ["tertiary", "minor", "service"], "#2b394b", 0.2, 3, 14, 12, undefined, true),
    line("plano-street-dash", ["tertiary", "minor", "service"], "#a9b9cc", 0, 0.4, 1.1, 15, [1.4, 1.6], true),
  ];
  const blocks: LayerSpecification[] = [
    {
      id: "plano-building",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 15,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], BUILDING_HEIGHT, 6, "#202a38", 16, "#253142", 28, "#2b3950"],
        "fill-extrusion-opacity": 0.97,
        "fill-extrusion-vertical-gradient": true,
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.4, BUILDING_HEIGHT],
        "fill-extrusion-base": 0,
      },
    },
    {
      id: "plano-roof",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 15,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], BUILDING_HEIGHT, 6, "#33435a", 28, "#3e5272"],
        "fill-extrusion-opacity": 0.97,
        "fill-extrusion-vertical-gradient": false,
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.4, ["+", BUILDING_HEIGHT, 0.6]],
        "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.4, BUILDING_HEIGHT],
      },
    },
    {
      id: "plano-tree",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "park",
      minzoom: 14,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      layout: {
        "icon-image": "plano-tree",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.35, 17, 0.7],
        "icon-allow-overlap": false,
        "icon-padding": 2,
        "icon-pitch-alignment": "viewport",
      },
    },
    {
      id: "plano-name",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 15,
      filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"], true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "symbol-placement": "line",
        "text-max-angle": 25,
      },
      paint: { "text-color": "#d5deea", "text-halo-color": "#121820", "text-halo-width": 1.2 },
    },
    {
      id: "plano-place",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: ["match", ["get", "class"], ["city", "town", "village", "suburb", "neighbourhood", "quarter"], true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["match", ["get", "class"], ["city", "town"], 16, 12],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "text-max-width": 8,
        "text-padding": 6,
      },
      paint: { "text-color": "#9fb4cf", "text-halo-color": "#0e141c", "text-halo-width": 1.6 },
    },
  ];
  return [...ground, ...roads, ...blocks];
}

function line(
  id: string,
  classes: string[],
  color: string,
  thin: number,
  mid: number,
  wide: number,
  minzoom: number,
  dash?: [number, number],
  grow = false,
): LayerSpecification {
  return {
    id,
    type: "line",
    source: "openmaptiles",
    "source-layer": "transportation",
    minzoom,
    filter: road(classes),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": color,
      "line-width": grow
        ? ["interpolate", ["exponential", 1.4], ["zoom"], 8, thin, 12, mid, 16, wide, 18, wide * 2.6]
        : width(thin, mid, wide),
      ...(dash ? { "line-dasharray": dash } : {}),
    },
  };
}

function peak(name: string, lng: number, lat: number) {
  return {
    type: "Feature" as const,
    properties: { name },
    geometry: { type: "Point" as const, coordinates: [lng, lat] },
  };
}
