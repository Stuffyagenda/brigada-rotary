"use client";

/**
 * Perfil del usuario con sesión: nombre, club y rol.
 *
 * - Lee la sesión de Supabase (cookies) y el perfil con su club.
 * - Guarda el perfil en Dexie (`meta` → `perfil`) para funcionar sin señal.
 * - Sin señal, si hay una sesión guardada en el dispositivo, usa la caché
 *   (`offline: true`) en lugar de cerrar la sesión.
 * - Escucha `onAuthStateChange` y el evento `online` para mantenerse al día.
 *
 * La forma pública `{ profile, club, isAdmin, loading }` es un contrato con el
 * resto de la app; los demás campos son añadidos.
 */
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isNetworkError } from "@/lib/auth/errors";
import { clearPerfilCache, readPerfilCache, writePerfilCache } from "@/lib/auth/profile-cache";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseBrowserClient, type TypedSupabaseClient } from "@/lib/supabase/client";
import { limpiarEspejoLocal } from "@/lib/sync";
import type { Club, Profile } from "@/lib/types";

/** `loading`: aún no se sabe; `signed-in`: hay sesión (o sesión guardada sin señal); `signed-out`: no hay sesión. */
export type SessionStatus = "loading" | "signed-in" | "signed-out";

export interface ProfileContextValue {
  profile: Profile | null;
  club: Club | null;
  /** Perfil activo con rol `admin`. */
  isAdmin: boolean;
  /** `true` mientras se carga el perfil. */
  loading: boolean;
  /** Estado de la sesión (lo usa el guard del layout `(app)`). */
  status: SessionStatus;
  /**
   * Sesión de Supabase. Puede ser `null` con `status: 'signed-in'` cuando no hay
   * señal y el token guardado no se pudo refrescar.
   */
  session: Session | null;
  /** Correo del propio usuario (de su sesión o de la caché). */
  email: string | null;
  /** `true` si el perfil viene de la caché local y no se pudo confirmar con el servidor. */
  offline: boolean;
  /** Vuelve a leer la sesión y el perfil. */
  refresh: () => Promise<void>;
  /** Cierra la sesión en este dispositivo y borra la caché del perfil. No borra la cola de sync. */
  signOut: () => Promise<void>;
}

/** Estado de autenticación sin las acciones. */
export type ProfileSnapshot = Omit<ProfileContextValue, "isAdmin" | "loading" | "refresh" | "signOut">;

const SNAPSHOT_SIGNED_OUT: ProfileSnapshot = {
  status: "signed-out",
  session: null,
  profile: null,
  club: null,
  email: null,
  offline: false,
};

const SNAPSHOT_LOADING: ProfileSnapshot = { ...SNAPSHOT_SIGNED_OUT, status: "loading" };

const noop = async () => {};

const ProfileContext = createContext<ProfileContextValue>({
  ...SNAPSHOT_SIGNED_OUT,
  isAdmin: false,
  loading: false,
  refresh: noop,
  signOut: noop,
});

/** `true` si el perfil es de un admin activo. */
export function esAdminActivo(profile: Profile | null): boolean {
  return Boolean(profile?.activo && profile.estado_aprobacion === "aprobado" && profile.rol === "admin");
}

async function fetchProfile(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<{ profile: Profile | null; club: Club | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, club:clubs(*)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { profile: null, club: null };
  const { club, ...profile } = data;
  // Un miembro inactivo no puede leer clubs (RLS): `club` llega como null.
  return { profile: profile as Profile, club: (club as Club | null) ?? null };
}

/**
 * Resuelve sesión y perfil. Nunca lanza.
 * - Con sesión y red: perfil del servidor (y se guarda en caché).
 * - Con sesión sin red: perfil de la caché si es del mismo usuario.
 * - Sin sesión por falta de red (token caducado sin poder refrescar): caché, `offline: true`.
 * - Sin sesión: `signed-out` y se borra la caché.
 */
export async function resolveProfileSnapshot(supabase: TypedSupabaseClient): Promise<ProfileSnapshot> {
  let session: Session | null = null;
  let sessionError: unknown = null;
  try {
    const result = await supabase.auth.getSession();
    session = result.data.session;
    sessionError = result.error;
  } catch (error) {
    sessionError = error;
  }

  if (!session) {
    if (sessionError && isNetworkError(sessionError)) {
      // Hay una sesión guardada que no se pudo refrescar por falta de señal: se deja pasar.
      const cached = await readPerfilCache();
      return {
        status: "signed-in",
        session: null,
        profile: cached?.profile ?? null,
        club: cached?.club ?? null,
        email: cached?.email ?? null,
        offline: true,
      };
    }
    await clearPerfilCache();
    return SNAPSHOT_SIGNED_OUT;
  }

  const userId = session.user.id;
  const email = session.user.email ?? null;
  try {
    const { profile, club } = await fetchProfile(supabase, userId);
    if (profile) {
      await writePerfilCache({ userId, email, profile, club, savedAt: new Date().toISOString() });
    } else {
      await clearPerfilCache();
    }
    return { status: "signed-in", session, profile, club, email, offline: false };
  } catch {
    const cached = await readPerfilCache();
    const propio = cached && cached.userId === userId ? cached : null;
    return {
      status: "signed-in",
      session,
      profile: propio?.profile ?? null,
      club: propio?.club ?? null,
      email,
      offline: true,
    };
  }
}

/**
 * Combina una lectura nueva con el estado previo: si la lectura no pudo
 * confirmar el perfil por falta de red, se conserva lo último conocido del
 * mismo usuario en lugar de dejar `profile: null` (e `isAdmin: false`).
 */
export function mergeSnapshot(prev: ProfileSnapshot, next: ProfileSnapshot): ProfileSnapshot {
  if (next.status !== "signed-in" || !next.offline || next.profile || !prev.profile) return next;
  const nextUserId = next.session?.user.id;
  if (nextUserId && nextUserId !== prev.profile.id) return next;
  return { ...next, profile: prev.profile, club: prev.club, email: next.email ?? prev.email };
}

/** Provee el perfil del usuario actual a la app. Montar en el layout `(app)`. */
export function ProfileProvider({ children }: { children: ReactNode }) {
  // Sin variables de entorno no hay nada que cargar.
  const [snapshot, setSnapshot] = useState<ProfileSnapshot>(() =>
    hasSupabaseEnv() ? SNAPSHOT_LOADING : SNAPSHOT_SIGNED_OUT,
  );
  // Solo se aplica el resultado de la lectura más reciente.
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!hasSupabaseEnv()) return;
    const id = ++seq.current;
    const next = await resolveProfileSnapshot(getSupabaseBrowserClient());
    if (id === seq.current) setSnapshot((prev) => mergeSnapshot(prev, next));
  }, []);

  const signOut = useCallback(async () => {
    seq.current++;
    if (hasSupabaseEnv()) {
      try {
        // `local`: solo este dispositivo. Sin red también borra la sesión guardada.
        await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
      } catch {
        // Se sigue: la caché local se borra igual.
      }
    }
    await clearPerfilCache();
    // Celulares compartidos: no dejar los datos de las familias ya sincronizados.
    // La cola y los reportes pendientes se conservan.
    try {
      await limpiarEspejoLocal();
    } catch {
      // IndexedDB no disponible: no impide cerrar sesión.
    }
    seq.current++;
    setSnapshot(SNAPSHOT_SIGNED_OUT);
  }, []);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    let active = true;

    // Mientras se confirma la sesión, se muestra lo último conocido.
    readPerfilCache().then((cached) => {
      if (!active || !cached) return;
      setSnapshot((s) =>
        s.status === "loading"
          ? { ...s, profile: cached.profile, club: cached.club, email: cached.email }
          : s,
      );
    });

    void refresh();

    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        seq.current++;
        void clearPerfilCache();
        setSnapshot(SNAPSHOT_SIGNED_OUT);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        // Fuera del callback: no se llama a Supabase mientras tiene el lock de auth.
        setTimeout(() => {
          if (active) void refresh();
        }, 0);
      }
    });

    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      ...snapshot,
      isAdmin: esAdminActivo(snapshot.profile),
      loading: snapshot.status === "loading",
      refresh,
      signOut,
    }),
    [snapshot, refresh, signOut],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

/**
 * Perfil, club y rol del usuario actual.
 * Fuera de `ProfileProvider` devuelve un perfil vacío (`isAdmin: false`).
 */
export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}
