import { describe, expect, it } from "vitest";
import {
  compressImage,
  ImageCompressionError,
  MAX_ORIGINAL_BYTES,
  MENSAJES_FOTO,
  scaledSize,
  validateImageFile,
} from "@/lib/compress-image";

describe("scaledSize", () => {
  it("reduce el lado mayor a 1200 px manteniendo la proporción", () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1200, height: 900 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 900, height: 1200 });
  });

  it("no amplía imágenes pequeñas", () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("nunca devuelve 0 px", () => {
    expect(scaledSize(10000, 1)).toEqual({ width: 1200, height: 1 });
  });
});

describe("validateImageFile", () => {
  it("rechaza archivos que no son imagen", () => {
    const pdf = new Blob(["x"], { type: "application/pdf" });
    expect(() => validateImageFile(pdf)).toThrow(MENSAJES_FOTO.noEsImagen);
    expect(() => validateImageFile(pdf)).toThrow(ImageCompressionError);
  });

  it("rechaza imágenes de más de 15 MB", () => {
    const grande = { type: "image/jpeg", size: MAX_ORIGINAL_BYTES + 1 } as Blob;
    expect(() => validateImageFile(grande)).toThrow(MENSAJES_FOTO.muyGrande);
  });

  it("acepta imágenes válidas", () => {
    expect(() => validateImageFile(new Blob(["x"], { type: "image/png" }))).not.toThrow();
  });

  it("compressImage rechaza antes de procesar", async () => {
    await expect(compressImage(new Blob(["x"], { type: "text/plain" }))).rejects.toThrow(
      MENSAJES_FOTO.noEsImagen,
    );
  });
});
