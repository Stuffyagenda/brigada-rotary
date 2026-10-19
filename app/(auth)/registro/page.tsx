import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegistroForm } from "@/components/auth/RegistroForm";

export const metadata: Metadata = { title: "Crear cuenta" };

// Página estática, como /login: la lista de clubes y `?next=` se leen en el
// cliente, así puede quedar en la caché del service worker. Crear la cuenta
// necesita conexión (el formulario lo avisa).
export default function RegistroPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 sm:py-16">
      <AuthCard>
        <div className="mb-7 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG local de 40 px */}
          <img src="/icons/brigada-rotary.svg" alt="" width={40} height={40} className="size-10 shrink-0" />
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight">Brigada Rotary</p>
            <p className="text-sm text-ink-soft">Rotary y Rotaract</p>
          </div>
        </div>
        <RegistroForm />
      </AuthCard>
    </main>
  );
}
