import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Barlow_Condensed } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  // Google Fonts no publica métricas de ajuste para esta familia.
  adjustFontFallback: false,
  fallback: ["system-ui", "Arial", "sans-serif"],
});

// Solo para el sello de estado y los conteos grandes.
const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  weight: "600",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Brigada Rotary",
    template: "%s | Brigada Rotary",
  },
  description: "Registro y coordinación de la atención a familias afectadas.",
  applicationName: "Brigada Rotary",
  appleWebApp: {
    capable: true,
    title: "Brigada Rotary",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/brigada-rotary.svg", type: "image/svg+xml" },
      { url: "/icons/brigada-rotary-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/brigada-rotary-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17458F",
  // Solo tema claro: el navegador no debe invertir los colores.
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-PA" className={`${atkinson.variable} ${barlow.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        {children}
        <Toaster position="bottom-center" theme="light" closeButton={false} richColors={false} />
      </body>
    </html>
  );
}
