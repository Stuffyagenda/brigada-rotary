/**
 * Compresión de la foto de la vivienda antes de guardarla: lado mayor de
 * 1200 px como máximo, JPEG con calidad 0.72.
 */

export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const MAX_DIMENSION = 1200;
export const JPEG_QUALITY = 0.72;

/** Error con un mensaje listo para mostrar al usuario. */
export class ImageCompressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageCompressionError";
  }
}

export const MENSAJES_FOTO = {
  noEsImagen: "El archivo seleccionado no es una imagen.",
  muyGrande: "La imagen original supera 15 MB. Selecciona otra más pequeña.",
  noSePudoLeer: "No se pudo leer la imagen.",
  noSePudoProcesar: "No se pudo procesar la imagen.",
} as const;

/** Tamaño final manteniendo la proporción, sin ampliar imágenes pequeñas. */
export function scaledSize(
  width: number,
  height: number,
  maxDim: number = MAX_DIMENSION,
): { width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Valida tipo y tamaño. @throws ImageCompressionError */
export function validateImageFile(file: Blob): void {
  if (!file.type || !file.type.startsWith("image/")) {
    throw new ImageCompressionError(MENSAJES_FOTO.noEsImagen);
  }
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new ImageCompressionError(MENSAJES_FOTO.muyGrande);
  }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageCompressionError(MENSAJES_FOTO.noSePudoLeer));
    };
    img.src = url;
  });
}

/**
 * Comprime una imagen a JPEG (máx. 1200 px, calidad 0.72).
 * Solo en el navegador (usa canvas).
 * @throws ImageCompressionError con un mensaje para el usuario.
 */
export async function compressImage(file: Blob): Promise<Blob> {
  validateImageFile(file);
  const img = await loadImage(file);
  const { width, height } = scaledSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageCompressionError(MENSAJES_FOTO.noSePudoProcesar);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new ImageCompressionError(MENSAJES_FOTO.noSePudoProcesar);
  return blob;
}
