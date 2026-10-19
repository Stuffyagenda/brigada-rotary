"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { authSwitchHref, type LOGIN_PATH, type REGISTRO_PATH } from "@/lib/auth/redirect";

const sinSuscripcion = () => () => {};
const searchCliente = () => window.location.search;
// En el HTML estático (prerender) no hay query: el enlace va sin `next`.
const searchServidor = () => "";

export interface AuthSwitchLinkProps {
  to: typeof LOGIN_PATH | typeof REGISTRO_PATH;
  /** Texto antes del enlace, p. ej. "¿No tienes cuenta?". */
  prompt: string;
  children: ReactNode;
}

/**
 * "¿No tienes cuenta? Crear cuenta" / "¿Ya tienes cuenta? Entrar".
 * Conserva el `?next=` interno de la URL actual (leído en el cliente, la página es estática).
 */
export function AuthSwitchLink({ to, prompt, children }: AuthSwitchLinkProps) {
  const search = useSyncExternalStore(sinSuscripcion, searchCliente, searchServidor);
  return (
    <p className="text-ink-soft">
      {prompt}{" "}
      <Link
        href={authSwitchHref(to, search)}
        className="inline-flex min-h-11 items-center font-semibold text-rotary underline-offset-4 hover:underline"
      >
        {children}
      </Link>
    </p>
  );
}
