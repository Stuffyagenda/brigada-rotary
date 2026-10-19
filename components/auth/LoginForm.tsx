"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { inputClass } from "@/components/auth/campos";
import { Button } from "@/components/ui/Button";
import { loginErrorMessage, MSG_CREDENCIALES, MSG_SIN_CONFIG } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { cn } from "@/lib/cn";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Destino tras entrar: `?next=` si es una ruta interna, si no `/`. */
function destino(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

/** Formulario de inicio de sesión con correo y contraseña (sin magic link; el registro vive en /registro). */
export function LoginForm() {
  const router = useRouter();
  const id = useId();
  const errorId = `${id}-error`;
  const emailRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Si ya hay sesión en este dispositivo (p. ej. login servido desde la caché), se entra directo.
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!hasSupabaseEnv()) {
      setError(MSG_SIN_CONFIG);
      return;
    }
    if (!navigator.onLine) {
      setError(loginErrorMessage(null, false));
      return;
    }

    setError(null);
    setPending(true);
    try {
      const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw authError;
      router.replace(destino());
      router.refresh();
    } catch (err) {
      setError(loginErrorMessage(err, navigator.onLine));
      setPending(false);
      emailRef.current?.focus();
    }
  }

  const describedBy = error ? errorId : undefined;
  // Solo las credenciales erróneas marcan los campos como inválidos.
  const invalid = error === MSG_CREDENCIALES ? true : undefined;

  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="font-semibold">
          Correo electrónico
        </label>
        <input
          ref={emailRef}
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-password`} className="font-semibold">
          Contraseña
        </label>
        <div className="relative">
          <input
            id={`${id}-password`}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={cn(inputClass, "pr-12")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label="Mostrar contraseña"
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-ink-soft transition-colors duration-140 ease-out hover:text-ink"
          >
            {showPassword ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
          </button>
        </div>
      </div>

      {/* Región viva siempre presente para que los lectores de pantalla anuncien el error. */}
      <div aria-live="assertive" aria-atomic="true">
        {error && (
          <p
            id={errorId}
            className="rounded-lg border-l-4 border-pending bg-pending-tint px-3 py-2.5 font-semibold text-pending"
          >
            {error}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" block aria-disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle aria-hidden="true" size={20} className="motion-safe:animate-spin" />
            Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>

      <p className="text-sm text-ink-soft">
        ¿Olvidaste tu contraseña? Pídela a un administrador de tu club.
      </p>
    </form>
  );
}
