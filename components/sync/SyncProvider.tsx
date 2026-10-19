"use client";

import { useEffect, type ReactNode } from "react";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { startSyncEngine } from "@/lib/sync";

export interface SyncProviderProps {
  children?: ReactNode;
}

/**
 * Arranca el motor de sincronización (y registra el service worker) al montarse
 * en el cliente. Montar una vez en el layout de las rutas con sesión `(app)`.
 * Es seguro montarlo más de una vez: el motor es único.
 */
export function SyncProvider({ children }: SyncProviderProps) {
  useEffect(() => startSyncEngine(), []);
  return (
    <>
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
