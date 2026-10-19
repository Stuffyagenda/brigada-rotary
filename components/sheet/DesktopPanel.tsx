"use client";

/**
 * Escritorio (≥ 1024 px): el panel inferior se convierte en una columna fija a
 * la izquierda de 420 px, con el mismo contenido.
 */
import { List } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import "./sheet.css";

export interface DesktopPanelProps {
  titulo: string;
  /** Filtros (chips de estado y panel "Filtros"). */
  filtros: ReactNode;
  vistaKey: string;
  /** El contenido gestiona su propio scroll, márgenes y barra al pie (el formulario). */
  contenidoPropio?: boolean;
  children: ReactNode;
}

export function DesktopPanel({ titulo, filtros, vistaKey, contenidoPropio = false, children }: DesktopPanelProps) {
  return (
    <aside
      aria-label={titulo}
      className="relative z-20 flex h-dvh w-[420px] shrink-0 flex-col border-r border-line bg-paper"
    >
      <header className="flex shrink-0 flex-col gap-4 border-b border-line px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2.5 text-lg font-bold">
            <Image src="/icons/brigada-rotary.svg" alt="" width={32} height={32} className="size-8" priority />
            Brigada Rotary
          </p>
          <Link
            href="/registros"
            className="-mr-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold text-rotary hover:bg-ink/5"
          >
            <List aria-hidden="true" className="size-5" />
            Registros
          </Link>
        </div>
        {filtros}
      </header>
      <div
        className={cn(
          "min-h-0 flex-1 overscroll-contain",
          contenidoPropio ? "flex flex-col overflow-hidden" : "overflow-y-auto px-5 pt-5 pb-10",
        )}
      >
        <div key={vistaKey} className={cn("sheet-fade", contenidoPropio && "flex min-h-0 flex-1 flex-col")}>
          {children}
        </div>
      </div>
    </aside>
  );
}
