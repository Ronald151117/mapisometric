import type { ExpressionSpecification, FilterSpecification, LayerSpecification, LightSpecification } from "maplibre-gl";

/**
 * Estilo «plano»: El Salvador oscuro en vista isométrica, con manzanas en bloques, calles con carriles,
 * ríos, línea férrea, pistas del aeropuerto, zonas por uso (hospitales, escuelas, comercio, industria),
 * árboles, lugares de interés con íconos y nombres de calles, colonias, ciudades y departamentos.
 *
 * Usa el esquema OpenMapTiles (OpenFreeMap o un PMTiles propio con el mismo esquema). Las imágenes
 * (`plano-*`) se dibujan en el navegador con `planoImage(id)` desde el evento `styleimagemissing`.
 */

export type PlanoOptions = {
  /** Id de la fuente vectorial OpenMapTiles. */
  source: string;
  fonts?: { regular: string[]; bold: string[] };
  /** Fuente GeoJSON con puntos `name` de volcanes y cerros (opcional). */
  peaksSource?: string;
};

export const PLANO_ROADS = [
  "plano-path",
  "plano-rail",
  "plano-rail-ties",
  "plano-street-casing",
  "plano-street",
  "plano-street-dash",
  "plano-main-casing",
  "plano-main",
  "plano-main-dash",
  "plano-highway-glow",
  "plano-highway-casing",
  "plano-highway",
  "plano-highway-dash",
  "plano-bridge",
] as const;

export const PLANO_LABELS = ["plano-name", "plano-water-name", "plano-place", "plano-state", "plano-peak", "plano-poi"] as const;

export const PLANO_GROUND = [
  "plano-wood",
  "plano-grass",
  "plano-residential",
  "plano-commercial",
  "plano-industrial",
  "plano-health",
  "plano-school",
  "plano-park",
  "plano-sport",
  "plano-sport-edge",
  "plano-canopy",
  "plano-water",
  "plano-shore",
  "plano-river",
  "plano-aeroway-area",
  "plano-runway",
  "plano-runway-mark",
  "plano-boundary-state",
  "plano-boundary-country",
  "plano-building",
  "plano-edge",
  "plano-tree",
] as const;

export const PLANO_LAYERS = [...PLANO_GROUND, ...PLANO_ROADS, ...PLANO_LABELS] as const;

/** Luz para los bloques: de arriba a la izquierda, fría, para que las caras se distingan. */
export const PLANO_LIGHT: LightSpecification = {
  anchor: "viewport",
  color: "#d6e4ff",
  intensity: 0.42,
  position: [1.3, 210, 35],
};

export const PLANO_SKY = {
  "sky-color": "#0e141c",
  "horizon-color": "#1a2433",
  "fog-color": "#121820",
  "sky-horizon-blend": 0.7,
  "horizon-fog-blend": 0.35,
  "fog-ground-blend": 0.08,
  "atmosphere-blend": 0.35,
};

const POI_GROUPS: Record<string, { classes: string[]; color: string }> = {
  salud: { classes: ["hospital", "doctors", "pharmacy", "dentist", "clinic"], color: "#ef5b5b" },
  escuela: { classes: ["school", "college", "university", "kindergarten", "library"], color: "#f0b429" },
  gasolina: { classes: ["fuel", "charging_station"], color: "#f2861e" },
  comida: { classes: ["restaurant", "fast_food", "cafe", "bar", "ice_cream", "bakery"], color: "#e87ba4" },
  tienda: { classes: ["shop", "grocery", "supermarket", "convenience", "clothing_store", "hardware"], color: "#a78bfa" },
  oficina: { classes: ["bank", "town_hall", "post", "embassy", "courthouse"], color: "#2dd4bf" },
  transporte: { classes: ["bus", "railway", "airport", "aerialway"], color: "#5b8def" },
  culto: { classes: ["place_of_worship"], color: "#c4b5fd" },
  seguridad: { classes: ["police", "fire_station"], color: "#60a5fa" },
  hotel: { classes: ["lodging"], color: "#34d399" },
};

const line = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false] as ExpressionSpecification;
const polygon = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false] as ExpressionSpecification;
const classIn = (classes: string[]) => ["match", ["get", "class"], classes, true, false] as ExpressionSpecification;

function road(classes: string[], brunnel: "any" | "bridge" = "any"): FilterSpecification {
  return [
    "all",
    line,
    classIn(classes),
    ["!=", ["get", "brunnel"], "tunnel"],
    brunnel === "bridge" ? ["==", ["get", "brunnel"], "bridge"] : true,
  ];
}

/** Ancho en px por zoom, hasta 18: de cerca las calles crecen al ritmo de los bloques. */
function widthAt(thin: number, mid: number, wide: number, close = wide * 2.6): ExpressionSpecification {
  return ["interpolate", ["exponential", 1.4], ["zoom"], 8, thin, 12, mid, 16, wide, 18, close];
}

export function planoLayers({ source, fonts = { regular: ["Noto Sans Regular"], bold: ["Noto Sans Bold"] }, peaksSource }: PlanoOptions): LayerSpecification[] {
  const fill = (id: string, sourceLayer: string, filter: FilterSpecification, color: string, opacity = 1, minzoom = 0): LayerSpecification => ({
    id,
    type: "fill",
    source,
    "source-layer": sourceLayer,
    minzoom,
    filter,
    paint: { "fill-color": color, "fill-opacity": opacity, "fill-antialias": true },
  });
  const stroke = (
    id: string,
    sourceLayer: string,
    filter: FilterSpecification,
    color: string,
    lineWidth: ExpressionSpecification | number,
    minzoom: number,
    extra: Record<string, unknown> = {},
  ): LayerSpecification =>
    ({
      id,
      type: "line",
      source,
      "source-layer": sourceLayer,
      minzoom,
      filter,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": lineWidth, ...extra },
    }) as LayerSpecification;

  const ground: LayerSpecification[] = [
    fill("plano-wood", "landcover", ["==", ["get", "class"], "wood"], "#14231e"),
    fill("plano-grass", "landcover", classIn(["grass", "farmland", "scrub", "wetland"]), "#151f1c", 0.9),
    fill("plano-residential", "landuse", classIn(["residential", "neighbourhood", "suburb", "quarter"]), "#1c2430", 0.95),
    fill("plano-commercial", "landuse", classIn(["commercial", "retail"]), "#212a3c", 0.95),
    fill("plano-industrial", "landuse", classIn(["industrial", "railway", "garages", "bus_station", "dam"]), "#1f2329", 0.95),
    fill("plano-health", "landuse", classIn(["hospital"]), "#2c1f29", 0.95, 12),
    fill("plano-school", "landuse", classIn(["school", "university", "college", "kindergarten", "library"]), "#28271c", 0.95, 12),
    fill("plano-park", "park", polygon, "#1a2c28"),
    fill("plano-sport", "landuse", classIn(["pitch", "stadium", "playground", "track", "cemetery", "zoo", "theme_park"]), "#1b3326", 1, 13),
    stroke("plano-sport-edge", "landuse", classIn(["pitch", "stadium", "track"]), "#3f7a58", ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 2], 14),
    {
      id: "plano-canopy",
      type: "fill",
      source,
      "source-layer": "landcover",
      minzoom: 12,
      filter: classIn(["wood", "scrub"]),
      paint: { "fill-pattern": "plano-canopy", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13.5, 0.9] },
    },
    fill("plano-water", "water", ["!=", ["get", "brunnel"], "tunnel"], "#16314a"),
    stroke("plano-shore", "water", ["!=", ["get", "brunnel"], "tunnel"], "#2b6390", ["interpolate", ["linear"], ["zoom"], 9, 0.4, 14, 1.2, 18, 2.5], 9, {
      "line-opacity": 0.8,
    }),
    stroke("plano-river", "waterway", ["all", line, ["!=", ["get", "brunnel"], "tunnel"]], "#21507a", [
      "interpolate",
      ["linear"],
      ["zoom"],
      9,
      ["match", ["get", "class"], ["river", "canal"], 0.8, 0.2],
      14,
      ["match", ["get", "class"], ["river", "canal"], 3, 1.2],
      18,
      ["match", ["get", "class"], ["river", "canal"], 12, 4],
    ], 9),
    fill("plano-aeroway-area", "aeroway", ["all", polygon, classIn(["aerodrome", "apron", "heliport"])], "#1b222d", 1, 10),
    stroke("plano-runway", "aeroway", ["all", line, classIn(["runway", "taxiway"])], "#3a4658", [
      "interpolate",
      ["exponential", 1.5],
      ["zoom"],
      10,
      ["match", ["get", "class"], "runway", 2, 0.5],
      14,
      ["match", ["get", "class"], "runway", 16, 4],
      18,
      ["match", ["get", "class"], "runway", 120, 26],
    ], 10),
    stroke("plano-runway-mark", "aeroway", ["all", line, classIn(["runway"])], "#e3ebf5", ["interpolate", ["linear"], ["zoom"], 12, 0.4, 16, 1.6, 18, 3], 12, {
      "line-dasharray": [6, 4],
    }),
    stroke("plano-boundary-state", "boundary", ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]], "#4b5d78", [
      "interpolate",
      ["linear"],
      ["zoom"],
      7,
      0.8,
      12,
      1.6,
    ], 7, { "line-dasharray": [3, 2], "line-opacity": 0.8 }),
    stroke("plano-boundary-country", "boundary", ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]], "#7a90b2", [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      1.2,
      12,
      2.6,
    ], 6),
  ];

  const roadLine = (id: string, classes: string[], color: string, thin: number, mid: number, wide: number, minzoom: number, extra: Record<string, unknown> = {}) =>
    stroke(id, "transportation", road(classes), color, widthAt(thin, mid, wide), minzoom, extra);

  const streets = ["tertiary", "minor", "service", "busway"];
  const mains = ["primary", "secondary"];
  const highways = ["motorway", "trunk"];
  const roads: LayerSpecification[] = [
    stroke("plano-path", "transportation", road(["path", "track", "pedestrian"]), "#4c5d70", widthAt(0.2, 0.5, 1.4, 3), 14, { "line-dasharray": [1, 1.6] }),
    stroke("plano-rail", "transportation", road(["rail", "transit"]), "#3a4555", widthAt(0.4, 1, 2.6, 5), 11),
    stroke("plano-rail-ties", "transportation", road(["rail", "transit"]), "#8693a5", widthAt(0.6, 2, 5, 10), 14, { "line-dasharray": [0.2, 1.4] }),
    roadLine("plano-street-casing", streets, "#121a24", 0.8, 5, 20, 12),
    roadLine("plano-street", streets, "#2a3848", 0.2, 3, 14, 12),
    roadLine("plano-street-dash", streets, "#b7c6d6", 0, 0.4, 1.1, 15, { "line-dasharray": [1.2, 1.2], "line-opacity": 0.75 }),
    roadLine("plano-main-casing", mains, "#101820", 1.8, 8, 28, 9),
    roadLine("plano-main", mains, "#324256", 0.8, 5, 20, 9),
    roadLine("plano-main-dash", mains, "#c5d4e4", 0.2, 0.7, 1.5, 13, { "line-dasharray": [1.6, 1.4] }),
    roadLine("plano-highway-glow", highways, "#5b8def", 4, 16, 52, 7, { "line-blur": ["interpolate", ["linear"], ["zoom"], 7, 4, 16, 18], "line-opacity": 0.16 }),
    roadLine("plano-highway-casing", highways, "#0e1520", 3, 11, 36, 7),
    roadLine("plano-highway", highways, "#3d5168", 1.4, 8, 28, 7),
    roadLine("plano-highway-dash", highways, "#f0c66b", 0.4, 1.1, 2, 12, { "line-dasharray": [2, 1.5] }),
    stroke("plano-bridge", "transportation", road([...streets, ...mains, ...highways], "bridge"), "#7d93b3", widthAt(1, 2, 3, 5), 14, {
      "line-gap-width": widthAt(0.8, 6, 22),
      "line-opacity": 0.85,
    }),
  ];

  const height: ExpressionSpecification = ["min", 64, ["max", 6, ["to-number", ["coalesce", ["get", "render_height"], 10]]]];
  const blocks: LayerSpecification[] = [
    {
      id: "plano-building",
      type: "fill-extrusion",
      source,
      "source-layer": "building",
      minzoom: 14,
      filter: polygon,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], height, 6, "#252f3e", 14, "#2b3648", 26, "#344259", 44, "#3d4f6c", 64, "#4a5f80"],
        "fill-extrusion-opacity": 0.96,
        "fill-extrusion-vertical-gradient": true,
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, height],
        "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, ["min", ["to-number", ["coalesce", ["get", "render_min_height"], 0]], 40]],
      },
    },
    stroke("plano-edge", "building", polygon, "#5b8def", ["interpolate", ["linear"], ["zoom"], 14, 0.3, 15, 0.6, 17, 1.8, 18, 2.4], 14, {
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
    }),
    {
      id: "plano-tree",
      type: "symbol",
      source,
      "source-layer": "park",
      minzoom: 14,
      filter: polygon,
      layout: {
        "icon-image": "plano-tree",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.35, 17, 0.7],
        "icon-allow-overlap": false,
        "icon-padding": 2,
        "icon-pitch-alignment": "viewport",
      },
    },
  ];

  const halo = { "text-halo-color": "#121820", "text-halo-width": 1.3 };
  const poiImage: ExpressionSpecification = ["match", ["get", "class"]] as unknown as ExpressionSpecification;
  for (const [group, info] of Object.entries(POI_GROUPS)) (poiImage as unknown[]).push(info.classes, `plano-poi-${group}`);
  (poiImage as unknown[]).push("");
  const labels: LayerSpecification[] = [
    {
      id: "plano-name",
      type: "symbol",
      source,
      "source-layer": "transportation_name",
      minzoom: 14,
      filter: classIn(["motorway", "trunk", "primary", "secondary", "tertiary", "minor"]),
      layout: {
        "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
        "text-font": fonts.regular,
        "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 13],
        "symbol-placement": "line",
        "text-max-angle": 25,
        "text-padding": 4,
      },
      paint: { "text-color": "#d5deea", ...halo },
    },
    {
      id: "plano-water-name",
      type: "symbol",
      source,
      "source-layer": "water_name",
      minzoom: 9,
      filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
        "text-font": fonts.regular,
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 14, 14],
        "text-letter-spacing": 0.12,
      },
      paint: { "text-color": "#6fa6d6", ...halo },
    },
    {
      id: "plano-state",
      type: "symbol",
      source,
      "source-layer": "place",
      minzoom: 7,
      maxzoom: 10,
      filter: ["==", ["get", "class"], "state"],
      layout: {
        "text-field": ["upcase", ["coalesce", ["get", "name:es"], ["get", "name"]]],
        "text-font": fonts.bold,
        "text-size": 11,
        "text-letter-spacing": 0.2,
      },
      paint: { "text-color": "#7f93b0", ...halo },
    },
    {
      id: "plano-place",
      type: "symbol",
      source,
      "source-layer": "place",
      filter: classIn(["city", "town", "village", "suburb", "neighbourhood", "quarter", "hamlet"]),
      layout: {
        "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
        "text-font": ["match", ["get", "class"], ["city", "town"], ["literal", fonts.bold], ["literal", fonts.regular]] as unknown as string[],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          ["match", ["get", "class"], "city", 14, "town", 11, 9],
          14,
          ["match", ["get", "class"], "city", 20, "town", 16, ["suburb", "quarter"], 14, 12],
        ],
        "text-transform": ["match", ["get", "class"], ["suburb", "neighbourhood", "quarter"], "uppercase", "none"] as unknown as "none",
        "text-letter-spacing": ["match", ["get", "class"], ["suburb", "neighbourhood", "quarter"], 0.14, 0.02] as unknown as number,
        "text-max-width": 8,
        "symbol-sort-key": ["match", ["get", "class"], "city", 0, "town", 1, "village", 2, 3],
      },
      paint: {
        "text-color": ["match", ["get", "class"], ["city", "town"], "#eef4fb", ["suburb", "neighbourhood", "quarter"], "#9fb3cc", "#c3d0e0"],
        ...halo,
      },
    },
    {
      id: "plano-poi",
      type: "symbol",
      source,
      "source-layer": "poi",
      minzoom: 16,
      filter: ["all", ["<=", ["to-number", ["coalesce", ["get", "rank"], 30]], 40], ["!=", poiImage, ""]],
      layout: {
        "icon-image": poiImage,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 16, 0.5, 18, 0.8],
        "icon-anchor": "bottom",
        "icon-pitch-alignment": "viewport",
        "icon-padding": 4,
        "text-field": ["step", ["zoom"], "", 16.5, ["coalesce", ["get", "name:es"], ["get", "name"]]],
        "text-font": fonts.regular,
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 0.3],
        "text-max-width": 9,
        "text-optional": true,
        "symbol-sort-key": ["to-number", ["coalesce", ["get", "rank"], 30]],
      },
      paint: { "text-color": "#c9d6e6", ...halo },
    },
  ];
  if (peaksSource) {
    labels.push({
      id: "plano-peak",
      type: "symbol",
      source: peaksSource,
      minzoom: 8,
      layout: {
        "icon-image": "plano-peak",
        "icon-size": 0.5,
        "icon-anchor": "bottom",
        "text-field": ["get", "name"],
        "text-font": fonts.bold,
        "text-size": 12,
        "text-anchor": "top",
        "text-offset": [0, 0.2],
      },
      paint: { "text-color": "#f0c66b", ...halo },
    });
  }
  return [...ground, ...roads, ...blocks, ...labels];
}

/** Dibuja una imagen `plano-*` del estilo; null si el id no es de este estilo. */
export function planoImage(id: string): { image: ImageData; pixelRatio: number } | null {
  if (id === "plano-tree") return { image: draw(64, 64, (ctx) => tree(ctx, 32, 34, 18)), pixelRatio: 2 };
  if (id === "plano-canopy") {
    return {
      image: draw(96, 96, (ctx) => {
        tree(ctx, 22, 26, 11);
        tree(ctx, 70, 40, 13);
        tree(ctx, 38, 76, 10);
        tree(ctx, 86, 86, 8);
      }),
      pixelRatio: 2,
    };
  }
  if (id === "plano-peak") {
    return {
      image: draw(64, 56, (ctx) => {
        ctx.fillStyle = "#6b5338";
        ctx.beginPath();
        ctx.moveTo(4, 52);
        ctx.lineTo(32, 6);
        ctx.lineTo(60, 52);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#f0c66b";
        ctx.beginPath();
        ctx.moveTo(22, 22);
        ctx.lineTo(32, 6);
        ctx.lineTo(42, 22);
        ctx.lineTo(36, 19);
        ctx.lineTo(32, 24);
        ctx.lineTo(28, 19);
        ctx.closePath();
        ctx.fill();
      }),
      pixelRatio: 2,
    };
  }
  const group = id.startsWith("plano-poi-") ? id.slice(10) : null;
  const info = group ? POI_GROUPS[group] : null;
  if (!group || !info) return null;
  return { image: draw(64, 80, (ctx) => poiPin(ctx, info.color, group)), pixelRatio: 2 };
}

function draw(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin lienzo");
  paint(ctx);
  return ctx.getImageData(0, 0, width, height);
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(x + radius * 0.25, y + radius * 0.55, radius * 0.95, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3f8f68";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8fd0a4";
  ctx.beginPath();
  ctx.arc(x - radius * 0.12, y - radius * 0.12, radius * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c6ead2";
  ctx.beginPath();
  ctx.arc(x - radius * 0.33, y - radius * 0.33, radius * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

/** Pin de lugar: gota del color del grupo con un pictograma blanco. Lienzo 64×80, punta abajo. */
function poiPin(ctx: CanvasRenderingContext2D, color: string, group: string) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(32, 76, 10, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#0e141c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(32, 30, 24, Math.PI * 0.8, Math.PI * 0.2);
  ctx.lineTo(32, 74);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const path = (points: [number, number][], close = false) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    if (close) ctx.closePath();
  };
  switch (group) {
    case "salud":
      ctx.fillRect(28, 17, 8, 26);
      ctx.fillRect(19, 26, 26, 8);
      break;
    case "escuela":
      path([[17, 26], [32, 19], [47, 26], [32, 33]], true);
      ctx.fill();
      path([[23, 30], [23, 38], [32, 42], [41, 38], [41, 30]]);
      ctx.stroke();
      break;
    case "gasolina":
      ctx.fillRect(21, 18, 15, 25);
      ctx.fillStyle = color;
      ctx.fillRect(24, 21, 9, 7);
      path([[36, 24], [42, 28], [42, 38], [39, 40]]);
      ctx.stroke();
      break;
    case "comida":
      path([[24, 17], [24, 43]]);
      ctx.stroke();
      path([[20, 17], [20, 25], [28, 25], [28, 17]]);
      ctx.stroke();
      path([[39, 43], [39, 17], [44, 22], [44, 31], [39, 31]]);
      ctx.stroke();
      break;
    case "tienda":
      ctx.fillRect(19, 25, 26, 18);
      path([[25, 25], [25, 21], [39, 21], [39, 25]]);
      ctx.stroke();
      break;
    case "oficina":
      path([[17, 25], [32, 16], [47, 25]], true);
      ctx.fill();
      for (const x of [21, 29, 37]) ctx.fillRect(x, 27, 5, 12);
      ctx.fillRect(18, 40, 28, 4);
      break;
    case "transporte":
      ctx.beginPath();
      ctx.roundRect(19, 17, 26, 24, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(22, 21, 20, 8);
      ctx.fillRect(22, 34, 4, 3);
      ctx.fillRect(38, 34, 4, 3);
      break;
    case "culto":
      ctx.fillRect(29, 15, 6, 29);
      ctx.fillRect(21, 22, 22, 6);
      break;
    case "seguridad":
      path([[32, 15], [45, 20], [44, 32], [32, 44], [20, 32], [19, 20]], true);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(32, 28, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "hotel":
      ctx.fillRect(18, 24, 4, 19);
      ctx.fillRect(18, 33, 28, 6);
      ctx.fillRect(42, 30, 4, 13);
      ctx.beginPath();
      ctx.arc(27, 28, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.arc(32, 30, 7, 0, Math.PI * 2);
      ctx.fill();
  }
}
