"use client";

/**
 * Hooks de la pantalla del mapa: media queries, movimiento reducido y lista de
 * clubes (Supabase, cacheada para usarla sin conexión).
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReporteLocal } from "@/lib/db";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Media queries
// ---------------------------------------------------------------------------

/** `true` si la media query se cumple. En el servidor, `false`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Escritorio: el panel pasa a ser una columna fija a la izquierda. */
export const QUERY_ESCRITORIO = "(min-width: 1024px)";

export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

// ---------------------------------------------------------------------------
// Clubes
// ---------------------------------------------------------------------------

export interface ClubOpcion {
  id: string;
  nombre: string;
}

const CLAVE_CACHE = "brigada-rotary:clubs";
const VACIO: ClubOpcion[] = [];
let cache: ClubOpcion[] | null = null;
let pedido: Promise<void> | null = null;
const oyentes = new Set<() => void>();

function leerCache(): ClubOpcion[] {
  if (cache) return cache;
  try {
    const crudo = window.localStorage.getItem(CLAVE_CACHE);
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    cache = Array.isArray(datos)
      ? datos.filter(
          (c): c is ClubOpcion => typeof c?.id === "string" && typeof c?.nombre === "string",
        )
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function guardarCache(clubs: ClubOpcion[]): void {
  cache = clubs;
  try {
    window.localStorage.setItem(CLAVE_CACHE, JSON.stringify(clubs));
  } catch {
    // Almacenamiento bloqueado: se mantiene en memoria.
  }
  oyentes.forEach((cb) => cb());
}

function suscribir(cb: () => void): () => void {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}

/**
 * Descarga los clubes una vez por sesión (con conexión y variables de entorno).
 * Si falla, se olvida el pedido para reintentar en la siguiente llamada.
 */
function refrescarClubs(): Promise<void> {
  if (pedido) return pedido;
  if (!hasSupabaseEnv() || !navigator.onLine) return Promise.resolve();
  pedido = (async () => {
    try {
      const { data, error } = await getSupabaseBrowserClient()
        .from("clubs")
        .select("id, nombre")
        .order("nombre");
      if (error || !data) {
        // Error del servidor: se permite reintentar en la próxima llamada.
        pedido = null;
        return;
      }
      guardarCache(data.map((c) => ({ id: c.id, nombre: c.nombre })));
    } catch {
      // Sin red: se usa la caché o lo deducido de los reportes, y se reintenta después.
      pedido = null;
    }
  })();
  return pedido;
}

/** Nombre provisional de un club que aún no se conoce (sin conexión). */
export function nombreProvisionalClub(id: string): string {
  return `Club ${id.slice(0, 8)}`;
}

export interface ClubesInfo {
  /** Clubes con reportes (o todos, si aún no hay reportes), para el filtro. */
  opciones: ClubOpcion[];
  /** id → nombre, para la ficha. */
  nombres: Map<string, string>;
}

/**
 * Clubes para el filtro y la ficha: la lista de Supabase (cacheada) más los
 * clubes que aparecen en los reportes locales y aún no se conocen (sin conexión).
 */
export function useClubs(reportes: readonly Pick<ReporteLocal, "club_id">[]): ClubesInfo {
  const conocidos = useSyncExternalStore(suscribir, leerCache, () => VACIO);

  useEffect(() => {
    const refrescar = () => void refrescarClubs();
    refrescar();
    // Si falló sin señal, se reintenta al volver la conexión.
    window.addEventListener("online", refrescar);
    return () => window.removeEventListener("online", refrescar);
  }, []);

  return useMemo(() => {
    const nombres = new Map(conocidos.map((c) => [c.id, c.nombre]));
    const usados = new Set<string>();
    for (const r of reportes) {
      if (!r.club_id) continue;
      usados.add(r.club_id);
      if (!nombres.has(r.club_id)) nombres.set(r.club_id, nombreProvisionalClub(r.club_id));
    }
    const todos = [...nombres].map(([id, nombre]) => ({ id, nombre }));
    const opciones = usados.size > 0 ? todos.filter((c) => usados.has(c.id)) : todos;
    opciones.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return { opciones, nombres };
  }, [conocidos, reportes]);
}
