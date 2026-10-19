/**
 * URL para mostrar la foto de un reporte, venga de donde venga:
 * 1. foto pendiente en el celular (outbox) → URL `blob:`;
 * 2. `foto_path` en el bucket privado → URL firmada (1 h, en caché de memoria);
 * 3. `foto_url` heredada (Google Drive) → esa URL.
 */
import { db } from "@/lib/db";
import { BUCKET_FOTOS, getSyncClient } from "@/lib/sync/client";
import type { OutboxEntrySync } from "@/lib/sync/outbox";
import type { Reporte } from "@/lib/types";

/** Validez de las URL firmadas, en segundos. */
const FIRMA_SEGUNDOS = 3600;
/** Se renueva la firma si le quedan menos de 5 minutos. */
const MARGEN_MS = 5 * 60_000;

const firmadas = new Map<string, { url: string; expira: number }>();
const locales = new Map<string, { clave: string; url: string }>();

function urlLocal(reporteId: string, entry: OutboxEntrySync, foto: Blob): string | null {
  if (typeof URL.createObjectURL !== "function") return null;
  const clave = `${entry.seq}:${entry.fotoRev ?? entry.rev ?? 0}`;
  const previa = locales.get(reporteId);
  if (previa?.clave === clave) return previa.url;
  if (previa && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previa.url);
  const url = URL.createObjectURL(foto);
  locales.set(reporteId, { clave, url });
  return url;
}

async function urlFirmada(path: string): Promise<string | null> {
  const cache = firmadas.get(path);
  if (cache && cache.expira - Date.now() > MARGEN_MS) return cache.url;
  const client = getSyncClient();
  if (!client) return null;
  try {
    const { data, error } = await client.storage.from(BUCKET_FOTOS).createSignedUrl(path, FIRMA_SEGUNDOS);
    if (error || !data?.signedUrl) return cache?.url ?? null;
    firmadas.set(path, { url: data.signedUrl, expira: Date.now() + FIRMA_SEGUNDOS * 1000 });
    return data.signedUrl;
  } catch {
    // Sin red: se usa la firma anterior aunque esté por vencer.
    return cache?.url ?? null;
  }
}

/**
 * URL de la foto de un reporte, o `null` si no tiene (o no se puede obtener sin red).
 * La URL `blob:` de una foto pendiente se reutiliza mientras la foto no cambie.
 */
export async function getFotoUrl(
  reporte: Pick<Reporte, "id" | "foto_path" | "foto_url">,
): Promise<string | null> {
  const entradas = (await db.outbox.where("reporteId").equals(reporte.id).sortBy("seq")) as OutboxEntrySync[];
  for (let i = entradas.length - 1; i >= 0; i--) {
    const foto = entradas[i].foto;
    if (foto) return urlLocal(reporte.id, entradas[i], foto);
  }
  if (reporte.foto_path) {
    const url = await urlFirmada(reporte.foto_path);
    if (url) return url;
  }
  return reporte.foto_url || null;
}

/** Olvida las URL en caché de un reporte (p. ej. al borrarlo). */
export function olvidarFoto(reporteId: string, fotoPath?: string | null): void {
  const local = locales.get(reporteId);
  if (local && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(local.url);
  locales.delete(reporteId);
  if (fotoPath) firmadas.delete(fotoPath);
}

/** Olvida todas las URL en caché (al cerrar sesión y en los tests). */
export function limpiarCacheFotos(): void {
  if (typeof URL.revokeObjectURL === "function") {
    for (const { url } of locales.values()) URL.revokeObjectURL(url);
  }
  firmadas.clear();
  locales.clear();
}
