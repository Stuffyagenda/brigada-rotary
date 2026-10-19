/**
 * Cliente de Supabase simulado para los tests del motor de sync.
 * Implementa solo las llamadas que usa lib/sync, con una tabla `reportes` en memoria.
 *
 * Como `postgrest-js` 2.x, las consultas devuelven `{ data, error, status }`: el
 * `status` HTTP va en la respuesta y el `error` solo trae `message`, `code`,
 * `details` y `hint`. Storage, en cambio, sí incluye `status`/`statusCode` en el error.
 */
import { totalPersonas, type Reporte } from "@/lib/types";

/**
 * Error a simular. En las consultas a tablas, `status` se usa como status HTTP
 * de la respuesta y NO se copia dentro de `error` (igual que el cliente real).
 */
export interface FakeError {
  message: string;
  code?: string;
  status?: number;
  statusCode?: string;
  details?: string;
  hint?: string;
}

/** Error tal como lo devuelve PostgREST (sin status). */
export type PostgrestErrorLike = { message: string; code: string; details: string; hint: string };

export interface FakeState {
  rows: Map<string, Reporte>;
  session: { access_token: string } | null;
  /** Orden de las llamadas ("upload:<path>", "upsert:<id>", "select", "delete:<id>"…). */
  calls: string[];
  uploads: { path: string; blob: Blob; options: unknown }[];
  removed: string[];
  /** Error a devolver en el próximo upsert (se consume). */
  upsertError: FakeError | null;
  /**
   * Errores a devolver en los próximos upserts, por id de reporte (se consumen).
   * Permite rechazar un reporte concreto y dejar pasar los demás.
   */
  upsertErrorPorId: Map<string, FakeError>;
  /** Error a devolver en el próximo delete (se consume). */
  deleteError: FakeError | null;
  /**
   * Se espera después de ejecutar un delete y antes de responder (simula que algo
   * pasa en el celular mientras la respuesta del DELETE viene en camino).
   */
  despuesDeBorrar: (() => Promise<void> | void) | null;
  /** Error a devolver en la próxima subida (se consume). */
  uploadError: FakeError | null;
  /** Si es `true`, el delete no borra nada (simula la RLS de un miembro). */
  deleteBloqueado: boolean;
  upsertBodies: Record<string, unknown>[];
}

type Resultado = { data: unknown; error: PostgrestErrorLike | null; status: number; statusText: string };

const ERROR_RED: FakeError = { message: "TypeError: Failed to fetch", code: "", status: 0 };
export const errorRed = (): FakeError => ({ ...ERROR_RED });

/** Respuesta de error como la de postgrest-js: status fuera de `error`. */
function respuestaError(e: FakeError): Resultado {
  const status = e.status ?? 400;
  return {
    data: null,
    error: { message: e.message, code: e.code ?? "", details: e.details ?? "", hint: e.hint ?? "" },
    status,
    statusText: status === 0 ? "" : "Error",
  };
}

const ok = (data: unknown, status = 200): Resultado => ({ data, error: null, status, statusText: "OK" });

class Query implements PromiseLike<Resultado> {
  private op: "select" | "upsert" | "delete" = "select";
  private body: Record<string, unknown> | null = null;
  private filtros: [string, unknown][] = [];
  private rango: [number, number] | null = null;
  private modo: "many" | "single" | "maybeSingle" = "many";

  constructor(private readonly state: FakeState) {}

  select(): this {
    return this;
  }
  upsert(body: Record<string, unknown>): this {
    this.op = "upsert";
    this.body = body;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filtros.push([col, val]);
    return this;
  }
  order(): this {
    return this;
  }
  range(desde: number, hasta: number): this {
    this.rango = [desde, hasta];
    return this;
  }
  single(): this {
    this.modo = "single";
    return this;
  }
  maybeSingle(): this {
    this.modo = "maybeSingle";
    return this;
  }

  private ejecutar(): Resultado {
    const s = this.state;
    if (this.op === "upsert") {
      const body = this.body!;
      s.calls.push(`upsert:${String(body.id)}`);
      s.upsertBodies.push(body);
      const porId = s.upsertErrorPorId.get(String(body.id));
      if (porId) {
        s.upsertErrorPorId.delete(String(body.id));
        return respuestaError(porId);
      }
      if (s.upsertError) {
        const error = s.upsertError;
        s.upsertError = null;
        return respuestaError(error);
      }
      const previa = s.rows.get(String(body.id));
      const fila = {
        ...(body as unknown as Reporte),
        created_at: previa?.created_at ?? String(body.created_at),
        updated_at: new Date().toISOString(),
        created_by: previa?.created_by ?? "user-1",
        updated_by: "user-1",
      } as Reporte;
      fila.total_personas = totalPersonas(fila);
      s.rows.set(fila.id, fila);
      return ok(fila, 201);
    }

    const coincide = (r: Reporte) =>
      this.filtros.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v);

    if (this.op === "delete") {
      const id = String(this.filtros.find(([c]) => c === "id")?.[1]);
      s.calls.push(`delete:${id}`);
      if (s.deleteError) {
        const error = s.deleteError;
        s.deleteError = null;
        return respuestaError(error);
      }
      if (s.deleteBloqueado) return ok([]);
      const borradas = [...s.rows.values()].filter(coincide);
      for (const r of borradas) s.rows.delete(r.id);
      return ok(borradas);
    }

    s.calls.push("select");
    let filas = [...s.rows.values()].filter(coincide).sort((a, b) => a.id.localeCompare(b.id));
    if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1);
    if (this.modo === "maybeSingle") return ok(filas[0] ?? null);
    if (this.modo === "single") return ok(filas[0] ?? null);
    return ok(filas);
  }

  then<A = Resultado, B = never>(
    onfulfilled?: ((value: Resultado) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(async () => {
        const r = this.ejecutar();
        if (this.op === "delete" && this.state.despuesDeBorrar) await this.state.despuesDeBorrar();
        return r;
      })
      .then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase() {
  const state: FakeState = {
    rows: new Map(),
    session: { access_token: "token" },
    calls: [],
    uploads: [],
    removed: [],
    upsertError: null,
    upsertErrorPorId: new Map(),
    deleteError: null,
    despuesDeBorrar: null,
    uploadError: null,
    deleteBloqueado: false,
    upsertBodies: [],
  };

  const storageBucket = {
    async upload(path: string, blob: Blob, options: unknown) {
      state.calls.push(`upload:${path}`);
      if (state.uploadError) {
        const error = state.uploadError;
        state.uploadError = null;
        return { data: null, error };
      }
      state.uploads.push({ path, blob, options });
      return { data: { path }, error: null };
    },
    async remove(paths: string[]) {
      state.removed.push(...paths);
      return { data: [], error: null };
    },
    async createSignedUrl(path: string, expiresIn: number) {
      state.calls.push(`sign:${path}`);
      return { data: { signedUrl: `https://firmada.test/${path}?exp=${expiresIn}` }, error: null };
    },
  };

  const client = {
    auth: {
      async getSession() {
        return { data: { session: state.session }, error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    storage: { from: () => storageBucket },
    from: () => new Query(state),
    channel() {
      const canal = {
        on: () => canal,
        subscribe: () => canal,
      };
      return canal;
    },
    async removeChannel() {
      return "ok";
    },
  };

  return { client, state };
}

/** Reporte remoto completo para sembrar la tabla simulada. */
export function filaRemota(base: Omit<Partial<Reporte>, "id"> & { id: string }): Reporte {
  const fila = {
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    fecha_reporte: "2026-09-30",
    attended_at: null,
    club_id: null,
    created_by: "user-2",
    updated_by: "user-2",
    brigadista_texto: null,
    estado: "PENDIENTE",
    prioridad: "MEDIA",
    danio_vivienda: "MENOR / HABITABLE",
    contacto_nombre: null,
    contacto_telefono: null,
    lat: 7.96,
    lng: -80.43,
    plus_code: null,
    foto_url: null,
    foto_path: null,
    adultos: 0,
    adultos_mayores: 0,
    menores: 0,
    total_personas: 0,
    discapacitados: 0,
    casos_medicos: 0,
    condiciones_medicas: [],
    perros: 0,
    gatos: 0,
    nec_agua: false,
    nec_kit_alimento: false,
    nec_kit_higiene: false,
    nec_lona: false,
    nec_camping: false,
    nec_toldas: false,
    nec_colchonetas: false,
    nec_otros: [],
    ent_agua: false,
    ent_kit_alimento: false,
    ent_kit_higiene: false,
    ent_lona: false,
    ent_camping: false,
    ent_toldas: false,
    ent_colchonetas: false,
    ent_otros: [],
    observaciones_atencion: null,
    ...base,
  } as Reporte;
  return fila;
}
