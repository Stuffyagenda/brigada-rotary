import { Suspense } from "react";
import { MapScreen } from "@/components/map/MapScreen";

/**
 * Pantalla principal: mapa con panel (resumen, ficha o formulario).
 * MapScreen lee la URL con useSearchParams; el Suspense permite prerenderizar
 * el resto y pinta el fondo del mapa mientras tanto.
 */
export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-dvh w-full bg-map-bg" aria-hidden="true" />}>
      <MapScreen />
    </Suspense>
  );
}
