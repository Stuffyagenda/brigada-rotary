"use client";

/**
 * Mapa de reportes (Leaflet). Solo cliente: se carga con `next/dynamic` y
 * `ssr: false` desde MapScreen.
 *
 * Pines: PENDIENTE = círculo relleno rojo con borde blanco; ATENDIDO = anillo
 * verde con relleno blanco (forma + color, nunca solo color). Los reportes sin
 * sincronizar llevan el borde discontinuo.
 */
import "leaflet/dist/leaflet.css";
import type { LeafletMouseEvent, Map as LeafletMap } from "leaflet";
import { memo, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { AttributionControl, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { CircleMarker as LeafletCircleMarker } from "leaflet";
import type { ReporteLocal } from "@/lib/db";
import type { LatLng } from "@/lib/pluscode";
import { cn } from "@/lib/cn";
import { COLOR } from "./colors";
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
  selected: boolean;
  picking: boolean;
  onSelect: (id: string) => void;
  onPick: (punto: LatLng) => void;
}

const Pin = memo(function Pin({ reporte: r, selected, picking, onSelect, onPick }: PinProps) {
  const ref = useRef<LeafletCircleMarker>(null);
  const pendiente = r.estado === "PENDIENTE";
  const sincronizado = r._sync === "synced";

  // La clase de selección se cambia en el elemento SVG para que la escala se anime.
  useEffect(() => {
    const layer = ref.current;
    const el = layer?.getElement();
    if (!layer || !el) return;
    el.classList.toggle("brm-pinSelected", selected);
    if (selected) layer.bringToFront();
  }, [selected]);

  return (
    <>
      <CircleMarker
        ref={ref}
        center={[r.lat, r.lng]}
        radius={pendiente ? 9 : 8}
        interactive={false}
        // `className` va como prop: Leaflet solo la aplica al crear el path (setStyle la ignora).
        className="brm-pin"
        pathOptions={{
          color: pendiente ? COLOR.white : COLOR.done,
          weight: pendiente ? 2.5 : 4,
          fillColor: pendiente ? COLOR.pending : COLOR.white,
          fillOpacity: 1,
          opacity: 1,
          dashArray: sincronizado ? undefined : pendiente ? "3 2.5" : "4 2.5",
        }}
      />
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

        {reportes.map((r) => (
          <Pin
            key={r.id}
            reporte={r}
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
