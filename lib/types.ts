/**
 * Tipos de dominio, constantes visibles y esquema de validación de reportes.
 *
 * Los tipos base salen de lib/database.types.ts (generado por Supabase); aquí se
 * estrechan los `check` del SQL a uniones literales y se definen las etiquetas
 * que ve el usuario.
 */
import { z } from "zod";
import type { Tables, TablesInsert } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Uniones literales (checks de supabase/schema.sql)
// ---------------------------------------------------------------------------

export const ESTADOS = ["PENDIENTE", "ATENDIDO"] as const;
export type Estado = (typeof ESTADOS)[number];

export const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const DANIOS_VIVIENDA = [
  "NINGUNO",
  "MENOR / HABITABLE",
  "GRAVE / PARCIAL",
  "TOTAL / INHABITABLE",
] as const;
export type DanioVivienda = (typeof DANIOS_VIVIENDA)[number];

export const ROLES = ["admin", "miembro"] as const;
export type Rol = (typeof ROLES)[number];

export const TIPOS_CLUB = ["rotary", "rotaract"] as const;
export type TipoClub = (typeof TIPOS_CLUB)[number];

// ---------------------------------------------------------------------------
// Filas tipadas
// ---------------------------------------------------------------------------

type ReporteRow = Tables<"reportes">;
type ReporteInsertRow = TablesInsert<"reportes">;

/** Fila de `reportes` con los `check` como uniones literales. */
export type Reporte = Omit<ReporteRow, "estado" | "prioridad" | "danio_vivienda"> & {
  estado: Estado;
  prioridad: Prioridad;
  danio_vivienda: DanioVivienda;
};

/** Insert de `reportes` (columnas con default opcionales; sin `total_personas`, que es generada). */
export type ReporteInsert = Omit<ReporteInsertRow, "estado" | "prioridad" | "danio_vivienda"> & {
  estado?: Estado;
  prioridad?: Prioridad;
  danio_vivienda?: DanioVivienda;
};

/**
 * Lo que se envía a `supabase.from('reportes').upsert(...)`.
 * `total_personas` es generada; `created_by`/`updated_by` los pone el trigger de auditoría.
 */
export type ReporteUpsert = Omit<Reporte, "total_personas" | "created_by" | "updated_by">;

export type Profile = Omit<Tables<"profiles">, "rol"> & { rol: Rol };
export type Club = Omit<Tables<"clubs">, "tipo"> & { tipo: TipoClub };

// ---------------------------------------------------------------------------
// Etiquetas visibles
// ---------------------------------------------------------------------------

export interface Opcion<T extends string> {
  value: T;
  label: string;
}

export const ESTADO_LABEL: Record<Estado, string> = {
  PENDIENTE: "Pendiente",
  ATENDIDO: "Atendido",
};
export const ESTADO_OPCIONES: readonly Opcion<Estado>[] = ESTADOS.map((value) => ({
  value,
  label: ESTADO_LABEL[value],
}));

export const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  ALTA: "Alta / Urgente",
  MEDIA: "Media",
  BAJA: "Baja",
};
export const PRIORIDAD_OPCIONES: readonly Opcion<Prioridad>[] = PRIORIDADES.map((value) => ({
  value,
  label: PRIORIDAD_LABEL[value],
}));

export const DANIO_VIVIENDA_LABEL: Record<DanioVivienda, string> = {
  NINGUNO: "Sin daño aparente",
  "MENOR / HABITABLE": "Daño menor (Habitable)",
  "GRAVE / PARCIAL": "Daño grave / parcial (Riesgo)",
  "TOTAL / INHABITABLE": "Destrucción total / Inhabitable",
};
export const DANIO_VIVIENDA_OPCIONES: readonly Opcion<DanioVivienda>[] = DANIOS_VIVIENDA.map(
  (value) => ({ value, label: DANIO_VIVIENDA_LABEL[value] }),
);

export const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  miembro: "Miembro",
};

export const TIPO_CLUB_LABEL: Record<TipoClub, string> = {
  rotary: "Rotary",
  rotaract: "Rotaract",
};

// ---------------------------------------------------------------------------
// Insumos: necesidades (nec_*) y entregas (ent_*)
// ---------------------------------------------------------------------------

/** Clave de insumo; la columna es `nec_<clave>` o `ent_<clave>`. */
export const INSUMO_CLAVES = [
  "agua",
  "kit_alimento",
  "kit_higiene",
  "lona",
  "camping",
  "toldas",
  "colchonetas",
] as const;
export type InsumoClave = (typeof INSUMO_CLAVES)[number];
/** Alias usado por los filtros: una necesidad es una clave de insumo. */
export type NecesidadClave = InsumoClave;

export type NecesidadColumna = `nec_${InsumoClave}`;
export type EntregaColumna = `ent_${InsumoClave}`;

export interface Insumo {
  clave: InsumoClave;
  necColumna: NecesidadColumna;
  entColumna: EntregaColumna;
  /** Etiqueta en la sección de necesidades. */
  necLabel: string;
  /** Etiqueta en la sección de entregas. */
  entLabel: string;
  /** Forma corta en minúscula para resúmenes ("Necesita: agua, lona"). */
  corto: string;
}

export const INSUMOS: readonly Insumo[] = [
  { clave: "agua", necLabel: "Agua Potable", entLabel: "¿Se entregó Agua?", corto: "agua" },
  { clave: "kit_alimento", necLabel: "Kit de Alimentos", entLabel: "¿Se entregó Kit Alimento?", corto: "kit de alimentos" },
  { clave: "kit_higiene", necLabel: "Kit de Higiene", entLabel: "¿Se entregó Kit Higiene?", corto: "kit de higiene" },
  { clave: "lona", necLabel: "Lona", entLabel: "¿Se entregó Lona?", corto: "lona" },
  { clave: "camping", necLabel: "Camping", entLabel: "¿Se entregó Camping?", corto: "camping" },
  { clave: "toldas", necLabel: "Toldas / Carpas", entLabel: "¿Se entregaron Toldas?", corto: "toldas" },
  { clave: "colchonetas", necLabel: "Colchonetas", entLabel: "¿Se entregaron Colchonetas?", corto: "colchonetas" },
].map((i) => ({
  ...i,
  clave: i.clave as InsumoClave,
  necColumna: `nec_${i.clave}` as NecesidadColumna,
  entColumna: `ent_${i.clave}` as EntregaColumna,
}));

/** Chips de "otros insumos" (columnas `nec_otros` / `ent_otros`). */
export const OTROS_INSUMOS = ["Palets", "Pañales Bebé", "Pañales Adulto", "Frazadas", "Ropa"] as const;
export type OtroInsumo = (typeof OTROS_INSUMOS)[number];

/** Chips de condiciones médicas (columna `condiciones_medicas`), visibles si casos_medicos ≥ 1. */
export const CONDICIONES_MEDICAS = [
  "Insulina / Diabético",
  "Hipertenso",
  "Movilidad reducida",
  "Herida / Trauma",
  "Embarazada",
] as const;
export type CondicionMedica = (typeof CONDICIONES_MEDICAS)[number];

/** Contadores del censo con su etiqueta. */
export const CONTADORES = [
  { columna: "adultos", label: "Adultos (18 a 59)" },
  { columna: "adultos_mayores", label: "Adultos Mayores (60+)" },
  { columna: "menores", label: "Menores / Niños / Bebés" },
  { columna: "discapacitados", label: "Personas con Discapacidad" },
  { columna: "casos_medicos", label: "Casos Médicos / Heridos" },
  { columna: "perros", label: "Perros" },
  { columna: "gatos", label: "Gatos" },
] as const;
export type ContadorColumna = (typeof CONTADORES)[number]["columna"];

// ---------------------------------------------------------------------------
// Esquema de validación (replica los check del SQL)
// ---------------------------------------------------------------------------

const conteo = z.number().int("Debe ser un número entero").min(0, "No puede ser negativo");
const textoOpcional = z.string().nullish();

/**
 * Validación de un reporte antes de guardarlo (formulario y motor de sync).
 * Replica los `check` de `public.reportes`, incluida la coherencia
 * `(estado = 'ATENDIDO') = (attended_at is not null)`.
 */
export const reporteSchema = z
  .object({
    /** UUID generado en el celular; si falta, `saveReport` lo genera. */
    id: z.uuid().optional(),
    created_at: z.string().optional(),
    attended_at: z.string().nullish(),
    club_id: z.uuid().nullish(),
    brigadista_texto: textoOpcional,

    estado: z.enum(ESTADOS),
    prioridad: z.enum(PRIORIDADES),
    danio_vivienda: z.enum(DANIOS_VIVIENDA),

    contacto_nombre: textoOpcional,
    contacto_telefono: textoOpcional,

    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    plus_code: textoOpcional,

    foto_url: textoOpcional,
    foto_path: textoOpcional,

    adultos: conteo,
    adultos_mayores: conteo,
    menores: conteo,
    discapacitados: conteo,
    casos_medicos: conteo,
    condiciones_medicas: z.array(z.string()),
    perros: conteo,
    gatos: conteo,

    nec_agua: z.boolean(),
    nec_kit_alimento: z.boolean(),
    nec_kit_higiene: z.boolean(),
    nec_lona: z.boolean(),
    nec_camping: z.boolean(),
    nec_toldas: z.boolean(),
    nec_colchonetas: z.boolean(),
    nec_otros: z.array(z.string()),

    ent_agua: z.boolean(),
    ent_kit_alimento: z.boolean(),
    ent_kit_higiene: z.boolean(),
    ent_lona: z.boolean(),
    ent_camping: z.boolean(),
    ent_toldas: z.boolean(),
    ent_colchonetas: z.boolean(),
    ent_otros: z.array(z.string()),
    observaciones_atencion: textoOpcional,
  })
  .refine((r) => (r.estado === "ATENDIDO") === (r.attended_at != null && r.attended_at !== ""), {
    message: "Un reporte ATENDIDO debe tener fecha de atención y uno PENDIENTE no.",
    path: ["attended_at"],
  });

/** Datos de un reporte tal como los produce el formulario (salida de `reporteSchema`). */
export type ReporteInput = z.infer<typeof reporteSchema>;

/**
 * Reporte nuevo con los mismos defaults que el SQL, en la ubicación indicada.
 * Devuelve siempre un objeto nuevo (los arrays no se comparten).
 */
export function reporteVacio(lat: number, lng: number): ReporteInput {
  return {
    lat,
    lng,
    attended_at: null,
    brigadista_texto: null,
    estado: "PENDIENTE",
    prioridad: "MEDIA",
    danio_vivienda: "MENOR / HABITABLE",
    contacto_nombre: null,
    contacto_telefono: null,
    plus_code: null,
    foto_url: null,
    foto_path: null,
    adultos: 0,
    adultos_mayores: 0,
    menores: 0,
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
  };
}

/** Suma de personas (igual que la columna generada `total_personas`). */
export function totalPersonas(r: Pick<ReporteInput, "adultos" | "adultos_mayores" | "menores">): number {
  return (r.adultos || 0) + (r.adultos_mayores || 0) + (r.menores || 0);
}
