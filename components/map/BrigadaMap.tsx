"use client";

/**
 * Mapa de reportes (Leaflet). Solo cliente: se carga con `next/dynamic` y
 * `ssr: false` desde MapScreen.
 *
 * Pines por vigencia de la atención (forma + color, nunca solo color; ver
 * pin-estilo.ts): pendiente = círculo relleno rojo; atendido hace 0 a 3 días =
 * anillo verde; 4 a 6 días = anillo naranja con punto central; 7 o más = rombo
 * negro. Los reportes sin sincronizar llevan el borde discontinuo.
 */
import "leaflet/dist/leaflet.css";
import type { LeafletMouseEvent, Map as LeafletMap } from "leaflet";
import { memo, useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { AttributionControl, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { CircleMarker as LeafletCircleMarker } from "leaflet";
import type { ReporteLocal } from "@/lib/db";
import type { LatLng } from "@/lib/pluscode";
import { cn } from "@/lib/cn";
import type { Vigencia } from "@/lib/types";
import { vigencia as vigenciaDe } from "@/lib/vigencia";
import { COLOR } from "./colors";
import { capasPin, ORDEN_DIBUJO, type CapaPin } from "./pin-estilo";
import { RomboMarker } from "./RomboMarker";
import "./brigada-map.css";

export type Capa = "calles" | "satelite";

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export const VISTA_INICIAL = { center: [7.965, -80.432] as [number, number], zoom: 11 };

export interface BrigadaMapProps {
  reportes: readonly ReporteLocal[];
  /** Referencia de la vigencia de cada pin (la de `useAhora()`). */
  ahora: Date;
  selectedId: string | null;
  /** Ubicación elegida para el formulario (GPS, toque o búsqueda). */
  ubicacion: LatLng | null;
  capa: Capa;
  /** Modo "Elegir en el mapa": un toque fija la ubicación. */
  picking: boolean;
  /** Alto (px) tapado abajo por el panel: los controles de Leaflet se colocan encima. */
  bottomInset: number;
  onSelect: (id: string) => void;
  onPick: (punto: LatLng) => void;
  /** Toque en el mapa fuera de un pin (fuera del modo elegir). */
  onBackgroundClick: () => void;
  onReady: (map: LeafletMap) => void;
  onBoundsChange: (bounds: MapBounds) => void;
}

const TILES = {
  calles: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  },
  satelite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imágenes &copy; Esri",
  },
} as const;

function boundsDe(map: LeafletMap): MapBounds {
  const b = map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
}

/** Eventos del mapa y ajuste de tamaño cuando cambia el contenedor. */
function Eventos({
  picking,
  onPick,
  onBackgroundClick,
  onBoundsChange,
}: Pick<BrigadaMapProps, "picking" | "onPick" | "onBackgroundClick" | "onBoundsChange">) {
  const map = useMapEvents({
    click(e) {
      if (picking) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
      else onBackgroundClick();
    },
    moveend() {
      onBoundsChange(boundsDe(map));
    },
  });

  useEffect(() => {
    onBoundsChange(boundsDe(map));
    const el = map.getContainer();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);
    return () => ro.disconnect();
    // Solo al montar: el mapa nunca se desmonta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

/** Cursor en cruz mientras se elige la ubicación. */
function CursorElegir({ picking }: { picking: boolean }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = picking ? "crosshair" : "";
    return () => {
      el.style.cursor = "";
    };
  }, [map, picking]);
  return null;
}

interface PinProps {
  reporte: ReporteLocal;
  vigencia: Vigencia;
  selected: boolean;
  picking: boolean;
  onSelect: (id: string) => void;
  onPick: (punto: LatLng) => void;
}

function opcionesCapa(c: CapaPin) {
  return {
    stroke: !c.sinBorde,
    color: c.borde,
    weight: c.grosor,
    fillColor: c.relleno,
    fillOpacity: 1,
    opacity: 1,
    dashArray: c.discontinuo,
  };
}

const Pin = memo(function Pin({ reporte: r, vigencia, selected, picking, onSelect, onPick }: PinProps) {
  const capasRef = useRef<Array<LeafletCircleMarker | null>>([]);
  const capas = capasPin(vigencia, r._sync === "synced");

  // La clase de selección se cambia en los elementos SVG para que la escala se anime.
  // Depende de la vigencia: si cambia la forma, las capas se crean de nuevo.
  useEffect(() => {
    for (const layer of capasRef.current) {
      const el = layer?.getElement();
      if (!layer || !el) continue;
      el.classList.toggle("brm-pinSelected", selected);
      if (selected) layer.bringToFront();
    }
  }, [selected, vigencia]);

  return (
    <>
      {capas.map((c, i) => {
        const props = {
          center: [r.lat, r.lng] as [number, number],
          radius: c.radio,
          interactive: false,
          // `className` va como prop: Leaflet solo la aplica al crear el path (setStyle la ignora).
          className: "brm-pin",
          pathOptions: opcionesCapa(c),
          ref: (layer: LeafletCircleMarker | null) => {
            capasRef.current[i] = layer;
          },
        };
        return c.forma === "rombo" ? (
          <RomboMarker key={`${vigencia}-${i}`} {...props} />
        ) : (
          <CircleMarker key={`${vigencia}-${i}`} {...props} />
        );
      })}
      <CircleMarker
        center={[r.lat, r.lng]}
        radius={22}
        bubblingMouseEvents={false}
        className="brm-hit"
        pathOptions={{ stroke: false, fill: true, fillColor: COLOR.ink, fillOpacity: 0 }}
        eventHandlers={{
          click: (e: LeafletMouseEvent) => {
            if (picking) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
            else onSelect(r.id);
          },
        }}
      />
    </>
  );
});

function BrigadaMap({
  reportes,
  ahora,
  selectedId,
  ubicacion,
  capa,
  picking,
  bottomInset,
  onSelect,
  onPick,
  onBackgroundClick,
  onReady,
  onBoundsChange,
}: BrigadaMapProps) {
  const seleccionado = selectedId ? reportes.find((r) => r.id === selectedId) : undefined;
  // Vigencia de cada pin y orden de dibujo: lo más urgente encima.
  const instante = ahora.getTime();
  const pines = useMemo(() => {
    const ref = new Date(instante);
    return reportes
      .map((r) => ({ r, v: vigenciaDe(r, ref) }))
      .sort((a, b) => ORDEN_DIBUJO[a.v] - ORDEN_DIBUJO[b.v]);
  }, [reportes, instante]);
  const tiles = TILES[capa];
  const refMapa = useCallback(
    (map: LeafletMap | null) => {
      if (!map) return;
      const el = map.getContainer();
      el.setAttribute(
        "aria-label",
        "Mapa de reportes. Usa las flechas para moverte y las teclas + y − para acercar o alejar.",
      );
      el.setAttribute("aria-roledescription", "mapa");
      onReady(map);
    },
    [onReady],
  );

  return (
    <div
      className={cn("brm-root", picking && "brm-picking")}
      style={{ "--map-bottom-inset": `${bottomInset}px` } as CSSProperties}
    >
      <MapContainer
        center={VISTA_INICIAL.center}
        zoom={VISTA_INICIAL.zoom}
        zoomControl={false}
        attributionControl={false}
        ref={refMapa}
      >
        <TileLayer key={capa} url={tiles.url} attribution={tiles.attribution} maxZoom={19} />
        <AttributionControl position="bottomright" prefix={false} />
        <Eventos
          picking={picking}
          onPick={onPick}
          onBackgroundClick={onBackgroundClick}
          onBoundsChange={onBoundsChange}
        />
        <CursorElegir picking={picking} />

        {pines.map(({ r, v }) => (
          <Pin
            key={r.id}
            reporte={r}
            vigencia={v}
            selected={r.id === selectedId}
            picking={picking}
            onSelect={onSelect}
            onPick={onPick}
          />
        ))}

        {seleccionado && (
          <CircleMarker
            key={`halo-${seleccionado.id}`}
            center={[seleccionado.lat, seleccionado.lng]}
            radius={17}
            interactive={false}
            pathOptions={{ color: COLOR.gold, weight: 3, fill: false, opacity: 1 }}
          />
        )}

        {ubicacion && (
          <>
            <CircleMarker
              center={[ubicacion.lat, ubicacion.lng]}
              radius={15}
              interactive={false}
              pathOptions={{ color: COLOR.rotary, weight: 2, fillColor: COLOR.rotary, fillOpacity: 0.15 }}
            />
            <CircleMarker
              center={[ubicacion.lat, ubicacion.lng]}
              radius={6}
              interactive={false}
              pathOptions={{ color: COLOR.white, weight: 3, fillColor: COLOR.rotary, fillOpacity: 1 }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}

export default BrigadaMap;
