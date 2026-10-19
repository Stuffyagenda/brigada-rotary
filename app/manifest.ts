import type { MetadataRoute } from "next";

/** Manifest de la PWA (Next lo sirve en /manifest.webmanifest y lo enlaza en el <head>). */
export default function manifest(): MetadataRoute.Manifest {
  const iconos = [
    { src: "/icons/brigada-rotary-192.png", sizes: "192x192" },
    { src: "/icons/brigada-rotary-512.png", sizes: "512x512" },
  ] as const;

  return {
    id: "/",
    name: "Brigada Rotary",
    short_name: "Brigada Rotary",
    description: "Registro y coordinación de la atención a familias afectadas.",
    lang: "es-PA",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#17458F",
    background_color: "#F4F6F8",
    prefer_related_applications: false,
    // El tipo de Next no admite "any maskable" en un solo icono: se declara cada propósito.
    icons: iconos.flatMap(({ src, sizes }) => [
      { src, sizes, type: "image/png", purpose: "any" as const },
      { src, sizes, type: "image/png", purpose: "maskable" as const },
    ]),
  };
}
