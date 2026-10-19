"use client";

/**
 * Pantalla principal: mapa a pantalla completa, buscador, filtros y panel
 * (Vaul en móvil, columna fija en escritorio) con resumen, ficha o formulario.
 *
 * Todo el estado navegable vive en la URL (`?reporte=`, `?editar=1`, filtros)
 * y se actualiza con `history.pushState/replaceState`, que Next integra con
 * `useSearchParams` sin pedir nada al servidor (funciona sin conexión).
 * El mapa nunca se desmonta.
 */
import type { Map as LeafletMap } from "leaflet";
import { Plus, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { ReportForm } from "@/components/form/ReportForm";
import { DesktopPanel } from "@/components/sheet/DesktopPanel";
import { FichaPanel } from "@/components/sheet/FichaPanel";
import { AccionesFicha } from "@/components/sheet/TriageTag";
import { ALTO_ASOMADO, altoPanel, MobileSheet, SNAP, type SnapPanel } from "@/components/sheet/MobileSheet";
import { PanelResumen } from "@/components/sheet/PanelResumen";
import { SyncIndicator } from "@/components/sync/SyncIndicator";
import { useReporte, useReportes } from "@/hooks/useReportes";
import { useProfile } from "@/lib/auth/profile";
import { cn } from "@/lib/cn";
import type { GeocodeResult } from "@/lib/geocode";
import type { LatLng } from "@/lib/pluscode";
import type { Capa, MapBounds } from "./BrigadaMap";
import { EstadoChips, PanelFiltros } from "./Filters";
import { QUERY_ESCRITORIO, useClubs, useMediaQuery, useReducedMotion } from "./hooks";
import { MapControls } from "./MapControls";
import { SearchPill } from "./SearchPill";
import {
  aplicarFiltros,
  contarFiltrosExtra,
  contarPorEstado,
  hrefDe,
  parseFiltros,
  parseVista,
  writeFiltros,
  writeVista,
  type FiltrosMapa,
  type VistaPanel,
} from "./url-state";

const BrigadaMap = dynamic(() => import("./BrigadaMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-map-bg" />,
});

/** Alto aproximado de la barra superior (buscador), para encuadrar pines. */
const ALTO_BARRA = 84;

function dentro(b: MapBounds, r: { lat: number; lng: number }): boolean {
  return r.lat <= b.north && r.lat >= b.south && r.lng <= b.east && r.lng >= b.west;
}

function claveVista(v: VistaPanel): string {
  return v.tipo === "resumen" ? "resumen" : `${v.tipo}:${v.id}`;
}

function snapPara(v: VistaPanel, eligiendo: boolean, filtrosAbiertos: boolean): SnapPanel {
  if (eligiendo) return SNAP.asomado;
  if (v.tipo === "formulario") return SNAP.completa;
  if (filtrosAbiertos) return SNAP.media;
  if (v.tipo === "ficha") return SNAP.media;
  return SNAP.asomado;
}

function navegarUrl(params: URLSearchParams, replace: boolean): void {
  const href = hrefDe(window.location.pathname, params);
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
}

export function MapScreen() {
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const filtros = useMemo(() => parseFiltros(new URLSearchParams(qs)), [qs]);
  const vista = useMemo(() => parseVista(new URLSearchParams(qs)), [qs]);
  const esEscritorio = useMediaQuery(QUERY_ESCRITORIO);
  const reducedMotion = useReducedMotion();
  const { isAdmin } = useProfile();

  // ---- Datos -------------------------------------------------------------
  const { reportes: todos, loading } = useReportes();
  const clubes = useClubs(todos);
  // Nombres de contactos: el buscador nunca los envía a Nominatim.
  const contactos = useMemo(() => todos.map((r) => r.contacto_nombre), [todos]);
  const sinEstado = useMemo(() => aplicarFiltros(todos, filtros, { omitirEstado: true }), [todos, filtros]);
  const conteo = useMemo(() => contarPorEstado(sinEstado), [sinEstado]);
  const visibles = useMemo(
    () => (filtros.estado.length ? sinEstado.filter((r) => filtros.estado.includes(r.estado)) : sinEstado),
    [sinEstado, filtros.estado],
  );
  const idSeleccionado = vista.tipo === "resumen" || vista.id === "nuevo" ? null : vista.id;
  const { reporte: seleccionado } = useReporte(idSeleccionado);
  // El caso abierto siempre se ve en el mapa, aunque los filtros lo oculten.
  const pines = useMemo(
    () => (seleccionado && !visibles.some((r) => r.id === seleccionado.id) ? [...visibles, seleccionado] : visibles),
    [visibles, seleccionado],
  );

  // ---- Estado de la pantalla ----------------------------------------------
  const [mapa, setMapa] = useState<LeafletMap | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [ubicacion, setUbicacion] = useState<LatLng | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [capa, setCapa] = useState<Capa>("calles");
  const [localizando, setLocalizando] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [animarAtendidoId, setAnimarAtendidoId] = useState<string | null>(null);
  const estadoAlEditar = useRef<string | null>(null);

  // Posición del panel: la fija cada vista; el usuario puede arrastrarlo después.
  const clave = `${claveVista(vista)}|${eligiendo}|${filtrosAbiertos}`;
  const [panel, setPanel] = useState({ clave, snap: snapPara(vista, eligiendo, filtrosAbiertos), vista: claveVista(vista) });
  if (panel.clave !== clave) {
    const vistaNueva = claveVista(vista);
    // Al entrar a editar un reporte existente, una ubicación elegida antes no debe moverlo.
    if (vistaNueva !== panel.vista && vista.tipo === "formulario" && vista.id !== "nuevo") setUbicacion(null);
    setPanel({ clave, snap: snapPara(vista, eligiendo, filtrosAbiertos), vista: vistaNueva });
  }
  const snap = panel.snap;
  const setSnap = useCallback((s: SnapPanel) => setPanel((p) => ({ ...p, snap: s })), []);

  const enZona = useMemo(() => (bounds ? visibles.filter((r) => dentro(bounds, r)) : visibles), [visibles, bounds]);

  // ---- Navegación ----------------------------------------------------------
  const irA = useCallback((v: VistaPanel, { replace = false }: { replace?: boolean } = {}) => {
    navegarUrl(writeVista(new URLSearchParams(window.location.search), v), replace);
  }, []);

  const setFiltros = useCallback((f: FiltrosMapa) => {
    navegarUrl(writeFiltros(new URLSearchParams(window.location.search), f), true);
  }, []);

  const cerrarFicha = useCallback(() => {
    setAnimarAtendidoId(null);
    irA({ tipo: "resumen" }, { replace: true });
  }, [irA]);

  const abrirFicha = useCallback(
    (id: string) => {
      setFiltrosAbiertos(false);
      setAnimarAtendidoId(null);
      irA({ tipo: "ficha", id }, { replace: vista.tipo === "ficha" });
    },
    [irA, vista.tipo],
  );

  const abrirEdicion = useCallback(
    (id: string) => {
      estadoAlEditar.current = seleccionado?.id === id ? seleccionado.estado : null;
      irA({ tipo: "formulario", id });
    },
    [irA, seleccionado],
  );

  const abrirNuevo = useCallback(() => {
    setFiltrosAbiertos(false);
    estadoAlEditar.current = null;
    irA({ tipo: "formulario", id: "nuevo" }, { replace: vista.tipo !== "resumen" });
  }, [irA, vista.tipo]);

  // ---- Mapa ----------------------------------------------------------------
  const altoTapado = useCallback(
    (s: SnapPanel) => (esEscritorio ? 0 : altoPanel(s, mapa?.getSize().y ?? window.innerHeight)),
    [esEscritorio, mapa],
  );

  /** Mueve el mapa lo justo para que el punto quede visible sobre el panel. */
  const encuadrar = useCallback(
    (p: LatLng, { zoomMin = 16, forzar = false }: { zoomMin?: number; forzar?: boolean } = {}) => {
      if (!mapa) return;
      const size = mapa.getSize();
      const abajo = size.y - altoTapado(snapPara({ tipo: "ficha", id: "" }, false, false));
      const arriba = ALTO_BARRA;
      const punto = mapa.latLngToContainerPoint([p.lat, p.lng]);
      const margen = 48;
      const visible =
        punto.x > margen && punto.x < size.x - margen && punto.y > arriba + margen && punto.y < abajo - margen;
      // Visible y con zoom de calle: no se mueve nada. Desde lejos, se acerca al caso.
      if (visible && !forzar && mapa.getZoom() >= 14) return;
      const zoom = Math.max(mapa.getZoom(), zoomMin);
      const objetivoY = (arriba + abajo) / 2;
      const centro = mapa.project([p.lat, p.lng], zoom).subtract([0, objetivoY - size.y / 2]);
      mapa.setView(mapa.unproject(centro, zoom), zoom, { animate: !reducedMotion });
    },
    [mapa, altoTapado, reducedMotion],
  );

  // Al abrir un caso (también por enlace desde /registros), encuadrarlo una vez.
  const encuadrado = useRef<string | null>(null);
  useEffect(() => {
    if (!idSeleccionado) {
      encuadrado.current = null;
      return;
    }
    if (!seleccionado || !mapa || encuadrado.current === seleccionado.id) return;
    encuadrado.current = seleccionado.id;
    encuadrar(seleccionado);
  }, [idSeleccionado, seleccionado, mapa, encuadrar]);

  const onPick = useCallback((p: LatLng) => {
    setUbicacion(p);
    setEligiendo(false);
  }, []);

  const onSelect = useCallback(
    (id: string) => {
      // Con el formulario abierto, un toque en un pin no debe descartar lo escrito.
      if (vista.tipo === "formulario") return;
      abrirFicha(id);
    },
    [vista.tipo, abrirFicha],
  );

  const onBackgroundClick = useCallback(() => {
    if (filtrosAbiertos) setFiltrosAbiertos(false);
    else if (vista.tipo === "ficha") cerrarFicha();
  }, [filtrosAbiertos, vista.tipo, cerrarFicha]);

  function miUbicacion() {
    if (!("geolocation" in navigator)) {
      toast.error("Este navegador no permite obtener la ubicación. Elige el punto en el mapa.");
      return;
    }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalizando(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUbicacion(p);
        setEligiendo(false);
        mapa?.setView([p.lat, p.lng], 17, { animate: !reducedMotion });
      },
      (err) => {
        setLocalizando(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "No hay permiso para usar tu ubicación. Actívalo en los ajustes del navegador o elige el punto en el mapa."
            : "No se pudo obtener tu ubicación. Sal a un lugar abierto e inténtalo de nuevo, o elige el punto en el mapa.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  function onBusqueda(r: GeocodeResult) {
    // Un Plus Code es un punto exacto: se usa como ubicación. Una comunidad solo centra el mapa.
    if (r.source === "pluscode") setUbicacion({ lat: r.lat, lng: r.lng });
    mapa?.setView([r.lat, r.lng], r.zoom, { animate: !reducedMotion });
  }

  const onEscape = useCallback(() => {
    if (eligiendo) setEligiendo(false);
    else if (filtrosAbiertos) setFiltrosAbiertos(false);
    else if (vista.tipo === "ficha") cerrarFicha();
  }, [eligiendo, filtrosAbiertos, vista.tipo, cerrarFicha]);

  useEffect(() => {
    if (!esEscritorio) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [esEscritorio, onEscape]);

  // ---- Contenido del panel ------------------------------------------------
  const hayFiltros = filtros.estado.length + contarFiltrosExtra(filtros) > 0;
  const titulo =
    vista.tipo === "formulario"
      ? vista.id === "nuevo"
        ? "Registrar familia"
        : "Editar reporte"
      : vista.tipo === "ficha"
        ? "Ficha de la familia"
        : filtrosAbiertos
          ? "Filtros"
          : "Resumen de la zona";

  let contenido: ReactNode;
  if (vista.tipo === "formulario") {
    contenido = (
      <ReportForm
        key={vista.id}
        reporteId={vista.id}
        ubicacion={ubicacion}
        onRequestPickLocation={() => setEligiendo(true)}
        onClose={() =>
          vista.id === "nuevo"
            ? irA({ tipo: "resumen" }, { replace: true })
            : irA({ tipo: "ficha", id: vista.id }, { replace: true })
        }
        onSaved={(id, estado) => {
          if (estado === "ATENDIDO" && estadoAlEditar.current === "PENDIENTE") setAnimarAtendidoId(id);
          estadoAlEditar.current = null;
          setUbicacion(null);
          setEligiendo(false);
          irA({ tipo: "ficha", id }, { replace: true });
        }}
      />
    );
  } else if (filtrosAbiertos && !esEscritorio) {
    contenido = (
      <PanelFiltros
        filtros={filtros}
        clubs={clubes.opciones}
        onChange={setFiltros}
        onListo={() => setFiltrosAbiertos(false)}
        total={visibles.length}
      />
    );
  } else if (vista.tipo === "ficha") {
    contenido = (
      <FichaPanel
        id={vista.id}
        nombresClub={clubes.nombres}
        isAdmin={isAdmin}
        animarAtendido={animarAtendidoId === vista.id}
        onCerrar={cerrarFicha}
        onEditar={() => abrirEdicion(vista.id)}
        onBorrado={cerrarFicha}
        conAcciones={esEscritorio}
      />
    );
  } else {
    contenido = (
      <PanelResumen
        enZona={enZona}
        hayReportes={todos.length > 0}
        loading={loading}
        hayFiltros={hayFiltros}
        ubicacion={ubicacion}
        onAbrir={abrirFicha}
        onRegistrarAqui={abrirNuevo}
        onQuitarUbicacion={() => setUbicacion(null)}
        mostrarEnlaceLista={!esEscritorio}
      />
    );
  }
  const vistaKey = `${claveVista(vista)}|${filtrosAbiertos && !esEscritorio}`;

  const chips = (
    <EstadoChips
      filtros={filtros}
      conteo={conteo}
      onChange={setFiltros}
      flotante={!esEscritorio}
      onAbrirFiltros={() => setFiltrosAbiertos((v) => !v)}
      filtrosAbiertos={filtrosAbiertos}
    />
  );

  const mostrarFab = vista.tipo !== "formulario" && !eligiendo && (esEscritorio || snap === SNAP.asomado);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-paper">
      {esEscritorio && (
        <DesktopPanel
          titulo={titulo}
          vistaKey={vistaKey}
          contenidoPropio={vista.tipo === "formulario"}
          filtros={
            <div className="flex flex-col gap-4">
              {chips}
              {filtrosAbiertos && (
                <div className="border-t border-line pt-4">
                  <PanelFiltros
                    filtros={filtros}
                    clubs={clubes.opciones}
                    onChange={setFiltros}
                    onListo={() => setFiltrosAbiertos(false)}
                    total={visibles.length}
                  />
                </div>
              )}
            </div>
          }
        >
          {contenido}
        </DesktopPanel>
      )}

      <main id="contenido" className="relative min-w-0 flex-1">
        <h1 className="sr-only">Mapa de reportes de Brigada Rotary</h1>
        <section aria-label="Mapa" className="absolute inset-0">
          <BrigadaMap
            reportes={pines}
            selectedId={idSeleccionado}
            ubicacion={ubicacion}
            capa={capa}
            picking={eligiendo}
            bottomInset={esEscritorio ? 0 : ALTO_ASOMADO}
            onSelect={onSelect}
            onPick={onPick}
            onBackgroundClick={onBackgroundClick}
            onReady={setMapa}
            onBoundsChange={setBounds}
          />
        </section>

        {/* Barra superior */}
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 px-4 pt-[calc(env(safe-area-inset-top)+12px)] lg:px-5 lg:pt-5">
          <SearchPill onResult={onBusqueda} nombresExcluidos={contactos} className="pointer-events-auto flex-1 lg:max-w-md" />
          <div data-slot="sync-account" className="pointer-events-auto flex h-13 shrink-0 items-center justify-end gap-1 lg:ml-auto">
            <SyncIndicator />
            <AccountMenu />
          </div>
        </header>

        <MapControls
          className="absolute top-[calc(env(safe-area-inset-top)+80px)] right-4 z-10 lg:top-24 lg:right-5"
          localizando={localizando}
          onMiUbicacion={miUbicacion}
          eligiendo={eligiendo}
          onElegir={() => setEligiendo((v) => !v)}
          capa={capa}
          onCapa={setCapa}
          onZoom={esEscritorio ? (d) => (d > 0 ? mapa?.zoomIn() : mapa?.zoomOut()) : undefined}
        />

        {eligiendo && (
          <div
            role="status"
            className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+80px)] z-20 mr-14 flex items-center gap-3 rounded-xl bg-ink py-2 pr-2 pl-4 text-white shadow-lg lg:right-auto lg:left-5 lg:mr-0 lg:max-w-md"
          >
            <p className="flex-1 font-semibold">Toca el lugar de la vivienda</p>
            <button
              type="button"
              onClick={() => setEligiendo(false)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 font-semibold hover:bg-white/10"
            >
              <X aria-hidden="true" className="size-4" />
              Cancelar
            </button>
          </div>
        )}

        {/* Chips de filtro sobre el panel (móvil) */}
        {!esEscritorio && (
          <div
            className={cn(
              "absolute inset-x-0 z-10 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              "bottom-[calc(156px+22px)]",
            )}
          >
            {chips}
          </div>
        )}

        {mostrarFab && (
          <button
            type="button"
            onClick={abrirNuevo}
            className={cn(
              "absolute right-4 z-10 inline-flex h-14 items-center gap-2 rounded-full bg-rotary pr-6 pl-5 text-lg font-semibold text-white",
              "shadow-[0_2px_4px_rgb(23_69_143/0.3),0_8px_20px_rgb(28_39_51/0.22)]",
              "transition-[scale,background-color] duration-140 ease-out motion-safe:active:scale-[0.97] hover:bg-rotary-strong",
              esEscritorio ? "right-6 bottom-8" : "bottom-[calc(156px+22px+56px)]",
            )}
          >
            <Plus aria-hidden="true" className="size-6" strokeWidth={2.5} />
            Registrar familia
          </button>
        )}
      </main>

      {!esEscritorio && (
        <MobileSheet
          snap={snap}
          onSnapChange={setSnap}
          titulo={titulo}
          onEscape={onEscape}
          vistaKey={vistaKey}
          contenidoPropio={vista.tipo === "formulario"}
          pie={
            vista.tipo === "ficha" && !filtrosAbiertos && seleccionado ? (
              <AccionesFicha
                estado={seleccionado.estado}
                onEditar={() => abrirEdicion(seleccionado.id)}
                onRegistrarEntrega={() => abrirEdicion(seleccionado.id)}
              />
            ) : undefined
          }
        >
          {contenido}
        </MobileSheet>
      )}
    </div>
  );
}
