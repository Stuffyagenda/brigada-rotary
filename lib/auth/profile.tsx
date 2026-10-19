"use client";

/**
 * Perfil del usuario con sesión: nombre, club y rol.
 *
 * ESTADO: implementación mínima. Lee el perfil y su club con el cliente de
 * Supabase del navegador al montar y al cambiar la sesión.
 * TODO(auth-admin): caché offline del perfil, manejo de miembro desactivado y
 * sesión caducada, SIN cambiar la forma de `useProfile()`.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Club, Profile } from "@/lib/types";

export interface ProfileContextValue {
  profile: Profile | null;
  club: Club | null;
  /** Perfil activo con rol `admin`. */
  isAdmin: boolean;
  /** `true` mientras se carga el perfil. */
  loading: boolean;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  club: null,
  isAdmin: false,
  loading: false,
});

interface LoadedProfile {
  profile: Profile | null;
  club: Club | null;
}

async function loadProfile(): Promise<LoadedProfile> {
  const supabase = getSupabaseBrowserClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { profile: null, club: null };

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile) return { profile: null, club: null };

  let club: Club | null = null;
  if (profile.club_id) {
    const { data } = await supabase.from("clubs").select("*").eq("id", profile.club_id).maybeSingle();
    club = (data as Club | null) ?? null;
  }
  return { profile: profile as Profile, club };
}

/** Provee el perfil del usuario actual a la app. Montar en el layout `(app)`. */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProfileContextValue>(() => ({
    profile: null,
    club: null,
    isAdmin: false,
    // Sin variables de entorno no hay nada que cargar.
    loading: hasSupabaseEnv(),
  }));

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    let cancelled = false;
    const refresh = () => {
      loadProfile()
        .then(({ profile, club }) => {
          if (cancelled) return;
          setState({
            profile,
            club,
            isAdmin: Boolean(profile?.activo && profile.rol === "admin"),
            loading: false,
          });
        })
        .catch(() => {
          // Sin red: se mantiene lo último conocido.
          if (!cancelled) setState((s) => ({ ...s, loading: false }));
        });
    };
    refresh();
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") refresh();
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return <ProfileContext.Provider value={state}>{children}</ProfileContext.Provider>;
}

/**
 * Perfil, club y rol del usuario actual.
 * Fuera de `ProfileProvider` devuelve un perfil vacío (`isAdmin: false`).
 */
export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}
