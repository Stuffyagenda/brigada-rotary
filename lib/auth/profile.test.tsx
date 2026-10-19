import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  esAdminActivo,
  mergeSnapshot,
  ProfileProvider,
  resolveProfileSnapshot,
  useProfile,
  type ProfileSnapshot,
} from "@/lib/auth/profile";
import { readPerfilCache, writePerfilCache } from "@/lib/auth/profile-cache";
import { db, type ReporteLocal } from "@/lib/db";
import { filaRemota } from "@/lib/sync/testing/fake-supabase";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import type { Club, Profile } from "@/lib/types";

const profile: Profile = {
  id: "u1",
  nombre: "Ana",
  apellido: "Pérez",
  nombre_completo: "Ana Pérez",
  club_id: "c1",
  rol: "miembro",
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const club: Club = { id: "c1", nombre: "Rotary Club Panamá", tipo: "rotary", provincia: null, created_at: "x" };

interface FakeOpts {
  session?: { user: { id: string; email?: string } } | null;
  sessionError?: unknown;
  row?: unknown;
  rowError?: unknown;
}

function fakeSupabase({ session = null, sessionError = null, row = null, rowError = null }: FakeOpts) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: rowError }),
  };
  return {
    auth: { getSession: async () => ({ data: { session }, error: sessionError }) },
    from: () => query,
  } as unknown as TypedSupabaseClient;
}

const session = { user: { id: "u1", email: "ana@example.org" } };

// Cliente que usa ProfileProvider (los tests de resolveProfileSnapshot pasan el suyo).
let clienteActual: TypedSupabaseClient;
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => clienteActual }));
vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));

function conAuthListener(client: TypedSupabaseClient): TypedSupabaseClient {
  const c = client as unknown as { auth: Record<string, unknown> };
  c.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
  return client;
}

function Sonda() {
  const { status, isAdmin, offline, profile } = useProfile();
  return (
    <p data-testid="sonda">
      {status}|{String(isAdmin)}|{String(offline)}|{profile?.nombre_completo ?? "-"}
    </p>
  );
}

describe("resolveProfileSnapshot", () => {
  beforeEach(async () => {
    await db.meta.clear();
  });

  it("con sesión y red lee el perfil con su club y lo guarda en caché", async () => {
    const snap = await resolveProfileSnapshot(fakeSupabase({ session, row: { ...profile, club } }));
    expect(snap.status).toBe("signed-in");
    expect(snap.offline).toBe(false);
    expect(snap.profile).toEqual(profile);
    expect(snap.club).toEqual(club);
    expect(snap.email).toBe("ana@example.org");
    expect((await readPerfilCache())?.userId).toBe("u1");
  });

  it("con sesión pero sin red usa la caché del mismo usuario", async () => {
    await writePerfilCache({ userId: "u1", email: null, profile, club, savedAt: "x" });
    const snap = await resolveProfileSnapshot(
      fakeSupabase({ session, rowError: { message: "TypeError: Failed to fetch" } }),
    );
    expect(snap).toMatchObject({ status: "signed-in", offline: true, profile, club });
  });

  it("no usa la caché de otro usuario", async () => {
    await writePerfilCache({ userId: "u1", email: null, profile, club, savedAt: "x" });
    const snap = await resolveProfileSnapshot(
      fakeSupabase({ session: { user: { id: "u2" } }, rowError: { message: "Failed to fetch" } }),
    );
    expect(snap.profile).toBeNull();
    expect(snap.status).toBe("signed-in");
  });

  it("sesión guardada que no se pudo refrescar sin red: deja pasar con la caché", async () => {
    await writePerfilCache({ userId: "u1", email: "ana@example.org", profile, club, savedAt: "x" });
    const snap = await resolveProfileSnapshot(
      fakeSupabase({ sessionError: new AuthRetryableFetchError("Failed to fetch", 0) }),
    );
    expect(snap).toMatchObject({ status: "signed-in", offline: true, session: null, profile });
  });

  it("sin sesión: signed-out y borra la caché", async () => {
    await writePerfilCache({ userId: "u1", email: null, profile, club, savedAt: "x" });
    const snap = await resolveProfileSnapshot(fakeSupabase({}));
    expect(snap.status).toBe("signed-out");
    expect(await readPerfilCache()).toBeNull();
  });

  it("sesión revocada (error de auth, no de red): signed-out", async () => {
    const snap = await resolveProfileSnapshot(
      fakeSupabase({ sessionError: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found") }),
    );
    expect(snap.status).toBe("signed-out");
  });
});

describe("esAdminActivo", () => {
  it("solo es admin con rol admin y activo", () => {
    expect(esAdminActivo({ ...profile, rol: "admin" })).toBe(true);
    expect(esAdminActivo({ ...profile, rol: "admin", activo: false })).toBe(false);
    expect(esAdminActivo(profile)).toBe(false);
    expect(esAdminActivo(null)).toBe(false);
  });
});

describe("ProfileProvider sin red", () => {
  beforeEach(async () => {
    await db.meta.clear();
  });

  it("arranca con la sesión local y el perfil en caché: conserva isAdmin", async () => {
    await writePerfilCache({ userId: "u1", email: null, profile: { ...profile, rol: "admin" }, club, savedAt: "x" });
    clienteActual = conAuthListener(
      fakeSupabase({ sessionError: new AuthRetryableFetchError("Failed to fetch", 0) }),
    );
    render(
      <ProfileProvider>
        <Sonda />
      </ProfileProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("sonda")).toHaveTextContent("signed-in|true|true|Ana Pérez"));
  });

  it("con sesión local pero el perfil no carga por red: no pierde el perfil", async () => {
    await writePerfilCache({ userId: "u1", email: null, profile, club, savedAt: "x" });
    clienteActual = conAuthListener(fakeSupabase({ session, rowError: { message: "Failed to fetch" } }));
    render(
      <ProfileProvider>
        <Sonda />
      </ProfileProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("sonda")).toHaveTextContent("signed-in|false|true|Ana Pérez"));
  });
});

describe("ProfileProvider: cerrar sesión", () => {
  beforeEach(async () => {
    await db.meta.clear();
    await db.reportes.clear();
    await db.outbox.clear();
  });

  it("borra la copia local de los reportes sincronizados, nunca la cola ni los pendientes", async () => {
    const ID_SYNC = "00000000-0000-4000-8000-0000000000a1";
    const ID_PEND = "00000000-0000-4000-8000-0000000000a2";
    await db.reportes.bulkPut([
      { ...filaRemota({ id: ID_SYNC }), _sync: "synced" } as ReporteLocal,
      { ...filaRemota({ id: ID_PEND }), _sync: "pending" } as ReporteLocal,
    ]);
    await db.outbox.add({
      reporteId: ID_PEND,
      op: "upsert",
      payload: filaRemota({ id: ID_PEND }),
      intentos: 0,
      createdAt: "x",
    } as never);
    await writePerfilCache({ userId: "u1", email: null, profile, club, savedAt: "x" });

    const signOut = vi.fn(async () => ({ error: null }));
    const cliente = conAuthListener(fakeSupabase({ session, row: { ...profile, club } }));
    (cliente.auth as unknown as { signOut: typeof signOut }).signOut = signOut;
    clienteActual = cliente;

    function Boton() {
      const { signOut: cerrar } = useProfile();
      return (
        <button type="button" onClick={() => void cerrar()}>
          Salir
        </button>
      );
    }
    render(
      <ProfileProvider>
        <Sonda />
        <Boton />
      </ProfileProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("sonda")).toHaveTextContent("signed-in"));
    act(() => {
      screen.getByRole("button", { name: "Salir" }).click();
    });

    await waitFor(() => expect(screen.getByTestId("sonda")).toHaveTextContent("signed-out"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await db.reportes.get(ID_SYNC)).toBeUndefined();
    expect((await db.reportes.get(ID_PEND))?._sync).toBe("pending");
    expect(await db.outbox.count()).toBe(1);
    expect(await readPerfilCache()).toBeNull();
  });
});

describe("mergeSnapshot", () => {
  const prev: ProfileSnapshot = {
    status: "signed-in",
    session: null,
    profile,
    club,
    email: "ana@example.org",
    offline: false,
  };

  it("conserva el perfil previo si la lectura nueva falló por red", () => {
    const next: ProfileSnapshot = { ...prev, profile: null, club: null, offline: true };
    expect(mergeSnapshot(prev, next).profile).toEqual(profile);
  });

  it("no lo conserva si cambió el usuario o si no hay sesión", () => {
    const otro = {
      ...prev,
      profile: null,
      offline: true,
      session: { user: { id: "u2" } } as unknown as ProfileSnapshot["session"],
    };
    expect(mergeSnapshot(prev, otro).profile).toBeNull();
    const fuera: ProfileSnapshot = { ...prev, status: "signed-out", profile: null, offline: false };
    expect(mergeSnapshot(prev, fuera).profile).toBeNull();
  });
});
