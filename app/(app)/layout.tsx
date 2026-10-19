import { SessionGate } from "@/components/auth/SessionGate";
import { SyncProvider } from "@/components/sync/SyncProvider";
import { ProfileProvider } from "@/lib/auth/profile";

// La sesión la comprueban `proxy.ts` (con red, en el servidor) y `SessionGate`
// (siempre, en el cliente; deja pasar sin señal si hay sesión guardada).
// `SyncProvider` arranca el motor de sincronización y registra el service worker.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ProfileProvider>
      <SessionGate>
        <SyncProvider>{children}</SyncProvider>
      </SessionGate>
    </ProfileProvider>
  );
}
