import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";
import { LoginForm } from "@/components/auth/LoginForm";
import { REGISTRO_PATH } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Iniciar sesión" };

// Página estática: el formulario lee `?next=` en el cliente al enviar, así puede
// quedar en la caché del service worker y abrirse sin señal.
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:py-16">
      <AuthCard>
        <div className="mb-7 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG local de 40 px */}
          <img src="/icons/brigada-rotary.svg" alt="" width={40} height={40} className="size-10 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight">Brigada Rotary</h1>
            <p className="text-sm text-ink-soft">Rotary y Rotaract</p>
          </div>
        </div>
        <p className="mb-6 text-ink-soft">Entra con tu correo y tu contraseña.</p>
        <LoginForm />
        <div className="mt-5 border-t border-line pt-3">
          <AuthSwitchLink to={REGISTRO_PATH} prompt="¿No tienes cuenta?">
            Crear cuenta
          </AuthSwitchLink>
        </div>
      </AuthCard>
    </main>
  );
}
