"use client";

import { Eye, EyeOff, LoaderCircle, MailCheck, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";
import { Campo, campoDescribedBy, inputClass } from "@/components/auth/campos";
import { Button } from "@/components/ui/Button";
import { MSG_REGISTRO_SIN_CONEXION, MSG_REGISTRO_YA_EXISTE, MSG_SIN_CONFIG, signUpErrorMessage } from "@/lib/auth/errors";
import { NOMBRE_MAX } from "@/lib/auth/nombre";
import { authSwitchHref, LOGIN_PATH, safeNextPath } from "@/lib/auth/redirect";
import {
  agruparClubes,
  metadatosRegistro,
  PASSWORD_MIN,
  primerCampoConError,
  VALORES_REGISTRO_VACIOS,
  validarRegistro,
  type CampoRegistro,
  type ErroresRegistro,
  type GrupoClubes,
  type ValoresRegistro,
} from "@/lib/auth/registro";
import { cn } from "@/lib/cn";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ClubPublico } from "@/lib/types";

type CargaClubes = { estado: "cargando" } | { estado: "error" } | { estado: "listo"; grupos: GrupoClubes[] };

/** Error del servidor ligado a un campo: se muestra mientras el valor no cambie. */
interface ErrorDeCampo {
  campo: "email" | "password";
  mensaje: string;
  valor: string;
}

const MSG_CLUBES_SIN_CONEXION = "Necesitas conexión para cargar la lista de clubes.";

/** Destino tras crear la cuenta con sesión: `?next=` si es una ruta interna, si no `/`. */
function destino(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

async function pedirClubes(): Promise<GrupoClubes[]> {
  const { data, error } = await getSupabaseBrowserClient().rpc("clubs_publicos");
  if (error) throw error;
  return agruparClubes((data ?? []) as ClubPublico[]);
}

/**
 * Formulario de registro abierto: nombre, apellido, club, correo y contraseña.
 * La cuenta queda activa (rol `miembro`) en cuanto Supabase crea el usuario.
 */
export function RegistroForm() {
  const router = useRouter();
  const id = useId();
  const ids = {
    nombre: `${id}-nombre`,
    apellido: `${id}-apellido`,
    club_id: `${id}-club`,
    email: `${id}-email`,
    password: `${id}-password`,
    password2: `${id}-password2`,
  } satisfies Record<CampoRegistro, string>;
  const errorGeneralId = `${id}-error`;

  const campos = useRef<Partial<Record<CampoRegistro, HTMLInputElement | HTMLSelectElement | null>>>({});
  const reintentarRef = useRef<HTMLButtonElement>(null);
  const enviadoRef = useRef<HTMLHeadingElement>(null);

  const [valores, setValores] = useState<ValoresRegistro>(VALORES_REGISTRO_VACIOS);
  const [intentado, setIntentado] = useState(false);
  const [errorDeCampo, setErrorDeCampo] = useState<ErrorDeCampo | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [enviadoA, setEnviadoA] = useState<string | null>(null);
  const [clubes, setClubes] = useState<CargaClubes>(() =>
    hasSupabaseEnv() ? { estado: "cargando" } : { estado: "error" },
  );

  const cargarClubes = useCallback(async () => {
    setClubes({ estado: "cargando" });
    try {
      setClubes({ estado: "listo", grupos: await pedirClubes() });
    } catch {
      setClubes({ estado: "error" });
    }
  }, []);

  // Lista de clubes (rpc pública, accesible sin sesión).
  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    let active = true;
    pedirClubes()
      .then((grupos) => {
        if (active) setClubes({ estado: "listo", grupos });
      })
      .catch(() => {
        if (active) setClubes({ estado: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  // Si ya hay sesión en este dispositivo (p. ej. página servida desde la caché), se entra directo.
  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    let active = true;
    getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (active && data.session) router.replace(destino());
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);

  // Al volver la señal, se reintenta la lista de clubes.
  useEffect(() => {
    if (clubes.estado !== "error" || !hasSupabaseEnv()) return;
    const onOnline = () => void cargarClubes();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [clubes.estado, cargarClubes]);

  useEffect(() => {
    if (enviadoA) enviadoRef.current?.focus();
  }, [enviadoA]);

  function erroresDe(v: ValoresRegistro): ErroresRegistro {
    const errores = validarRegistro(v);
    if (clubes.estado !== "listo") errores.club_id = MSG_CLUBES_SIN_CONEXION;
    if (errorDeCampo && !errores[errorDeCampo.campo] && v[errorDeCampo.campo] === errorDeCampo.valor) {
      errores[errorDeCampo.campo] = errorDeCampo.mensaje;
    }
    return errores;
  }

  // Los errores se muestran tras el primer intento de envío y se actualizan al escribir.
  const errores: ErroresRegistro = intentado ? erroresDe(valores) : {};

  function enfocar(campo: CampoRegistro) {
    if (campo === "club_id" && clubes.estado === "error") {
      reintentarRef.current?.focus();
      return;
    }
    campos.current[campo]?.focus();
  }

  function cambiar(campo: CampoRegistro, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setIntentado(true);
    setErrorGeneral(null);

    const actuales = erroresDe(valores);
    const primero = primerCampoConError(actuales);
    if (primero) {
      enfocar(primero);
      return;
    }
    if (!hasSupabaseEnv()) {
      setErrorGeneral(MSG_SIN_CONFIG);
      return;
    }
    if (!navigator.onLine) {
      setErrorGeneral(MSG_REGISTRO_SIN_CONEXION);
      return;
    }

    const email = valores.email.trim();
    setPending(true);
    try {
      const { data, error } = await getSupabaseBrowserClient().auth.signUp({
        email,
        password: valores.password,
        options: {
          data: metadatosRegistro(valores),
          // Con "Confirm email" activo, el enlace del correo vuelve a /login.
          emailRedirectTo: `${window.location.origin}${LOGIN_PATH}`,
        },
      });
      if (error) throw error;
      if (data.session) {
        router.replace(destino());
        router.refresh();
        return;
      }
      // Con confirmación de correo, un correo ya registrado devuelve un usuario sin identidades.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setErrorDeCampo({ campo: "email", mensaje: MSG_REGISTRO_YA_EXISTE, valor: valores.email });
        setPending(false);
        campos.current.email?.focus();
        return;
      }
      setPending(false);
      setEnviadoA(email);
    } catch (err) {
      const { mensaje, campo } = signUpErrorMessage(err, navigator.onLine);
      setPending(false);
      if (campo) {
        setErrorDeCampo({ campo, mensaje, valor: valores[campo] });
        campos.current[campo]?.focus();
      } else {
        setErrorGeneral(mensaje);
      }
    }
  }

  if (enviadoA) {
    return (
      <div className="flex flex-col gap-4">
        <MailCheck aria-hidden="true" size={32} className="text-done" />
        <h1 ref={enviadoRef} tabIndex={-1} className="text-lg font-bold outline-none">
          Revisa tu correo
        </h1>
        <p>Te enviamos un correo para confirmar tu cuenta. Después de confirmarla, un administrador revisará tu solicitud antes de darte acceso.</p>
        <p className="text-ink-soft">
          Lo enviamos a <span className="font-semibold break-all text-ink">{enviadoA}</span>. Si no llega en unos
          minutos, revisa la carpeta de spam.
        </p>
        <Link
          href={authSwitchHref(LOGIN_PATH, window.location.search)}
          className="mt-2 inline-flex min-h-14 w-full select-none items-center justify-center rounded-lg bg-rotary px-6 text-lg font-semibold text-white transition-[scale,background-color] duration-140 ease-out hover:bg-rotary-strong motion-safe:active:scale-[0.97]"
        >
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  const props = (campo: CampoRegistro, hint?: string) => ({
    id: ids[campo],
    name: campo,
    value: valores[campo],
    "aria-invalid": errores[campo] ? true : undefined,
    "aria-describedby": campoDescribedBy(ids[campo], { hint, error: errores[campo] }),
  });

  const hintPassword = `Mínimo ${PASSWORD_MIN} caracteres.`;

  return (
    <>
      <h1 className="mb-1 text-lg font-bold">Crea tu cuenta</h1>
      <p className="mb-6 text-ink-soft">Para brigadistas de Rotary y Rotaract. Un administrador aprobará tu solicitud antes de darte acceso.</p>

      <form onSubmit={onSubmit} noValidate aria-busy={pending} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Campo id={ids.nombre} label="Nombre" error={errores.nombre}>
            <input
              {...props("nombre")}
              ref={(el) => {
                campos.current.nombre = el;
              }}
              type="text"
              autoComplete="given-name"
              autoCapitalize="words"
              maxLength={NOMBRE_MAX}
              required
              onChange={(e) => cambiar("nombre", e.target.value)}
              className={inputClass}
            />
          </Campo>
          <Campo id={ids.apellido} label="Apellido" error={errores.apellido}>
            <input
              {...props("apellido")}
              ref={(el) => {
                campos.current.apellido = el;
              }}
              type="text"
              autoComplete="family-name"
              autoCapitalize="words"
              maxLength={NOMBRE_MAX}
              required
              onChange={(e) => cambiar("apellido", e.target.value)}
              className={inputClass}
            />
          </Campo>
        </div>

        <Campo id={ids.club_id} label="Club" error={errores.club_id}>
          {clubes.estado === "error" ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-lg border-l-4 border-pending bg-pending-tint px-3 py-3"
            >
              <p id={`${ids.club_id}-estado`} className="font-semibold text-pending">
                {hasSupabaseEnv() ? MSG_REGISTRO_SIN_CONEXION : MSG_SIN_CONFIG}
              </p>
              {hasSupabaseEnv() && (
                <Button
                  ref={reintentarRef}
                  variant="secondary"
                  aria-describedby={`${ids.club_id}-estado`}
                  onClick={() => void cargarClubes()}
                >
                  <RotateCw aria-hidden="true" size={18} />
                  Reintentar
                </Button>
              )}
            </div>
          ) : (
            <select
              {...props("club_id")}
              ref={(el) => {
                campos.current.club_id = el;
              }}
              required
              disabled={clubes.estado === "cargando"}
              onChange={(e) => cambiar("club_id", e.target.value)}
              className={inputClass}
            >
              {clubes.estado === "cargando" ? (
                <option value="">Cargando clubes…</option>
              ) : (
                <>
                  <option value="" disabled>
                    {clubes.grupos.length ? "Elige tu club" : "Todavía no hay clubes"}
                  </option>
                  {clubes.grupos.map((g) => (
                    <optgroup key={g.tipo} label={g.etiqueta}>
                      {g.clubs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </>
              )}
            </select>
          )}
        </Campo>

        <Campo id={ids.email} label="Correo electrónico" error={errores.email}>
          <input
            {...props("email")}
            ref={(el) => {
              campos.current.email = el;
            }}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            onChange={(e) => cambiar("email", e.target.value)}
            className={inputClass}
          />
        </Campo>

        <Campo id={ids.password} label="Contraseña" hint={hintPassword} error={errores.password}>
          <div className="relative">
            <input
              {...props("password", hintPassword)}
              ref={(el) => {
                campos.current.password = el;
              }}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              required
              onChange={(e) => cambiar("password", e.target.value)}
              className={cn(inputClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-label="Mostrar contraseñas"
              aria-controls={`${ids.password} ${ids.password2}`}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-ink-soft transition-colors duration-140 ease-out hover:text-ink"
            >
              {showPassword ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
            </button>
          </div>
        </Campo>

        <Campo id={ids.password2} label="Repetir contraseña" error={errores.password2}>
          <input
            {...props("password2")}
            ref={(el) => {
              campos.current.password2 = el;
            }}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            onChange={(e) => cambiar("password2", e.target.value)}
            className={inputClass}
          />
        </Campo>

        {/* Región viva siempre presente para que los lectores de pantalla anuncien el error. */}
        <div aria-live="assertive" aria-atomic="true">
          {errorGeneral && (
            <p
              id={errorGeneralId}
              className="rounded-lg border-l-4 border-pending bg-pending-tint px-3 py-2.5 font-semibold text-pending"
            >
              {errorGeneral}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" block aria-disabled={pending} aria-describedby={errorGeneral ? errorGeneralId : undefined}>
          {pending ? (
            <>
              <LoaderCircle aria-hidden="true" size={20} className="motion-safe:animate-spin" />
              Creando cuenta…
            </>
          ) : (
            "Crear cuenta"
          )}
        </Button>
      </form>

      <div className="mt-5 border-t border-line pt-3">
        <AuthSwitchLink to={LOGIN_PATH} prompt="¿Ya tienes cuenta?">
          Entrar
        </AuthSwitchLink>
      </div>
    </>
  );
}
