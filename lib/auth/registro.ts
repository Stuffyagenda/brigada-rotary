/**
 * Reglas del formulario de registro (`/registro`). Funciones puras.
 */
import { validarNombreApellido } from "@/lib/auth/nombre";
import { TIPO_CLUB_LABEL, TIPOS_CLUB, type ClubPublico, type TipoClub } from "@/lib/types";

/** Mínimo de la app (Supabase acepta 6 por defecto; aquí se pide más). */
export const PASSWORD_MIN = 8;
/** Supabase Auth guarda la contraseña con bcrypt, que solo usa los primeros 72 bytes. */
export const PASSWORD_MAX = 72;

export const CAMPOS_REGISTRO = ["nombre", "apellido", "club_id", "email", "password", "password2"] as const;
export type CampoRegistro = (typeof CAMPOS_REGISTRO)[number];

export type ValoresRegistro = Record<CampoRegistro, string>;
export type ErroresRegistro = Partial<Record<CampoRegistro, string>>;

export const VALORES_REGISTRO_VACIOS: ValoresRegistro = {
  nombre: "",
  apellido: "",
  club_id: "",
  email: "",
  password: "",
  password2: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida el formulario completo. Devuelve los errores por campo (vacío si es válido). */
export function validarRegistro(v: ValoresRegistro): ErroresRegistro {
  const errores: ErroresRegistro = { ...validarNombreApellido(v.nombre, v.apellido) };

  if (!v.club_id) errores.club_id = "Elige tu club.";

  const email = v.email.trim();
  if (!email) errores.email = "Escribe tu correo.";
  else if (!EMAIL_RE.test(email)) errores.email = "Revisa el correo: debe tener la forma nombre@dominio.com.";

  if (!v.password) errores.password = "Escribe una contraseña.";
  else if (v.password.length < PASSWORD_MIN) {
    errores.password = `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  } else if (new TextEncoder().encode(v.password).length > PASSWORD_MAX) {
    errores.password = `La contraseña puede tener como máximo ${PASSWORD_MAX} caracteres.`;
  }

  if (!v.password2) errores.password2 = "Repite la contraseña.";
  else if (v.password && v.password2 !== v.password) errores.password2 = "Las contraseñas no coinciden.";

  return errores;
}

/** Primer campo con error, en el orden del formulario. */
export function primerCampoConError(errores: ErroresRegistro): CampoRegistro | null {
  return CAMPOS_REGISTRO.find((c) => errores[c]) ?? null;
}

export interface GrupoClubes {
  tipo: TipoClub;
  etiqueta: string;
  clubs: ClubPublico[];
}

/** Agrupa los clubes por tipo (Rotary, Rotaract), en orden alfabético; omite grupos vacíos. */
export function agruparClubes(clubs: readonly ClubPublico[]): GrupoClubes[] {
  return TIPOS_CLUB.map((tipo) => ({
    tipo,
    etiqueta: TIPO_CLUB_LABEL[tipo],
    clubs: clubs
      .filter((c) => c.tipo === tipo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })),
  })).filter((g) => g.clubs.length > 0);
}

/**
 * Metadatos que lee `handle_new_user()` (migración 003). Solo nombre, apellido
 * y club: rol y activo nunca salen del cliente.
 */
export function metadatosRegistro(v: ValoresRegistro): { nombre: string; apellido: string; club_id: string } {
  return { nombre: v.nombre.trim(), apellido: v.apellido.trim(), club_id: v.club_id };
}
