import type { Metadata } from "next";

export const metadata: Metadata = { title: "Iniciar sesión" };

// TODO(auth-admin): formulario de email y contraseña con signInWithPassword.
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-xl font-bold">Brigada Rotary</h1>
      <p className="text-ink-soft">Inicio de sesión en preparación.</p>
    </main>
  );
}
