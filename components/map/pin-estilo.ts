/**
 * Forma y color de los pines por vigencia (forma + color, nunca solo color).
 * Funciones puras: BrigadaMap las dibuja con Leaflet y los tests las comprueban.
 *
 * - pendiente: círculo relleno rojo con borde blanco
 * - reciente: anillo verde con relleno blanco
 * - por-vencer: anillo naranja grueso con punto central naranja
 * - vencido: rombo relleno negro con borde blanco
 *
 * Sin sincronizar: el borde va discontinuo.
 */
import type { Vigencia } from "@/lib/types";
import { COLOR } from "./colors";

export type FormaPin = "circulo" | "rombo";

/** Una capa del pin (un pin puede tener dos: anillo y punto central). */
export interface CapaPin {
  forma: FormaPin;
  /** Radio del círculo o semidiagonal del rombo (px). */
  radio: number;
  borde: string;
  grosor: number;
  relleno: string;
  /** Trazo discontinuo (SVG `stroke-dasharray`), solo si no está sincronizado. */
  discontinuo?: string;
  /** Sin borde (punto central). */
  sinBorde?: boolean;
}

export function capasPin(v: Vigencia, sincronizado: boolean): CapaPin[] {
  switch (v) {
    case "pendiente":
      return [
        {
          forma: "circulo",
          radio: 9,
          borde: COLOR.white,
          grosor: 2.5,
          relleno: COLOR.pending,
          discontinuo: sincronizado ? undefined : "3 2.5",
        },
      ];
    case "reciente":
      return [
        {
          forma: "circulo",
          radio: 8,
          borde: COLOR.done,
          grosor: 4,
          relleno: COLOR.white,
          discontinuo: sincronizado ? undefined : "4 2.5",
        },
      ];
    case "por-vencer":
      return [
        {
          forma: "circulo",
          radio: 8.5,
          borde: COLOR.aging,
          grosor: 5,
          relleno: COLOR.white,
          discontinuo: sincronizado ? undefined : "4 2.5",
        },
        { forma: "circulo", radio: 3, borde: COLOR.aging, grosor: 0, relleno: COLOR.aging, sinBorde: true },
      ];
    case "vencido":
      return [
        {
          forma: "rombo",
          radio: 11,
          borde: COLOR.white,
          grosor: 2.5,
          relleno: COLOR.stale,
          discontinuo: sincronizado ? undefined : "3 2.5",
        },
      ];
  }
}

/**
 * Orden de dibujo: lo más urgente encima. Atendidos recientes abajo, luego por
 * vencer, vencidos y, arriba de todo, los pendientes.
 */
export const ORDEN_DIBUJO: Record<Vigencia, number> = {
  reciente: 0,
  "por-vencer": 1,
  vencido: 2,
  pendiente: 3,
};
