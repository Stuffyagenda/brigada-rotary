"use client";

/**
 * Pin en forma de rombo (vigencia "vencido": necesita nueva visita).
 *
 * Es un `CircleMarker` de Leaflet que, con el renderizador SVG (el del mapa),
 * dibuja un rombo en lugar del círculo: así comparte la capa SVG, el orden de
 * dibujo, `setStyle` (color, discontinuo) y la clase de selección con el resto
 * de los pines. Con otro renderizador (Canvas) vuelve a dibujar un círculo.
 * Solo cliente: lo importa BrigadaMap, que se carga con `ssr: false`.
 */
import { createElementObject, createPathComponent, extendContext, updateCircle } from "@react-leaflet/core";
import { CircleMarker as LeafletCircleMarker, SVG } from "leaflet";
import type { CircleMarkerProps } from "react-leaflet";
import { caminoRombo } from "./rombo";

/** Partes internas de Leaflet 1.9 que se usan para trazar el rombo. */
interface InternoCircleMarker {
  _point: { x: number; y: number };
  _radius: number;
  _renderer: unknown;
  _empty(): boolean;
}

interface InternoSVG {
  _setPath(layer: unknown, path: string): void;
}

const dibujarCirculo = (LeafletCircleMarker.prototype as unknown as { _updatePath(this: unknown): void })._updatePath;

export class LeafletRombo extends LeafletCircleMarker {
  _updatePath(): void {
    const capa = this as unknown as InternoCircleMarker;
    if (!(capa._renderer instanceof SVG)) {
      dibujarCirculo.call(this);
      return;
    }
    const d = capa._empty() ? "M0 0" : caminoRombo(capa._point.x, capa._point.y, capa._radius);
    (capa._renderer as unknown as InternoSVG)._setPath(this, d);
  }
}

/** Componente react-leaflet: mismas props que `CircleMarker` (`radius` = semidiagonal). */
export const RomboMarker = createPathComponent<LeafletRombo, CircleMarkerProps>(function crearRombo(props, ctx) {
  const { center, ...options } = props;
  // `children` es de React, no una opción de Leaflet.
  delete (options as { children?: unknown }).children;
  const rombo = new LeafletRombo(center, options);
  return createElementObject(rombo, extendContext(ctx, { overlayContainer: rombo }));
}, updateCircle);
