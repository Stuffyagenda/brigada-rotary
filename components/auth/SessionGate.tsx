"use client";

import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { useProfile, type ProfileContextValue } from "@/lib/auth/profile";
import { LOGIN_PATH, loginUrl } from "@/lib/auth/redirect";
import { hasSupabaseEnv } from "@/lib/env";

/** Qué muestra el guard según el estado de la sesión. Función pura. */
export type GateView = "loading" | "redirect" | "pending" | "rejected" | "inactive" | "no-profile" | "app";

export function gateView({
  status,
  profile,
  offline,
}: Pick<ProfileContextValue, "status" | "profile" | "offline">): GateView {
  if (status === "signed-out") return "redirect";
  if (profile?.estado_aprobacion === "pendiente") return "pending";
  if (profile?.estado_aprobacion === "rechazado") return "rejected";
  if (profile && !profile.activo) return "inactive";
  // Mientras se confirma la sesión, se entra con el perfil guardado (offline-first).
  if (status === "loading") return profile ? "app" : "loading";
  // Con red y sesión pero sin perfil: usuario borrado o perfil sin crear.
  if (!profile) return offline ? "loading" : "no-profile";
  return "app";
}

function AccessBlocked({ title, body }: { title: string; body: string }) {
  const { signOut } = useProfile();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <AuthCard tone="pending">
        <h1 className="mb-2 text-xl font-bold">{title}</h1>
        <p className="mb-6 text-ink-soft">{body}</p>
        <Button
          variant="secondary"
          size="lg"
          block
          aria-disabled={pending}
          onClick={async () => {
            if (pending) return;
            setPending(true);
            await signOut();
            router.replace(LOGIN_PATH);
          }}
        >
          <LogOut aria-hidden="true" size={20} />
          {pending ? "Cerrando sesión…" : "Cerrar sesión"}
        </Button>
      </AuthCard>
    </main>
  );
}

/**
 * Guard de sesión del layout `(app)` (comprobación definitiva en el cliente).
 * - Sin sesión → /login?next=…
 * - Perfil desactivado → pantalla de acceso desactivado.
 * - Sin red pero con sesión guardada → deja pasar.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { status, profile, offline } = useProfile();
  const router = useRouter();
  const pathname = usePathname();
  // Sin variables de Supabase no hay backend que proteger (desarrollo sin .env.local).
  const view = hasSupabaseEnv() ? gateView({ status, profile, offline }) : "app";

  useEffect(() => {
    if (view !== "redirect") return;
    router.replace(loginUrl(`${pathname}${window.location.search}`));
  }, [view, pathname, router]);

  if (view === "app") return <>{children}</>;
  if (view === "pending") {
    return <AccessBlocked title="Tu solicitud está pendiente de aprobación." body="Un administrador revisará tu cuenta. Vuelve a entrar más tarde." />;
  }
  if (view === "rejected") {
    return <AccessBlocked title="Tu solicitud fue rechazada." body="Habla con un administrador de tu club si necesitas que revisen la decisión." />;
  }
  if (view === "inactive") {
    return (
      <AccessBlocked
        title="Tu acceso está desactivado."
        body="Habla con un administrador."
      />
    );
  }
  if (view === "no-profile") {
    return (
      <AccessBlocked
        title="No encontramos tu perfil"
        body="Tu usuario no tiene un perfil de miembro. Habla con un administrador de tu club."
      />
    );
  }
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <p role="status" className="text-ink-soft">
        {view === "redirect" ? "Abriendo el inicio de sesión…" : "Comprobando tu sesión…"}
      </p>
    </main>
  );
}
