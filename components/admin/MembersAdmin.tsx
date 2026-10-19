"use client";

import { ArrowLeft, Info, PencilLine, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  actualizarMiembro,
  adminErrorMessage,
  avisoGuardado,
  bloqueoPropio,
  cargarMiembros,
  confirmacionNecesaria,
  nombreVisible,
  type ClubOpcion,
  type Miembro,
  type MiembroCambio,
} from "@/components/admin/members-data";
import { Switch } from "@/components/admin/Switch";
import { DatosPersonalesDialog } from "@/components/auth/DatosPersonalesDialog";
import { Button } from "@/components/ui/Button";
import { useProfile } from "@/lib/auth/profile";
import { cn } from "@/lib/cn";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ROL_LABEL, ROLES, TIPO_CLUB_LABEL, type Rol } from "@/lib/types";

type Carga =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; miembros: Miembro[]; clubs: ClubOpcion[] };

interface Dialogo {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

const selectClass =
  "min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink " +
  "transition-[border-color] duration-140 ease-out hover:border-ink-soft disabled:opacity-50";

function Volver() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-rotary hover:underline"
    >
      <ArrowLeft aria-hidden="true" size={20} />
      Volver al mapa
    </Link>
  );
}

interface FilaProps {
  miembro: Miembro;
  clubs: readonly ClubOpcion[];
  esYo: boolean;
  guardando: boolean;
  onCambio: (miembro: Miembro, cambio: MiembroCambio) => void;
  onEditarNombre: (miembro: Miembro) => void;
}

function FilaMiembro({ miembro, clubs, esYo, guardando, onCambio, onEditarNombre }: FilaProps) {
  const id = useId();
  const nombre = nombreVisible(miembro);
  const sinNombre = nombre === "Sin nombre";
  const clubActual = clubs.find((c) => c.id === miembro.club_id);

  return (
    <li aria-busy={guardando || undefined} className="py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 pt-2">
          <p className={cn("font-semibold break-words", sinNombre && "text-ink-soft")}>{nombre}</p>
          {esYo && <span className="text-sm text-ink-soft">(tú)</span>}
          {miembro.estado_aprobacion === "rechazado" && (
            <span className="text-sm font-semibold text-pending">Solicitud rechazada</span>
          )}
          {!sinNombre && !miembro.apellido?.trim() && (
            <span className="text-sm text-ink-soft">Sin apellido</span>
          )}
          {miembro.estado_aprobacion === "aprobado" && !miembro.activo && (
            <span className="text-sm font-semibold text-pending">Sin acceso</span>
          )}
        </div>
        <Button
          variant="ghost"
          disabled={guardando}
          onClick={() => onEditarNombre(miembro)}
          aria-label={`Editar nombre de ${nombre}`}
          className="-mr-2 shrink-0 px-3 text-rotary"
        >
          <PencilLine aria-hidden="true" size={18} />
          <span aria-hidden="true">Editar nombre</span>
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span className="break-all">{miembro.email ?? "Sin correo"}</span>
        <span>{miembro.email_confirmado ? "Correo confirmado" : "Correo sin confirmar"}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-club`} className="text-sm text-ink-soft">
            Club
          </label>
          <select
            id={`${id}-club`}
            value={miembro.club_id ?? ""}
            disabled={guardando || miembro.estado_aprobacion !== "aprobado"}
            onChange={(e) => onCambio(miembro, { club_id: e.target.value || null })}
            className={selectClass}
          >
            <option value="">Sin club</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({TIPO_CLUB_LABEL[c.tipo] ?? c.tipo})
              </option>
            ))}
            {/* Club no visible en la lista (no debería pasar): se conserva el valor. */}
            {miembro.club_id && !clubActual && <option value={miembro.club_id}>Club desconocido</option>}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-rol`} className="text-sm text-ink-soft">
            Rol
          </label>
          <select
            id={`${id}-rol`}
            value={miembro.rol}
            disabled={guardando || miembro.estado_aprobacion !== "aprobado"}
            onChange={(e) => onCambio(miembro, { rol: e.target.value as Rol })}
            className={selectClass}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {miembro.estado_aprobacion === "aprobado" && (
          <Switch
            checked={miembro.activo}
            disabled={guardando}
            label={`Acceso de ${nombre}`}
            onChange={(activo) => onCambio(miembro, { activo })}
          />
        )}
      </div>
      {miembro.estado_aprobacion !== "aprobado" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={guardando}
            onClick={() => onCambio(miembro, { estado_aprobacion: "aprobado", activo: true })}
          >
            {miembro.estado_aprobacion === "rechazado" ? "Aprobar ahora" : "Aprobar"}
          </Button>
          {miembro.estado_aprobacion === "pendiente" && (
            <Button variant="secondary" disabled={guardando} onClick={() => onCambio(miembro, { estado_aprobacion: "rechazado", activo: false })}>
              Rechazar
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Página de administración de miembros (solo admin). Necesita conexión. */
export function MembersAdmin() {
  const { profile, isAdmin, loading, refresh: refreshProfile } = useProfile();
  const selfId = profile?.id ?? null;
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" });
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set());
  // El contenido se conserva al cerrar para que no se vacíe durante la animación de salida.
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  // Miembro cuyo nombre se edita (se conserva al cerrar, igual que `dialogo`).
  const [editado, setEditado] = useState<Miembro | null>(null);
  const [editandoNombre, setEditandoNombre] = useState(false);

  const cargar = useCallback(async () => {
    setCarga({ estado: "cargando" });
    try {
      const datos = await cargarMiembros(getSupabaseBrowserClient());
      setCarga({ estado: "listo", ...datos });
    } catch (error) {
      setCarga({ estado: "error", mensaje: adminErrorMessage(error, "cargar los miembros") });
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    cargarMiembros(getSupabaseBrowserClient())
      .then((datos) => {
        if (active) setCarga({ estado: "listo", ...datos });
      })
      .catch((error: unknown) => {
        if (active) setCarga({ estado: "error", mensaje: adminErrorMessage(error, "cargar los miembros") });
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const reemplazar = useCallback((fila: Miembro) => {
    setCarga((c) =>
      c.estado === "listo" ? { ...c, miembros: c.miembros.map((m) => (m.id === fila.id ? fila : m)) } : c,
    );
  }, []);

  const guardar = useCallback(
    async (miembro: Miembro, cambio: MiembroCambio, clubs: readonly ClubOpcion[]) => {
      setGuardando((s) => new Set(s).add(miembro.id));
      // Optimista: se muestra el cambio y se revierte si falla.
      reemplazar({ ...miembro, ...cambio });
      try {
        const fila = await actualizarMiembro(getSupabaseBrowserClient(), miembro, cambio);
        reemplazar(fila);
        toast.success(avisoGuardado(fila, cambio, clubs));
        if (fila.id === selfId) void refreshProfile();
      } catch (error) {
        reemplazar(miembro);
        toast.error(adminErrorMessage(error));
      } finally {
        setGuardando((s) => {
          const n = new Set(s);
          n.delete(miembro.id);
          return n;
        });
      }
    },
    [reemplazar, refreshProfile, selfId],
  );

  /** Guarda nombre y apellido desde el diálogo (sin optimismo: el diálogo espera). */
  const guardarNombre = useCallback(
    async (miembro: Miembro, cambio: Pick<MiembroCambio, "nombre" | "apellido">, clubs: readonly ClubOpcion[]) => {
      let fila: Miembro;
      try {
        fila = await actualizarMiembro(getSupabaseBrowserClient(), miembro, cambio);
      } catch (error) {
        throw new Error(adminErrorMessage(error));
      }
      reemplazar(fila);
      toast.success(avisoGuardado(fila, cambio, clubs));
      if (fila.id === selfId) void refreshProfile();
    },
    [reemplazar, refreshProfile, selfId],
  );

  const onCambio = useCallback(
    (miembro: Miembro, cambio: MiembroCambio, clubs: readonly ClubOpcion[]) => {
      const bloqueo = bloqueoPropio(selfId, miembro, cambio);
      if (bloqueo) {
        setDialogo(bloqueo);
        setDialogoAbierto(true);
        return;
      }
      const confirmar = confirmacionNecesaria(miembro, cambio);
      if (confirmar) {
        setDialogo({ ...confirmar, onConfirm: () => void guardar(miembro, cambio, clubs) });
        setDialogoAbierto(true);
        return;
      }
      void guardar(miembro, cambio, clubs);
    },
    [guardar, selfId],
  );

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <p role="status" className="text-ink-soft">
          Comprobando tus permisos…
        </p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 py-8">
        <h1 className="text-xl font-bold">Miembros</h1>
        <p className="text-ink-soft">Esta página es solo para administradores.</p>
        <div>
          <Volver />
        </div>
      </main>
    );
  }

  const total = carga.estado === "listo" ? carga.miembros.length : null;
  const pendientes = carga.estado === "listo" ? carga.miembros.filter((m) => m.estado_aprobacion === "pendiente") : [];
  const rechazados = carga.estado === "listo" ? carga.miembros.filter((m) => m.estado_aprobacion === "rechazado") : [];
  const aprobados = carga.estado === "listo" ? carga.miembros.filter((m) => m.estado_aprobacion === "aprobado") : [];

  function listaMiembros(miembros: Miembro[], etiqueta: string) {
    return (
      <ul aria-label={etiqueta} className="divide-y divide-line border-t border-line">
        {miembros.map((m) => (
          <FilaMiembro
            key={m.id}
            miembro={m}
            clubs={carga.estado === "listo" ? carga.clubs : []}
            esYo={m.id === selfId}
            guardando={guardando.has(m.id)}
            onCambio={(miembro, cambio) => onCambio(miembro, cambio, carga.estado === "listo" ? carga.clubs : [])}
            onEditarNombre={(miembro) => {
              setEditado(miembro);
              setEditandoNombre(true);
            }}
          />
        ))}
      </ul>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-4 pb-12">
      <div className="-ml-1">
        <Volver />
      </div>
      <header className="mt-2 mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Miembros</h1>
        {total !== null && (
          <p className="text-ink-soft">
            {total === 1 ? "1 miembro" : `${total} miembros`}
          </p>
        )}
      </header>

      <p className="mb-2 flex gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-ink-soft ring-1 ring-line">
        <Info aria-hidden="true" size={18} className="mt-px shrink-0" />
        <span>
          Las cuentas nuevas esperan aprobación. Verifica nombre, correo y club antes de admitirlas;
          las solicitudes rechazadas se conservan y pueden aprobarse más adelante.
        </span>
      </p>

      {carga.estado === "cargando" && (
        <p role="status" className="py-8 text-ink-soft">
          Cargando miembros…
        </p>
      )}

      {carga.estado === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3 py-8">
          <p className="font-semibold">{carga.mensaje}</p>
          <Button variant="secondary" onClick={() => void cargar()}>
            <RotateCw aria-hidden="true" size={18} />
            Reintentar
          </Button>
        </div>
      )}

      {carga.estado === "listo" &&
        (carga.miembros.length === 0 ? (
          <p className="py-8 text-ink-soft">Todavía no hay miembros.</p>
        ) : (
          <div className="flex flex-col gap-8">
            <section aria-labelledby="pendientes-titulo">
              <h2 id="pendientes-titulo" className="mb-2 text-lg font-bold">Solicitudes pendientes ({pendientes.length})</h2>
              {pendientes.length ? listaMiembros(pendientes, "Solicitudes pendientes") : <p className="text-ink-soft">No hay solicitudes pendientes.</p>}
            </section>
            {rechazados.length > 0 && (
              <section aria-labelledby="rechazados-titulo">
                <h2 id="rechazados-titulo" className="mb-2 text-lg font-bold">Solicitudes rechazadas ({rechazados.length})</h2>
                {listaMiembros(rechazados, "Solicitudes rechazadas")}
              </section>
            )}
            <section aria-labelledby="aprobados-titulo">
              <h2 id="aprobados-titulo" className="mb-2 text-lg font-bold">Miembros aprobados ({aprobados.length})</h2>
              {listaMiembros(aprobados, "Lista de miembros")}
            </section>
          </div>
        ))}

      <ConfirmDialog
        open={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        title={dialogo?.title ?? ""}
        description={dialogo?.description ?? ""}
        confirmLabel={dialogo?.confirmLabel}
        onConfirm={dialogo?.onConfirm}
      />

      {editado && carga.estado === "listo" && (
        <DatosPersonalesDialog
          open={editandoNombre}
          onOpenChange={setEditandoNombre}
          title={editado.id === selfId ? "Editar mis datos" : `Editar nombre de ${nombreVisible(editado)}`}
          description="Nombre y apellido tal como se mostrarán en la app. Necesitas conexión para guardar."
          inicial={{ nombre: editado.nombre, apellido: editado.apellido }}
          propio={editado.id === selfId}
          onSave={(datos) => guardarNombre(editado, datos, carga.clubs)}
        />
      )}
    </main>
  );
}
