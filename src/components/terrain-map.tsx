import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import { LocateFixed, Navigation } from "lucide-react";
import {
  MAP_COLORS,
  ORTO_DEPT_ID,
  ORTO_PAIS_ID,
  PRESETS,
  START,
  SURF_ROUTE,
  SV_BOUNDS,
  bearingDeg,
  cnrTiles,
  formatDistance,
  formatLatitude,
  formatLongitude,
  metersPerPixel,
  niceDistance,
  type PresetId,
  type Viewpoint,
} from "@/lib/sv-terrain";
import { applyAtmosphere, fetchWeatherField, nearestWeather, sunLight, type Atmosphere, type WeatherCell } from "@/lib/weather-sky";
import { TOY_GROUND, TOY_LABELS, TOY_ROADS, toyHouseImage, toyMapStyle, toyTreeImage, toyTreeSprite, PLANO_LAYERS, planoTreeImage } from "@/lib/toy-style";
import type { FleetHandle } from "@/lib/fleet";

type Imagery = "satelite" | "ortofoto";
type Look = "plano" | "animado";

const PLANO_VIEW = { lng: -89.218, lat: 13.698, zoom: 15.5, pitch: 58, bearing: -30 };

type Hud = {
  lat: number;
  lng: number;
  elevation: number | null;
  zoom: number;
  bearing: number;
  pitch: number;
};

const SCALE_PX = 88;

const DROPS = Array.from({ length: 36 }, (_, index) => ({
  left: `${(index * 23) % 97}%`,
  delay: `${(index % 9) * 0.16}s`,
  duration: `${1.15 + (index % 5) * 0.18}s`,
  scale: 0.7 + (index % 4) * 0.18,
}));

const CLOUD_BANK = [
  { x: 0.08, y: 0.28, scale: 1.35, speed: 7, alpha: 0.95 },
  { x: 0.32, y: 0.18, scale: 1.7, speed: 4.5, alpha: 0.8 },
  { x: 0.55, y: 0.36, scale: 1.15, speed: 9, alpha: 0.7 },
  { x: 0.74, y: 0.16, scale: 1.55, speed: 6, alpha: 0.9 },
  { x: 0.92, y: 0.32, scale: 1.25, speed: 5, alpha: 0.75 },
  { x: 1.15, y: 0.22, scale: 1.45, speed: 8, alpha: 0.85 },
];

function motionDuration(ms: number): number {
  if (typeof window === "undefined") return ms;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
}

function easeTo(map: MlMap, options: Parameters<MlMap["easeTo"]>[0]): Promise<void> {
  const duration = options.duration ?? 1000;
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      map.off("moveend", finish);
      resolve();
    };
    map.once("moveend", finish);
    map.easeTo(options);
    window.setTimeout(finish, duration + 400);
  });
}

export function TerrainMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const playToken = useRef(0);
  const followRef = useRef(false);
  const watchRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<Hud>({
    lat: PLANO_VIEW.lat,
    lng: PLANO_VIEW.lng,
    elevation: null,
    zoom: PLANO_VIEW.zoom,
    bearing: PLANO_VIEW.bearing,
    pitch: PLANO_VIEW.pitch,
  });
  const [exaggeration, setExaggeration] = useState(1.15);
  const [hillshadeOn, setHillshadeOn] = useState(true);
  const [labelsOn, setLabelsOn] = useState(true);
  const [roadsOn, setRoadsOn] = useState(true);
  const [toyOn, setToyOn] = useState(true);
  const [look, setLook] = useState<Look>("plano");
  const [following, setFollowing] = useState(false);
  const [imagery, setImagery] = useState<Imagery>("satelite");
  const [detailOn, setDetailOn] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [mapError, setMapError] = useState<string | null>(null);
  const [ortoNote, setOrtoNote] = useState<string | null>(null);
  const [weather, setWeather] = useState<Atmosphere | null>(null);
  const [sun, setSun] = useState(() => sunLight(new Date(), START.lat, START.lng));
  const fieldRef = useRef<WeatherCell[] | null>(null);
  const fleetRef = useRef<FleetHandle | null>(null);
  const fleetOnRef = useRef(true);
  const [fleetOn, setFleetOn] = useState(true);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    let cancelled = false;
    let map: MlMap | null = null;
    let slow = 0;
    let fleet: FleetHandle | null = null;
    let bootFleet: (() => void) | null = null;

    (async () => {
      try {
        const mod = await import("maplibre-gl");
        const ml = (mod as unknown as { default?: typeof mod }).default ?? mod;
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (cancelled) return;
        ml.setMaxParallelImageRequests?.(8);

        map = new ml.Map({
          container: node,
          maxPitch: 85,
          minZoom: 7,
          maxZoom: 18,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          fadeDuration: 0,
          maxBounds: [
            [-91.6, 12.4],
            [-86.5, 15.05],
          ],
          center: [PLANO_VIEW.lng, PLANO_VIEW.lat],
          zoom: PLANO_VIEW.zoom,
          pitch: PLANO_VIEW.pitch,
          bearing: PLANO_VIEW.bearing,
          dragRotate: true,
          pitchWithRotate: true,
          touchPitch: true,
          touchZoomRotate: true,
          attributionControl: false,
          canvasContextAttributes: { antialias: true },
          style: toyMapStyle(),
        });

      mapRef.current = map;

      const read = () => {
        if (!map) return;
        const center = map.getCenter();
        let elevation: number | null = null;
        try {
          const value = map.queryTerrainElevation(center);
          elevation = typeof value === "number" ? value : null;
        } catch {
          elevation = null;
        }
        setHud({
          lat: center.lat,
          lng: center.lng,
          elevation,
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        });
      };

      const slowTimer = window.setTimeout(() => {
        if (!cancelled) {
          setMapError("La imagen no llegó. Recarga la vista previa.");
          setPhase("error");
        }
      }, 12000);
      slow = slowTimer;
      map.on("styleimagemissing", (event) => {
        if (!map || map.hasImage(event.id)) return;
        if (event.id === "toy-tree") map.addImage(event.id, toyTreeImage(), { pixelRatio: 2 });
        if (event.id === "toy-tree-icon") map.addImage(event.id, toyTreeSprite(), { pixelRatio: 2 });
        if (event.id === "plano-tree") map.addImage(event.id, planoTreeImage(), { pixelRatio: 2 });
        const walls: Record<string, string> = {
          "toy-house-0": "#f7c7b4",
          "toy-house-1": "#f6e3a8",
          "toy-house-2": "#c9e7f6",
        };
        const wall = walls[event.id];
        if (wall) map.addImage(event.id, toyHouseImage(wall), { pixelRatio: 2 });
      });
      map.on("error", (event) => {
        const message = event.error?.message ?? "";
        if (/webgl/i.test(message)) {
          setMapError("Este visor no pudo abrir los gráficos 3D en esta ventana.");
          setPhase("error");
        }
      });
      map.on("load", () => {
        if (cancelled || !map) return;
        window.clearTimeout(slow);
        setPhase("ready");
        map.resize();
        setReady(true);
        window.setTimeout(() => map?.resize(), 250);
      });
      map.on("idle", () => {
        if (!cancelled) map?.resize();
      });
      const fleetModule = import("@/lib/fleet");
      let booting = false;
      const boot = async () => {
        if (cancelled || !map || fleet || booting) return;
        booting = true;
        try {
          const { startFleet } = await fleetModule;
          if (cancelled || !map || fleet) return;
          const handle = startFleet(map);
          if (!handle) return;
          fleet = handle;
          fleetRef.current = handle;
          handle.setVisible(fleetOnRef.current);
          map.off("idle", boot);
        } catch {
          /* Las calles aún no están. Se reintenta en el siguiente idle. */
        } finally {
          booting = false;
        }
      };
      bootFleet = boot;
      map.on("idle", boot);
      map.on("move", read);
      map.on("dragstart", () => {
        if (!followRef.current) return;
        followRef.current = false;
        setFollowing(false);
        setLocateNote("Moviste el mapa. El punto sigue, sin centrar.");
      });
      } catch (error) {
        if (cancelled) return;
        setMapError(error instanceof Error ? error.message : "No se pudo abrir el mapa");
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(slow);
      playToken.current += 1;
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      if (bootFleet) map?.off("idle", bootFleet);
      fleet?.stop();
      fleetRef.current = null;
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    fleetOnRef.current = fleetOn;
    fleetRef.current?.setVisible(fleetOn);
  }, [fleetOn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (look === "plano") {
      map.setTerrain(null);
      return;
    }
    map.setTerrain({ source: "dem", exaggeration });
  }, [exaggeration, ready, look]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const show = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    const plano = look === "plano";
    for (const id of TOY_GROUND) show(id, !plano && toyOn);
    for (const id of TOY_ROADS) show(id, !plano && toyOn && roadsOn);
    for (const id of TOY_LABELS) show(id, !plano && toyOn && labelsOn);
    for (const id of PLANO_LAYERS) {
      const roadLayer = /street|highway|main/.test(id);
      const nameLayer = id === "plano-name";
      show(id, plano && (nameLayer ? labelsOn : roadLayer ? roadsOn : true));
    }
    show("esri", !plano && !toyOn);
    show("roads", !plano && !toyOn && roadsOn);
    show("labels", !plano && !toyOn && labelsOn);
    show("hillshade", !plano && hillshadeOn);
    if (map.getLayer("background")) {
      map.setPaintProperty("background", "background-color", plano ? "#121820" : "#8ed56f");
    }
  }, [toyOn, roadsOn, labelsOn, hillshadeOn, ready, look]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const show = imagery === "ortofoto";
    if (show) ensureOrthophoto(map);
    if (map.getLayer("orto-pais")) {
      map.setLayoutProperty("orto-pais", "visibility", show ? "visible" : "none");
    }
    if (map.getLayer("orto-dept")) {
      map.setLayoutProperty("orto-dept", "visibility", show && detailOn ? "visible" : "none");
    }
  }, [imagery, detailOn, ready]);

  useEffect(() => {
    const control = new AbortController();
    fetchWeatherField(control.signal)
      .then((field) => {
        if (control.signal.aborted) return;
        fieldRef.current = field;
        setWeather(nearestWeather(field, START.lat, START.lng));
      })
      .catch(() => {
        if (!control.signal.aborted) setWeather(null);
      });
    return () => control.abort();
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    setWeather(nearestWeather(field, hud.lat, hud.lng));
  }, [hud.lat, hud.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (look === "plano") {
      map.setSky({
        "sky-color": "#0e141c",
        "horizon-color": "#1a2433",
        "fog-color": "#121820",
        "sky-horizon-blend": 0.7,
        "horizon-fog-blend": 0.35,
        "fog-ground-blend": 0.08,
        "atmosphere-blend": 0.35,
      });
      return;
    }
    if (!weather) return;
    applyAtmosphere(map, weather, sun);
    if (map.getLayer("toy-night")) {
      map.setPaintProperty("toy-night", "fill-opacity", toyOn ? (1 - sun) * 0.45 : 0);
    }
  }, [weather, ready, sun, toyOn, look]);

  useEffect(() => {
    const tick = () => setSun(sunLight(new Date(), hud.lat, hud.lng));
    tick();
    const timer = window.setInterval(tick, 20000);
    return () => window.clearInterval(timer);
  }, [hud.lat, hud.lng]);

  const mpp = metersPerPixel(hud.lat, hud.zoom);
  const scaleMeters = niceDistance(mpp * SCALE_PX);
  const scaleWidth = Math.round(Math.max(28, Math.min(140, scaleMeters / mpp)));

  function applyPreset(id: PresetId) {
    const next = PRESETS.find((item) => item.id === id);
    if (!next) return;
    setExaggeration(next.exaggeration);
    setHillshadeOn(true);
    const map = mapRef.current;
    if (!map) return;
    map.setPaintProperty("hillshade", "hillshade-exaggeration", next.hillshade);
    map.easeTo({ pitch: next.pitch, duration: motionDuration(700) });
  }

  function chooseLook(next: Look) {
    setLook(next);
    const map = mapRef.current;
    if (!map) return;
    if (next === "plano") {
      map.easeTo({
        pitch: 58,
        bearing: -30,
        zoom: Math.max(map.getZoom(), 15.2),
        duration: motionDuration(700),
      });
      return;
    }
    map.easeTo({ pitch: 64, duration: motionDuration(700) });
  }

  function onExaggeration(value: number) {
    setExaggeration(value);
  }

  function goTo(place: Viewpoint) {
    playToken.current += 1;
    setPlaying(false);
    setLocateNote(null);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [place.lng, place.lat],
      zoom: place.zoom,
      pitch: place.pitch,
      bearing: place.bearing,
      duration: motionDuration(1600),
      essential: true,
    });
  }

  function stopWatch() {
    if (watchRef.current == null) return;
    navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }

  function clearFix() {
    followRef.current = false;
    setFollowing(false);
    stopWatch();
    const map = mapRef.current as (MlMap & { __puck?: Marker }) | null;
    map?.__puck?.remove();
    if (map) map.__puck = undefined;
    markerRef.current = null;
    setLocateNote("Fijación quitada");
  }

  function northUp() {
    mapRef.current?.easeTo({ bearing: 0, duration: motionDuration(600) });
  }

  function toggleOverhead() {
    const map = mapRef.current;
    if (!map) return;
    const overhead = map.getPitch() < 12;
    map.easeTo({
      pitch: overhead ? 68 : 0,
      duration: motionDuration(800),
    });
  }

  async function toggleRoute() {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (playing) {
      playToken.current += 1;
      setPlaying(false);
      return;
    }
    const token = ++playToken.current;
    setPlaying(true);
    setLocateNote(null);
    ensureRoute(map);
    const marker = await ensureMarker(map);
    for (let i = 0; i < SURF_ROUTE.length; i += 1) {
      if (playToken.current !== token) return;
      const here = SURF_ROUTE[i];
      const next = SURF_ROUTE[Math.min(i + 1, SURF_ROUTE.length - 1)];
      const bearing = i < SURF_ROUTE.length - 1 ? bearingDeg(here, next) : map.getBearing();
      marker.getElement().style.setProperty("--needle", `${bearing}deg`);
      marker.setLngLat([here.lng, here.lat]);
      await easeTo(map, {
        center: [here.lng, here.lat],
        bearing,
        pitch: 66,
        zoom: i === 0 ? 11.4 : 13.2,
        duration: motionDuration(i === 0 ? 1200 : 1700),
        essential: true,
      });
    }
    if (playToken.current === token) setPlaying(false);
  }

  function locate() {
    if (!navigator.geolocation) {
      setLocateNote("Este visor no puede leer el GPS.");
      return;
    }
    stopWatch();
    followRef.current = true;
    setFollowing(true);
    setLocateNote("Buscando posición…");
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const map = mapRef.current;
        if (!map) return;
        const here = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        const inside =
          here.lng >= SV_BOUNDS[0] &&
          here.lat >= SV_BOUNDS[1] &&
          here.lng <= SV_BOUNDS[2] &&
          here.lat <= SV_BOUNDS[3];
        setLocateNote(inside ? "GPS en vivo" : "Estás fuera de la cobertura de El Salvador");
        const marker = await ensureMarker(map);
        const heading = Number.isFinite(pos.coords.heading) ? pos.coords.heading : null;
        if (heading != null) marker.getElement().style.setProperty("--needle", `${heading}deg`);
        marker.setLngLat([here.lng, here.lat]);
        if (!followRef.current) return;
        map.easeTo({
          center: [here.lng, here.lat],
          zoom: Math.max(map.getZoom(), 14),
          duration: motionDuration(800),
        });
      },
      () => {
        followRef.current = false;
        setFollowing(false);
        setLocateNote("Permiso de ubicación denegado.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 2000 },
    );
  }

  const activePreset = PRESETS.find((item) => Math.abs(item.exaggeration - exaggeration) < 0.05);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-ink">
      <div ref={containerRef} className="map-stage absolute inset-0" />
      {look === "animado" && weather && weather.clouds > 0.12 ? (
        <CottonSky
          cover={weather.clouds}
          light={sun}
          pitch={hud.pitch}
          zoom={hud.zoom}
          elevation={hud.elevation}
        />
      ) : null}
      {look === "animado" && weather && weather.rain > 0 ? (
        <div className="weather-drops" style={{ opacity: 0.45 + weather.rain * 0.4 }} aria-hidden="true">
          {DROPS.slice(0, Math.round(12 + weather.rain * 24)).map((drop, index) => (
            <span
              key={index}
              className="drop"
              style={{
                left: drop.left,
                width: `${5 * drop.scale}px`,
                height: `${8 * drop.scale}px`,
                animationDelay: drop.delay,
                animationDuration: drop.duration,
              }}
            />
          ))}
        </div>
      ) : null}
      {phase !== "ready" ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-bg px-6">
          <div className="max-w-sm rounded-panel border border-line bg-panel px-5 py-4 text-center shadow-panel">
            <p className="text-lg font-semibold">
              {phase === "error" ? "El mapa no arrancó" : "Cargando el mapa"}
            </p>
            <p className="mt-2 text-sm text-muted">
              {mapError ?? "La primera vez baja las calles de esta zona. Puede tardar unos segundos."}
            </p>
            {phase === "error" ? (
              <button
                type="button"
                className="mt-4 h-11 rounded-lg bg-amber px-4 text-sm font-medium text-amber-ink"
                onClick={() => window.location.reload()}
              >
                Reintentar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="map-reticle" aria-hidden="true" />

      {panelOpen ? (
        <aside className="safe-top absolute top-3 right-3 z-10 max-h-[min(32rem,calc(100dvh-1.5rem))] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto rounded-panel border border-line bg-panel/95 p-3 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Fijación</p>
              <p className="text-xs text-muted">{weather?.label ?? "Un dedo mueve. Dos dedos giran."}</p>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="h-11 rounded-lg border border-line px-3 text-sm"
            >
              Cerrar
            </button>
          </div>
          <div className="mt-3 font-mono text-xs leading-5">
            <p>{formatLatitude(hud.lat)}</p>
            <p>{formatLongitude(hud.lng)}</p>
            <p className="text-muted">
              {hud.elevation == null ? "Elevación —" : `Elevación ${Math.round(hud.elevation)} m`}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={locate}
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-amber text-sm font-medium text-amber-ink"
            >
              <LocateFixed className="size-4" />
              {following ? "En vivo" : "Fijar GPS"}
            </button>
            <button
              type="button"
              onClick={clearFix}
              className="h-11 rounded-lg border border-line text-sm"
            >
              Quitar
            </button>
            <button type="button" onClick={northUp} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm">
              <Navigation className="needle size-4" style={{ ["--needle" as string]: `${-hud.bearing}deg` }} />
              Norte
            </button>
            <button type="button" onClick={toggleOverhead} className="h-11 rounded-lg border border-line text-sm">
              {hud.pitch < 12 ? "Relieve" : "Arriba"}
            </button>
          </div>
          {locateNote ? <p className="mt-2 text-xs text-muted">{locateNote}</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => chooseLook("plano")}
              className={look === "plano" ? "h-11 rounded-lg bg-amber text-sm font-medium text-amber-ink" : "h-11 rounded-lg border border-line text-sm"}
            >
              Plano
            </button>
            <button
              type="button"
              onClick={() => chooseLook("animado")}
              className={look === "animado" ? "h-11 rounded-lg bg-amber text-sm font-medium text-amber-ink" : "h-11 rounded-lg border border-line text-sm"}
            >
              Animado
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {look === "plano" ? "Sin relieve. Calles anchas y bloques, como un tablero." : "Con relieve y clima."}
          </p>
          {look === "animado" ? (
            <label className="mt-3 flex h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={toyOn} onChange={(event) => setToyOn(event.target.checked)} />
              Mapa propio
            </label>
          ) : null}
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={fleetOn} onChange={(event) => setFleetOn(event.target.checked)} />
            Unidades
          </label>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={roadsOn} onChange={(event) => setRoadsOn(event.target.checked)} />
            Calles
          </label>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={labelsOn} onChange={(event) => setLabelsOn(event.target.checked)} />
            Nombres
          </label>
          {look === "animado" ? (
            <label className="flex h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={hillshadeOn} onChange={(event) => setHillshadeOn(event.target.checked)} />
              Sombreado
            </label>
          ) : null}
          {look === "animado" ? (
            <>
          <label className="mt-1 block">
            <span className="mb-1 flex items-baseline justify-between text-xs text-muted">
              <span>Relieve</span>
              <span className="font-mono text-ink">×{exaggeration.toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={1}
              max={1.8}
              step={0.1}
              value={exaggeration}
              aria-valuetext={`exageración ${exaggeration.toFixed(1)}`}
              onChange={(event) => onExaggeration(Number(event.target.value))}
              className="w-full"
            />
          </label>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {PRESETS.map((item) => {
              const on = activePreset?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyPreset(item.id)}
                  className={
                    on
                      ? "h-11 rounded-lg bg-amber text-sm font-medium text-amber-ink"
                      : "h-11 rounded-lg border border-line text-sm"
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
            </>
          ) : null}
          <p className="mt-3 text-xs text-muted">Un dedo desplaza el mapa. Dos dedos giran, acercan e inclinan.</p>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="safe-top absolute top-3 right-3 z-10 flex h-11 items-center gap-2 rounded-panel border border-line bg-panel/95 px-3 text-sm shadow-panel"
        >
          <LocateFixed className="size-4 text-amber" />
          Fijar
        </button>
      )}
      <p className="pointer-events-none absolute right-3 bottom-3 z-10 text-[10px] text-ink/80">Calles y casas © OpenStreetMap</p>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg bg-panel/80 px-2 py-1">
        <div className="scale-bar h-1 rounded-full bg-amber" style={{ ["--scale" as string]: `${scaleWidth}px` }} />
        <p className="mt-1 text-center font-mono text-[11px] text-ink">{formatDistance(scaleMeters)}</p>
      </div>

    </main>
  );
}

function ensureOrthophoto(map: MlMap) {
  if (!map.getSource("orto-pais")) {
    map.addSource("orto-pais", {
      type: "raster",
      tiles: cnrTiles(ORTO_PAIS_ID),
      tileSize: 256,
      scheme: "tms",
      minzoom: 6,
      maxzoom: 20,
      bounds: SV_BOUNDS,
      attribution: "CNR El Salvador",
    });
    map.addLayer(
      {
        id: "orto-pais",
        type: "raster",
        source: "orto-pais",
        paint: { "raster-resampling": "linear", "raster-fade-duration": 0 },
      },
      "hillshade",
    );
  }
  if (!map.getSource("orto-dept")) {
    map.addSource("orto-dept", {
      type: "raster",
      tiles: cnrTiles(ORTO_DEPT_ID),
      tileSize: 256,
      scheme: "tms",
      minzoom: 13,
      maxzoom: 21,
      bounds: SV_BOUNDS,
      attribution: "CNR El Salvador",
    });
    map.addLayer(
      {
        id: "orto-dept",
        type: "raster",
        source: "orto-dept",
        minzoom: 13,
        paint: { "raster-resampling": "linear", "raster-fade-duration": 0 },
      },
      "hillshade",
    );
  }
}

function ensureRoute(map: MlMap) {
  const data = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: SURF_ROUTE.map((point) => [point.lng, point.lat]),
    },
  };
  const existing = map.getSource("route");
  if (existing) {
    (existing as GeoJSONSource).setData(data);
    return;
  }
  map.addSource("route", { type: "geojson", data });
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "route",
    paint: {
      "line-color": MAP_COLORS.routeCasing,
      "line-width": 7,
    },
  });
  map.addLayer({
    id: "route",
    type: "line",
    source: "route",
    paint: {
      "line-color": MAP_COLORS.route,
      "line-width": 3.5,
    },
  });
}

async function ensureMarker(map: MlMap): Promise<Marker> {
  const existing = (map as MlMap & { __puck?: Marker }).__puck;
  if (existing) return existing;
  const mod = await import("maplibre-gl");
  const ml = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const el = document.createElement("div");
  el.className = "gps-puck";
  const heading = document.createElement("div");
  heading.className = "gps-puck-heading";
  el.appendChild(heading);
  const marker = new ml.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" })
    .setLngLat([START.lng, START.lat])
    .addTo(map);
  (map as MlMap & { __puck?: Marker }).__puck = marker;
  return marker;
}

function CottonSky({
  cover,
  light,
  pitch,
  zoom,
  elevation,
}: {
  cover: number;
  light: number;
  pitch: number;
  zoom: number;
  elevation: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sky = cloudCeiling(zoom, pitch, elevation);
  const visible = sky != null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let raf = 0;
    let last = 0;
    const paint = (now: number) => {
      if (!reduced) raf = window.requestAnimationFrame(paint);
      if (now - last < 50 && last !== 0) return;
      last = now;
      const parent = canvas.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const nextW = Math.max(1, Math.floor(width * ratio));
      const nextH = Math.max(1, Math.floor(height * ratio));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const drift = reduced ? 0 : frame * 0.35;
      for (const bank of CLOUD_BANK) {
        const x = ((bank.x * width + drift * bank.speed) % (width + 520)) - 260;
        drawCotton(ctx, x, bank.y * height, bank.scale * (0.85 + cover * 0.45), bank.alpha * (0.45 + cover * 0.55), light);
      }
      frame += 1;
    };
    raf = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(raf);
  }, [cover, light, visible]);

  if (sky == null) return null;
  return (
    <div className="weather-sky" style={{ height: `${sky * 100}%` }} aria-hidden="true">
      <canvas ref={canvasRef} className="cotton-canvas" />
    </div>
  );
}

function cloudCeiling(zoom: number, pitch: number, elevation: number | null): number | null {
  const fov = 36.87;
  const aboveHorizon = Math.max(0, (pitch + fov / 2 - 90) / fov);
  const far = Math.max(0, Math.min(1, (13.2 - zoom) / 4));
  const scenic = far * Math.max(0, Math.min(1, (pitch - 28) / 40));
  let fraction = Math.max(aboveHorizon, scenic * 0.62);
  const onPeak = (elevation ?? 0) >= 1600 && zoom >= 13 && pitch >= 24;
  if (onPeak) fraction = Math.max(fraction, 0.34);
  if (fraction < 0.05) return null;
  return Math.min(0.56, fraction);
}

function drawCotton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  alpha: number,
  light: number,
) {
  const lobes = [
    [0, 8, 78],
    [62, 14, 58],
    [-58, 16, 52],
    [28, -26, 48],
    [-24, -22, 42],
    [96, 20, 36],
    [-92, 22, 34],
    [8, 18, 64],
  ];
  const hi = Math.round(210 + light * 45);
  const mid = Math.round(168 + light * 50);
  const shade = Math.round(120 + light * 40);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale * 0.62);
  const shadow = ctx.createRadialGradient(10, 28, 10, 10, 34, 120);
  shadow.addColorStop(0, `rgba(${shade},${shade + 6},${shade + 16},${0.28 * alpha})`);
  shadow.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(8, 30, 130, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [px, py, radius] of lobes) {
    const puff = ctx.createRadialGradient(px - radius * 0.28, py - radius * 0.32, radius * 0.05, px, py, radius);
    puff.addColorStop(0, `rgba(${hi},${hi},${hi + 2},${0.72 * alpha})`);
    puff.addColorStop(0.42, `rgba(${mid},${mid + 4},${mid + 10},${0.38 * alpha})`);
    puff.addColorStop(1, `rgba(${mid},${mid},${mid + 8},0)`);
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
