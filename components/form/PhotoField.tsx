"use client";

import { Camera, ImageIcon, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { compressImage, ImageCompressionError, MENSAJES_FOTO } from "@/lib/compress-image";
import { urlSegura } from "@/components/sheet/format";
import { getFotoPendiente, getFotoUrl } from "@/lib/sync";

export interface PhotoFieldProps {
  /** Id del reporte guardado (para buscar una foto pendiente en el outbox). */
  reporteId?: string;
  /** URL pública de la foto ya subida, si la hay. */
  fotoUrl?: string | null;
  /** Ruta en Storage de la foto ya subida, si la hay. */
  fotoPath?: string | null;
  /** Foto nueva ya comprimida (o `null`). */
  value: Blob | null;
  onChange: (foto: Blob | null) => void;
}

type Guardada =
  | { origen: "local"; url: string }
  /** `resuelta: false` mientras se pide la URL firmada a Storage. */
  | { origen: "servidor"; url: string | null; resuelta: boolean }
  | null;

function tamanoKb(blob: Blob): number {
  return Math.max(1, Math.round(blob.size / 1024));
}

function objectUrl(blob: Blob): string | null {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
}

/**
 * Foto opcional de la vivienda: cámara trasera o galería, compresión a JPEG
 * (1200 px, 0.72) y vista previa. Muestra si el reporte ya tiene foto guardada.
 */
export function PhotoField({ reporteId, fotoUrl, fotoPath, value, onChange }: PhotoFieldProps) {
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const estadoId = useId();
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const [guardada, setGuardada] = useState<Guardada>(null);
  const [previewNueva, setPreviewNueva] = useState<string | null>(null);

  // Foto ya guardada: primero la pendiente en este celular; si no, la del servidor
  // (URL firmada del bucket privado o la `foto_url` heredada, vía getFotoUrl).
  useEffect(() => {
    let cancelado = false;
    let url: string | null = null;
    (async () => {
      const pendiente = reporteId ? await getFotoPendiente(reporteId).catch(() => undefined) : undefined;
      if (cancelado) return;
      if (pendiente) {
        url = objectUrl(pendiente);
        setGuardada(url ? { origen: "local", url } : { origen: "servidor", url: null, resuelta: true });
      } else if (fotoUrl || fotoPath) {
        setGuardada({ origen: "servidor", url: null, resuelta: false });
        const remota = reporteId
          ? await getFotoUrl({ id: reporteId, foto_path: fotoPath ?? null, foto_url: fotoUrl ?? null }).catch(
              () => null,
            )
          : (fotoUrl ?? null);
        if (cancelado) return;
        // Las URL `blob:` las crea y libera getFotoUrl; las demás, solo http(s).
        const segura = remota?.startsWith("blob:") ? remota : urlSegura(remota);
        setGuardada({ origen: "servidor", url: segura, resuelta: true });
      } else {
        setGuardada(null);
      }
    })();
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [reporteId, fotoUrl, fotoPath]);

  // Vista previa de la foto nueva: la URL se crea al elegirla y se libera al cambiarla o al desmontar.
  const previewRef = useRef<string | null>(null);
  const ponerPreview = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewNueva(url);
  };
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const elegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Permite volver a elegir el mismo archivo.
    e.target.value = "";
    if (!file) return;
    setProcesando(true);
    setMensaje({ texto: "Optimizando foto…", error: false });
    try {
      const blob = await compressImage(file);
      ponerPreview(objectUrl(blob));
      onChange(blob);
      setMensaje({ texto: `Foto lista para guardar (${tamanoKb(blob)} KB).`, error: false });
    } catch (err) {
      const texto = err instanceof ImageCompressionError ? err.message : MENSAJES_FOTO.noSePudoProcesar;
      setMensaje({ texto, error: true });
    } finally {
      setProcesando(false);
    }
  };

  const quitarNueva = () => {
    ponerPreview(null);
    onChange(null);
    setMensaje(null);
  };

  const preview = (value ? previewNueva : null) ?? guardada?.url ?? null;
  const estadoGuardada =
    guardada?.origen === "local"
      ? "Foto guardada en este celular."
      : guardada?.origen === "servidor" && guardada.resuelta && !guardada.url
        ? "Foto guardada. Necesitas conexión para verla."
        : guardada
          ? "Foto guardada."
          : null;
  const textoEstado = mensaje?.texto ?? (value ? null : estadoGuardada);

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={elegir}
        data-testid="foto-camara"
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={elegir}
        data-testid="foto-galeria"
      />

      {preview && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-white">
          {/* URL blob: o de Storage: next/image no aporta nada y no admite blob:. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={value ? "Vista previa de la foto nueva de la vivienda" : "Foto guardada de la vivienda"}
            className="size-full object-cover"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 [&>button]:min-h-20 [&>button]:flex-col [&>button]:gap-1 [&>button]:py-2">
        <Button
          variant="secondary"
          disabled={procesando}
          onClick={() => camaraRef.current?.click()}
          aria-describedby={textoEstado ? estadoId : undefined}
        >
          <Camera aria-hidden="true" className="size-5" />
          Tomar foto
        </Button>
        <Button
          variant="secondary"
          disabled={procesando}
          onClick={() => galeriaRef.current?.click()}
          aria-describedby={textoEstado ? estadoId : undefined}
        >
          <ImageIcon aria-hidden="true" className="size-5" />
          Elegir de la galería
        </Button>
      </div>

      {/* La región de estado siempre está montada (para que se anuncie); vacía solo suma el hueco del gap. */}
      <div className="-mt-1 flex items-center justify-between gap-3">
        <p
          id={estadoId}
          role="status"
          className={mensaje?.error ? "text-sm font-semibold text-pending" : "text-sm text-ink-soft"}
        >
          {textoEstado}
        </p>
        {value && !procesando && (
          <Button variant="ghost" onClick={quitarNueva} className="-mr-2 shrink-0 text-pending">
            <Trash2 aria-hidden="true" className="size-5" />
            Quitar foto nueva
          </Button>
        )}
      </div>
    </div>
  );
}
