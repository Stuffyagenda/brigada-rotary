import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  loginErrorMessage,
  MSG_CREDENCIALES,
  MSG_DEMASIADOS_INTENTOS,
  MSG_EMAIL_SIN_CONFIRMAR,
  MSG_GENERICO,
  MSG_SIN_CONEXION,
} from "@/lib/auth/errors";
import { clearPerfilCache, PERFIL_KEY, readPerfilCache, writePerfilCache } from "@/lib/auth/profile-cache";
import {
  authSwitchHref,
  decideProxyRedirect,
  isAuthPath,
  isPublicPath,
  loginUrl,
  safeNextPath,
} from "@/lib/auth/redirect";
import { db } from "@/lib/db";
import type { Profile } from "@/lib/types";

describe("safeNextPath", () => {
  it("acepta rutas internas con query y hash", () => {
    expect(safeNextPath("/registros?q=perez#x")).toBe("/registros?q=perez#x");
    expect(safeNextPath("/")).toBe("/");
  });

  it("rechaza destinos externos o ambiguos", () => {
    for (const raw of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
      "registros",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(raw)).toBe("/");
    }
  });

  it("nunca vuelve a /login ni a /registro", () => {
    expect(safeNextPath("/login?next=/x")).toBe("/");
    expect(safeNextPath("/registro")).toBe("/");
    expect(safeNextPath("/registro?next=/x")).toBe("/");
    // /registros (lista de reportes) sí es un destino válido.
    expect(safeNextPath("/registros")).toBe("/registros");
  });
});

describe("loginUrl e isPublicPath", () => {
  it("añade next salvo para la raíz", () => {
    expect(loginUrl("/")).toBe("/login");
    expect(loginUrl("/registros?q=1")).toBe("/login?next=%2Fregistros%3Fq%3D1");
  });

  it("marca como públicas login, offline y assets", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/~offline")).toBe(true);
    expect(isPublicPath("/icons/a.png")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/miembros")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });

  it("marca /registro como pública sin confundirla con /registros", () => {
    expect(isPublicPath("/registro")).toBe(true);
    expect(isAuthPath("/registro")).toBe(true);
    expect(isAuthPath("/login")).toBe(true);
    expect(isPublicPath("/registros")).toBe(false);
    expect(isAuthPath("/registros")).toBe(false);
    expect(isAuthPath("/")).toBe(false);
  });

  it("enlaza /login y /registro conservando solo un next interno", () => {
    expect(authSwitchHref("/registro", "")).toBe("/registro");
    expect(authSwitchHref("/registro", "?next=%2Fregistros%3Fq%3D1")).toBe("/registro?next=%2Fregistros%3Fq%3D1");
    expect(authSwitchHref("/login", "?next=%2Fmiembros")).toBe("/login?next=%2Fmiembros");
    expect(authSwitchHref("/login", "?next=https%3A%2F%2Fevil.example")).toBe("/login");
    expect(authSwitchHref("/login", "?next=%2Fregistro")).toBe("/login");
    expect(authSwitchHref("/login", "?otra=1")).toBe("/login");
  });
});

describe("decideProxyRedirect", () => {
  const base = { search: "", method: "GET" };

  it("manda a /login las páginas sin sesión, conservando la ruta", () => {
    expect(decideProxyRedirect({ ...base, pathname: "/", signedIn: false })).toBe("/login");
    expect(decideProxyRedirect({ ...base, pathname: "/miembros", search: "?a=1", signedIn: false })).toBe(
      "/login?next=%2Fmiembros%3Fa%3D1",
    );
  });

  it("deja pasar con sesión o si no se pudo comprobar", () => {
    expect(decideProxyRedirect({ ...base, pathname: "/", signedIn: true })).toBeNull();
    expect(decideProxyRedirect({ ...base, pathname: "/", signedIn: null })).toBeNull();
  });

  it("no redirige peticiones que no son navegaciones", () => {
    expect(decideProxyRedirect({ ...base, method: "POST", pathname: "/", signedIn: false })).toBeNull();
    expect(decideProxyRedirect({ ...base, pathname: "/api/x", signedIn: false })).toBeNull();
  });

  it("saca de /login a quien ya tiene sesión, respetando next", () => {
    expect(decideProxyRedirect({ ...base, pathname: "/login", signedIn: false })).toBeNull();
    expect(decideProxyRedirect({ ...base, pathname: "/login", search: "?next=%2Fregistros", signedIn: true })).toBe(
      "/registros",
    );
    expect(
      decideProxyRedirect({ ...base, pathname: "/login", search: "?next=https://evil.example", signedIn: true }),
    ).toBe("/");
  });
});

describe("decideProxyRedirect en /registro", () => {
  const base = { search: "", method: "GET" };

  it("deja ver /registro sin sesión", () => {
    expect(decideProxyRedirect({ ...base, pathname: "/registro", signedIn: false })).toBeNull();
    expect(decideProxyRedirect({ ...base, pathname: "/registro", signedIn: null })).toBeNull();
  });

  it("con sesión saca de /registro a la app o al next seguro", () => {
    expect(decideProxyRedirect({ ...base, pathname: "/registro", signedIn: true })).toBe("/");
    expect(
      decideProxyRedirect({ ...base, pathname: "/registro", search: "?next=%2Fregistros", signedIn: true }),
    ).toBe("/registros");
    expect(
      decideProxyRedirect({ ...base, pathname: "/registro", search: "?next=//evil.example", signedIn: true }),
    ).toBe("/");
    expect(
      decideProxyRedirect({ ...base, pathname: "/registro", search: "?next=%2Flogin", signedIn: true }),
    ).toBe("/");
  });

  it("sigue protegiendo /registros (lista de reportes)", () => {
    expect(decideProxyRedirect({ ...base, pathname: "/registros", signedIn: false })).toBe(
      "/login?next=%2Fregistros",
    );
  });
});

describe("loginErrorMessage", () => {
  it("traduce credenciales incorrectas", () => {
    expect(loginErrorMessage(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"))).toBe(
      MSG_CREDENCIALES,
    );
  });

  it("detecta la falta de red", () => {
    expect(loginErrorMessage(new AuthRetryableFetchError("Failed to fetch", 0))).toBe(MSG_SIN_CONEXION);
    expect(loginErrorMessage(new TypeError("Failed to fetch"))).toBe(MSG_SIN_CONEXION);
    expect(loginErrorMessage(null, false)).toBe(MSG_SIN_CONEXION);
  });

  it("distingue correo sin confirmar y límite de intentos", () => {
    expect(loginErrorMessage(new AuthApiError("Email not confirmed", 400, "email_not_confirmed"))).toBe(
      MSG_EMAIL_SIN_CONFIRMAR,
    );
    expect(loginErrorMessage(new AuthApiError("Too many", 429, "over_request_rate_limit"))).toBe(
      MSG_DEMASIADOS_INTENTOS,
    );
    expect(loginErrorMessage(new Error("algo raro"))).toBe(MSG_GENERICO);
  });
});

describe("caché del perfil en Dexie", () => {
  const profile: Profile = {
    id: "u1",
    nombre: "Ana",
    apellido: "Pérez",
    nombre_completo: "Ana Pérez",
    club_id: null,
    rol: "admin",
    activo: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  beforeEach(async () => {
    await db.meta.clear();
  });

  it("guarda, lee y borra el perfil en meta['perfil']", async () => {
    expect(await readPerfilCache()).toBeNull();
    await writePerfilCache({ userId: "u1", email: "ana@example.org", profile, club: null, savedAt: "x" });
    expect((await db.meta.get(PERFIL_KEY))?.value).toBeTruthy();
    expect((await readPerfilCache())?.profile.nombre_completo).toBe("Ana Pérez");
    await clearPerfilCache();
    expect(await readPerfilCache()).toBeNull();
  });

  it("ignora valores con forma inválida", async () => {
    await db.meta.put({ key: PERFIL_KEY, value: { userId: "u2", profile, savedAt: "x" } });
    expect(await readPerfilCache()).toBeNull();
  });
});
