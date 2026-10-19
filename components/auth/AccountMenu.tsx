"use client";

import { LogOut, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { InstallButton, useModoInstalacion } from "@/components/pwa/InstallButton";
import { useProfile } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/redirect";
import { cn } from "@/lib/cn";
import { ROL_LABEL, TIPO_CLUB_LABEL } from "@/lib/types";

export interface AccountMenuProps {
  /** Lado del botón al que se alinea el panel. Por defecto `end` (derecha). */
  align?: "start" | "end";
  className?: string;
}

/** Iniciales del nombre (o del correo) para el botón. */
export function initials(nombre: string | null | undefined, email?: string | null): string {
  const base = (nombre ?? "").trim();
  if (base) {
    const partes = base.split(/\s+/).filter(Boolean);
    const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2);
    return letras.toLocaleUpperCase("es");
  }
  const e = (email ?? "").trim();
  return e ? e[0].toLocaleUpperCase("es") : "";
}

/**
 * Menú de cuenta: nombre, club y rol; enlace a Miembros (solo admin), "Instalar app"
 * (o la instrucción de iPhone, si aplica) y Cerrar sesión.
 * Se monta dentro de `ProfileProvider` (layout `(app)`). Sin props obligatorias.
 */
export function AccountMenu({ align = "end", className }: AccountMenuProps) {
  const { profile, club, isAdmin, email, offline, signOut } = useProfile();
  const modoInstalacion = useModoInstalacion();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const panelId = `${id}-panel`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // Se cierra al navegar (patrón "ajustar estado al cambiar una prop", sin efecto).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const nombre = profile?.nombre_completo?.trim() || email || "Tu cuenta";
  const letras = initials(profile?.nombre_completo, email);

  async function onSignOut() {
    if (closing) return;
    setClosing(true);
    await signOut();
    setOpen(false);
    router.replace(LOGIN_PATH);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Cuenta: ${nombre}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex size-11 shrink-0 select-none items-center justify-center rounded-full border border-line bg-white",
          "font-semibold text-rotary shadow-[0_1px_2px_rgb(28_39_51/0.08)]",
          "transition-[scale,border-color] duration-140 ease-out hover:border-ink-soft motion-safe:active:scale-[0.97]",
          open && "border-rotary",
        )}
      >
        {letras ? (
          <span aria-hidden="true" className="text-sm">
            {letras}
          </span>
        ) : (
          <UserRound aria-hidden="true" size={20} />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Tu cuenta"
          className={cn(
            "absolute top-[calc(100%+8px)] z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white p-2",
            "shadow-[0_2px_4px_rgb(28_39_51/0.06),0_12px_32px_-8px_rgb(28_39_51/0.22)]",
            // Entrada desde el botón; sin animación de salida (se cierra al instante).
            "transition-[opacity,scale] duration-140 ease-out starting:scale-96 starting:opacity-0",
            align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
          )}
        >
          <div className="border-b border-line px-3 pt-2 pb-3">
            <p className="truncate font-semibold">{nombre}</p>
            {email && email !== nombre && <p className="truncate text-sm text-ink-soft">{email}</p>}
            <p className="mt-1.5 text-sm text-ink-soft">
              {club ? `${club.nombre} (${TIPO_CLUB_LABEL[club.tipo] ?? club.tipo})` : "Sin club asignado"}
            </p>
            {profile && <p className="text-sm text-ink-soft">{ROL_LABEL[profile.rol] ?? profile.rol}</p>}
            {offline && (
              <p className="mt-1.5 text-sm text-ink-soft">Sin conexión: datos guardados en este celular.</p>
            )}
          </div>
          <ul className="flex flex-col pt-1">
            {isAdmin && (
              <li>
                <Link
                  href="/miembros"
                  aria-current={pathname === "/miembros" ? "page" : undefined}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-base transition-colors duration-140 ease-out hover:bg-ink/5"
                >
                  <Users aria-hidden="true" size={20} className="text-ink-soft" />
                  Miembros
                </Link>
              </li>
            )}
            {modoInstalacion !== "none" && (
              <li>
                <InstallButton variante="menu" />
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={onSignOut}
                aria-disabled={closing}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-base transition-colors duration-140 ease-out hover:bg-ink/5"
              >
                <LogOut aria-hidden="true" size={20} className="text-ink-soft" />
                {closing ? "Cerrando sesión…" : "Cerrar sesión"}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
