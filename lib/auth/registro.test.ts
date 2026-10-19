import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  MSG_DEMASIADOS_INTENTOS,
  MSG_REGISTRO_CONTRASENA_DEBIL,
  MSG_REGISTRO_CONTRASENA_FILTRADA,
  MSG_REGISTRO_CORREO_INVALIDO,
  MSG_REGISTRO_DESACTIVADO,
  MSG_REGISTRO_GENERICO,
  MSG_REGISTRO_LIMITE_CORREOS,
  MSG_REGISTRO_SIN_CONEXION,
  MSG_REGISTRO_YA_EXISTE,
  signUpErrorMessage,
} from "@/lib/auth/errors";
import { nombreCompletoDe, validarNombreApellido } from "@/lib/auth/nombre";
import {
  agruparClubes,
  metadatosRegistro,
  primerCampoConError,
  validarRegistro,
  type ValoresRegistro,
} from "@/lib/auth/registro";

const validos: ValoresRegistro = {
  nombre: " Ana ",
  apellido: "Pérez",
  club_id: "c1",
  email: "ana@example.org",
  password: "contraseña-larga",
  password2: "contraseña-larga",
};

describe("validarRegistro", () => {
  it("acepta un formulario completo", () => {
    expect(validarRegistro(validos)).toEqual({});
  });

  it("exige todos los campos, con mensajes en español", () => {
    const errores = validarRegistro({
      nombre: " ",
      apellido: "",
      club_id: "",
      email: "",
      password: "",
      password2: "",
    });
    expect(errores).toEqual({
      nombre: "Escribe tu nombre.",
      apellido: "Escribe tu apellido.",
      club_id: "Elige tu club.",
      email: "Escribe tu correo.",
      password: "Escribe una contraseña.",
      password2: "Repite la contraseña.",
    });
    expect(primerCampoConError(errores)).toBe("nombre");
  });

  it("revisa el formato del correo, el largo y la repetición de la contraseña", () => {
    const errores = validarRegistro({ ...validos, email: "ana@", password: "corta", password2: "otra" });
    expect(errores.email).toBe("Revisa el correo: debe tener la forma nombre@dominio.com.");
    expect(errores.password).toBe("La contraseña debe tener al menos 8 caracteres.");
    expect(errores.password2).toBe("Las contraseñas no coinciden.");
    expect(primerCampoConError(errores)).toBe("email");
    expect(validarRegistro({ ...validos, password: "x".repeat(73), password2: "x".repeat(73) }).password).toMatch(
      /máximo 72/,
    );
  });

  it("limita nombre y apellido a 120 caracteres", () => {
    expect(validarNombreApellido("a".repeat(121), "b")).toEqual({ nombre: "Máximo 120 caracteres." });
    expect(validarNombreApellido("", "", false)).toEqual({
      nombre: "Escribe el nombre.",
      apellido: "Escribe el apellido.",
    });
  });

  it("envía solo nombre, apellido y club como metadatos (recortados)", () => {
    expect(metadatosRegistro(validos)).toEqual({ nombre: "Ana", apellido: "Pérez", club_id: "c1" });
  });
});

describe("agruparClubes", () => {
  it("agrupa por Rotary y Rotaract en orden alfabético y omite grupos vacíos", () => {
    const grupos = agruparClubes([
      { id: "3", nombre: "Rotaract Club Panamá", tipo: "rotaract" },
      { id: "2", nombre: "Rotary Club David", tipo: "rotary" },
      { id: "1", nombre: "Rotary Club Chitré", tipo: "rotary" },
    ]);
    expect(grupos.map((g) => g.etiqueta)).toEqual(["Rotary", "Rotaract"]);
    expect(grupos[0].clubs.map((c) => c.id)).toEqual(["1", "2"]);
    expect(agruparClubes([{ id: "1", nombre: "X", tipo: "rotary" }]).map((g) => g.tipo)).toEqual(["rotary"]);
    expect(agruparClubes([])).toEqual([]);
  });
});

describe("nombreCompletoDe", () => {
  it("une nombre y apellido; si faltan, usa nombre_completo", () => {
    expect(nombreCompletoDe({ nombre: "Ana", apellido: "Pérez", nombre_completo: "x" })).toBe("Ana Pérez");
    expect(nombreCompletoDe({ nombre: "Ana María Pérez", apellido: null })).toBe("Ana María Pérez");
    expect(nombreCompletoDe({ nombre: null, apellido: null, nombre_completo: " Legado " })).toBe("Legado");
    expect(nombreCompletoDe(null)).toBe("");
  });
});

describe("signUpErrorMessage", () => {
  it("traduce los códigos de Supabase Auth", () => {
    expect(signUpErrorMessage(new AuthApiError("User already registered", 422, "user_already_exists"))).toEqual({
      mensaje: MSG_REGISTRO_YA_EXISTE,
      campo: "email",
    });
    expect(signUpErrorMessage(new AuthApiError("Email exists", 422, "email_exists")).mensaje).toBe(
      MSG_REGISTRO_YA_EXISTE,
    );
    expect(signUpErrorMessage(new AuthApiError("Signups not allowed", 422, "signup_disabled"))).toEqual({
      mensaje: MSG_REGISTRO_DESACTIVADO,
    });
    expect(signUpErrorMessage(new AuthApiError("Email logins disabled", 422, "email_provider_disabled")).mensaje).toBe(
      MSG_REGISTRO_DESACTIVADO,
    );
    expect(signUpErrorMessage(new AuthApiError("Invalid", 400, "email_address_invalid"))).toEqual({
      mensaje: MSG_REGISTRO_CORREO_INVALIDO,
      campo: "email",
    });
    expect(signUpErrorMessage(new AuthApiError("Rate", 429, "over_email_send_rate_limit")).mensaje).toBe(
      MSG_REGISTRO_LIMITE_CORREOS,
    );
    expect(signUpErrorMessage(new AuthApiError("Rate", 429, "over_request_rate_limit")).mensaje).toBe(
      MSG_DEMASIADOS_INTENTOS,
    );
    // Servidor sin código: el texto clásico.
    expect(signUpErrorMessage(new AuthApiError("User already registered", 400, undefined)).mensaje).toBe(
      MSG_REGISTRO_YA_EXISTE,
    );
  });

  it("distingue contraseña débil y filtrada", () => {
    expect(signUpErrorMessage(new AuthWeakPasswordError("weak", 422, ["characters"]))).toEqual({
      mensaje: MSG_REGISTRO_CONTRASENA_DEBIL,
      campo: "password",
    });
    expect(signUpErrorMessage(new AuthWeakPasswordError("pwned", 422, ["pwned"])).mensaje).toBe(
      MSG_REGISTRO_CONTRASENA_FILTRADA,
    );
  });

  it("sin red pide conexión; lo desconocido da un mensaje genérico", () => {
    expect(signUpErrorMessage(new AuthRetryableFetchError("Failed to fetch", 0)).mensaje).toBe(
      MSG_REGISTRO_SIN_CONEXION,
    );
    expect(signUpErrorMessage(null, false).mensaje).toBe(MSG_REGISTRO_SIN_CONEXION);
    expect(signUpErrorMessage(new AuthApiError("Database error saving new user", 500, "unexpected_failure"))).toEqual({
      mensaje: MSG_REGISTRO_GENERICO,
    });
  });
});
