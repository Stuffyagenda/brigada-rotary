"use client";

import { useEffect, useState } from "react";
import { leerVersionVista, marcarVersionVista, novedadesDe } from "@/lib/novedades";
import { APP_VERSION } from "@/lib/version";
import { NovedadesDialog } from "./NovedadesDialog";

/**
 * Tras actualizar la app, muestra una vez por celular las novedades de la
 * versión actual (si tiene). Sin versión vista guardada también se muestra:
 * así quien venía de una versión anterior las ve al llegar a esta.
 * No renderiza nada si no hay novedades que mostrar.
 */
export function AvisoNovedades() {
  const novedades = novedadesDe(APP_VERSION);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!novedades) return;
    let vivo = true;
    void leerVersionVista().then((vista) => {
      if (vivo && vista !== novedades.version) setOpen(true);
    });
    return () => {
      vivo = false;
    };
  }, [novedades]);

  if (!novedades) return null;
  return (
    <NovedadesDialog
      open={open}
      novedades={novedades}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) void marcarVersionVista(novedades.version);
      }}
    />
  );
}
