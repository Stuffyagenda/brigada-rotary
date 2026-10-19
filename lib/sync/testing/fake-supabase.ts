/**
 * Cliente de Supabase simulado para los tests del motor de sync.
 * Implementa solo las llamadas que usa lib/sync, con las tablas `reportes` y
 * `visitas` en memoria (FK `visitas.reporte_id` con `on delete cascade` y la
 * auditoría de `set_visita_audit`), y un Realtime manual (`emitirRealtime`).
 *
 * Como `postgrest-js` 2.x, las consultas devuelven `{ data, error, status }`: el
 * `status` HTTP va en la respuesta y el `error` solo trae `message`, `code`,
 * `details` y `hint`. Storage, en cambio, sí incluye `status`/`statusCode` en el error.
 */
import { totalPersonas, type Reporte, type Visita } from "@/lib/types";

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

/** Suscripción Realtime registrada con `channel(...).on("postgres_changes", ...)`. */
export interface FakeSuscripcion {
  canal: string;
  table: string;
  callback: (payload: unknown) => void;
}

export interface FakeState {
  rows: Map<string, Reporte>;
  /** Tabla `visitas` en memoria. */
  visitas: Map<string, Visita>;
  /**
   * Si es `true`, la tabla `visitas` no existe (servidor sin la migración 003):
   * toda consulta responde `PGRST205` con status 404, como PostgREST.
   */
  visitasAusente: boolean;
  /** Error a devolver en el próximo select de `visitas` (se consume). */
  visitasSelectError: FakeError | null;
  session: { access_token: string } | null;
  /**
   * Orden de las llamadas. Reportes: "upload:<path>", "upsert:<id>", "select",
   * "delete:<id>". Visitas: "visitas.upsert:<id>", "visitas.select", "visitas.delete:<id>".
   */
  calls: string[];
  /** Suscripciones Realtime activas. */
  suscripciones: FakeSuscripcion[];
  uploads: { path: string; blob: Blob; options: unknown }[];
  removed: string[];
  /** Error a devolver en el próximo upsert (se consume). */
  upsertError: FakeError | null;
  /**
   * Errores a devolver en los próximos upserts, por id de reporte o de visita
   * (se consumen). Permite rechazar una fila concreta y dejar pasar las demás.
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
  /** Cuerpos enviados en los upserts de `visitas`. */
  visitaBodies: Record<string, unknown>[];
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

const TABLA_AUSENTE: FakeError = {
  message: "Could not find the table 'public.visitas' in the schema cache",
  code: "PGRST205",
  status: 404,
};

class Query implements PromiseLike<Resultado> {
  private op: "select" | "upsert" | "delete" = "select";
  private body: Record<string, unknown> | null = null;
  private filtros: [string, unknown][] = [];
  private rango: [number, number] | null = null;
  private modo: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private readonly state: FakeState,
    private readonly tabla: string = "reportes",
  ) {}

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
    if (this.tabla === "visitas") return this.ejecutarVisitas();
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
      for (const r of borradas) {
        s.rows.delete(r.id);
        // FK on delete cascade.
        for (const v of [...s.visitas.values()]) if (v.reporte_id === r.id) s.visitas.delete(v.id);
      }
      return ok(borradas);
    }

    s.calls.push("select");
    let filas = [...s.rows.values()].filter(coincide).sort((a, b) => a.id.localeCompare(b.id));
    if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1);
    if (this.modo === "maybeSingle") return ok(filas[0] ?? null);
    if (this.modo === "single") return ok(filas[0] ?? null);
    return ok(filas);
  }

  /** `public.visitas`: upsert con FK y auditoría, select paginado y delete. */
  private ejecutarVisitas(): Resultado {
    const s = this.state;
    const prefijo = "visitas.";
    if (this.op === "upsert") {
      const body = this.body!;
      s.calls.push(`${prefijo}upsert:${String(body.id)}`);
      if (s.visitasAusente) return respuestaError(TABLA_AUSENTE);
      s.visitaBodies.push(body);
      const porId = s.upsertErrorPorId.get(String(body.id));
      if (porId) {
        s.upsertErrorPorId.delete(String(body.id));
        return respuestaError(porId);
      }
      if (!s.rows.has(String(body.reporte_id))) {
        return respuestaError({
          message:
            'insert or update on table "visitas" violates foreign key constraint "visitas_reporte_id_fkey"',
          code: "23503",
          status: 409,
        });
      }
      const previa = s.visitas.get(String(body.id));
      const fila = {
        ...(body as unknown as Visita),
        // set_visita_audit: en un update se conservan autor y fecha de alta.
        created_at: previa?.created_at ?? String(body.created_at ?? new Date().toISOString()),
        created_by: previa ? previa.created_by : "user-1",
      } as Visita;
      s.visitas.set(fila.id, fila);
      return ok(fila, 201);
    }

    const coincide = (v: Visita) =>
      this.filtros.every(([c, val]) => (v as unknown as Record<string, unknown>)[c] === val);

    if (this.op === "delete") {
      const id = String(this.filtros.find(([c]) => c === "id")?.[1]);
      s.calls.push(`${prefijo}delete:${id}`);
      if (s.visitasAusente) return respuestaError(TABLA_AUSENTE);
      const borradas = [...s.visitas.values()].filter(coincide);
      for (const v of borradas) s.visitas.delete(v.id);
      return ok(borradas);
    }

    s.calls.push(`${prefijo}select`);
    if (s.visitasAusente) return respuestaError(TABLA_AUSENTE);
    if (s.visitasSelectError) {
      const error = s.visitasSelectError;
      s.visitasSelectError = null;
      return respuestaError(error);
    }
    let filas = [...s.visitas.values()].filter(coincide).sort((a, b) => a.id.localeCompare(b.id));
    if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1);
    if (this.modo !== "many") return ok(filas[0] ?? null);
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
    visitas: new Map(),
    visitasAusente: false,
    visitasSelectError: null,
    session: { access_token: "token" },
    calls: [],
    suscripciones: [],
    uploads: [],
    removed: [],
    upsertError: null,
    upsertErrorPorId: new Map(),
    deleteError: null,
    despuesDeBorrar: null,
    uploadError: null,
    deleteBloqueado: false,
    upsertBodies: [],
    visitaBodies: [],
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
    from: (tabla: string) => new Query(state, tabla),
    channel(nombre: string) {
      const canal = {
        nombre,
        on: (_tipo: string, filtro: { table?: string }, callback: (payload: unknown) => void) => {
          state.suscripciones.push({ canal: nombre, table: filtro?.table ?? "", callback });
          return canal;
        },
        subscribe: () => canal,
      };
      return canal;
    },
    async removeChannel(canal: { nombre?: string }) {
      state.suscripciones = state.suscripciones.filter((s) => s.canal !== canal?.nombre);
      return "ok";
    },
  };

  return { client, state };
}

/** Entrega un evento `postgres_changes` a las suscripciones de esa tabla. */
export function emitirRealtime(state: FakeState, table: string, payload: Record<string, unknown>): void {
  const evento = { schema: "public", table, commit_timestamp: "", errors: [], ...payload };
  for (const s of state.suscripciones) if (s.table === table) s.callback(evento);
}

/** Visita remota completa para sembrar la tabla simulada. */
export function visitaRemota(base: Partial<Visita> & { id: string; reporte_id: string }): Visita {
  return {
    fecha: "2026-10-01",
    visitado_at: "2026-10-01T15:00:00.000Z",
    brigadista_texto: null,
    ent_agua: false,
    ent_kit_alimento: false,
    ent_kit_higiene: false,
    ent_lona: false,
    ent_camping: false,
    ent_toldas: false,
    ent_colchonetas: false,
    ent_otros: [],
    observaciones: null,
    created_at: "2026-10-01T15:00:00.000Z",
    created_by: "user-2",
    ...base,
  };
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
