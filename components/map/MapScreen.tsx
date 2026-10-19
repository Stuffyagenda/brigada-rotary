"use client";

/**
 * Pantalla principal: mapa a pantalla completa, buscador, filtros y panel
 * (Vaul en móvil, columna fija en escritorio) con resumen, ficha, formulario
 * o formulario de nueva visita.
 *
 * La vigencia de cada reporte (pendiente, atendido hace 0 a 3, 4 a 6 o 7+ días)
 * se calcula con `useAhora()`: se renueva cada 10 minutos y al volver a la app.
 *
 * Todo el estado navegable vive en la URL (`?reporte=`, `?editar=1`, `?visita=1`, filtros)
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
import { VisitaForm } from "@/components/form/VisitaForm";
import { DesktopPanel } from "@/components/sheet/DesktopPanel";
import { FichaPanel } from "@/components/sheet/FichaPanel";
import { AccionesFicha } from "@/components/sheet/TriageTag";
import { ALTO_ASOMADO, altoPanel, MobileSheet, SNAP, type SnapPanel } from "@/components/sheet/MobileSheet";
import { PanelResumen } from "@/components/sheet/PanelResumen";
import { SyncIndicator } from "@/components/sync/SyncIndicator";
import { useAhora } from "@/hooks/useAhora";
import { useReporte, useReportes } from "@/hooks/useReportes";
import { cn } from "@/lib/cn";
import type { GeocodeResult } from "@/lib/geocode";
import type { LatLng } from "@/lib/pluscode";
import type { Vigencia } from "@/lib/types";
import { vigencia as vigenciaDe } from "@/lib/vigencia";
import type { Capa, MapBounds } from "./BrigadaMap";
import { PanelFiltros, VigenciaChips } from "./Filters";
import { QUERY_ESCRITORIO, useClubs, useMediaQuery, useReducedMotion } from "./hooks";
import { MapControls } from "./MapControls";
import { SearchPill } from "./SearchPill";
import {
  aplicarFiltros,
  contarFiltrosExtra,
  contarPorVigencia,
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
  if (v.tipo === "formulario" || v.tipo === "visita") return SNAP.completa;
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
  const ahora = useAhora();

  // ---- Datos -------------------------------------------------------------
  const { reportes: todos, loading } = useReportes();
  const clubes = useClubs(todos);
  // Nombres de contactos: el buscador nunca los envía a Nominatim.
  const contactos = useMemo(() => todos.map((r) => r.contacto_nombre), [todos]);
  const sinVigencia = useMemo(
    () => aplicarFiltros(todos, filtros, { omitirVigencia: true, ahora }),
    [todos, filtros, ahora],
  );
  const conteo = useMemo(() => contarPorVigencia(sinVigencia, ahora), [sinVigencia, ahora]);
  const visibles = useMemo(
    () =>
      filtros.vigencia.length
        ? sinVigencia.filter((r) => filtros.vigencia.includes(vigenciaDe(r, ahora)))
        : sinVigencia,
    [sinVigencia, filtros.vigencia, ahora],
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
  // Momento orquestado de la ficha al volver de guardar: vigencia anterior del caso.
  const [animacion, setAnimacion] = useState<{ id: string; desde: Vigencia } | null>(null);
  const vigenciaAlAbrir = useRef<{ id: string; vigencia: Vigencia } | null>(null);
  // Formulario de visita con cambios sin guardar: se avisa antes de recargar o cerrar la pestaña.
  const [visitaSucia, setVisitaSucia] = useState(false);

  // Posición del panel: la fija cada vista; el usuario puede arrastrarlo después.
  const clave = `${claveVista(vista)}|${eligiendo}|${filtrosAbiertos}`;
  const [panel, setPanel] = useState({ clave, snap: snapPara(vista, eligiendo, filtrosAbiertos), vista: claveVista(vista) });
  if (panel.clave !== clave) {
    const vistaNueva = claveVista(vista);
    // Al entrar a editar un reporte existente, una ubicación elegida antes no debe moverlo.
    if (vistaNueva !== panel.vista && vista.tipo === "formulario" && vista.id !== "nuevo") setUbicacion(null);
    if (vista.tipo !== "visita") setVisitaSucia(false);
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
    setAnimacion(null);
    irA({ tipo: "resumen" }, { replace: true });
  }, [irA]);

  const abrirFicha = useCallback(
    (id: string) => {
      setFiltrosAbiertos(false);
      setAnimacion(null);
      irA({ tipo: "ficha", id }, { replace: vista.tipo === "ficha" });
    },
    [irA, vista.tipo],
  );

  /** Guarda la vigencia del caso antes de abrir un formulario (para el momento orquestado). */
  const recordarVigencia = useCallback(
    (id: string) => {
      vigenciaAlAbrir.current =
        seleccionado?.id === id ? { id, vigencia: vigenciaDe(seleccionado, new Date()) } : null;
    },
    [seleccionado],
  );

  /** Al volver a la ficha tras guardar: la franja cambia desde la vigencia anterior. */
  const volverTrasGuardar = useCallback(
    (id: string) => {
      const antes = vigenciaAlAbrir.current;
      vigenciaAlAbrir.current = null;
      setAnimacion(antes?.id === id ? { id, desde: antes.vigencia } : null);
      irA({ tipo: "ficha", id }, { replace: true });
    },
    [irA],
  );

  const abrirEdicion = useCallback(
    (id: string) => {
      recordarVigencia(id);
      irA({ tipo: "formulario", id });
    },
    [irA, recordarVigencia],
  );

  const abrirVisita = useCallback(
    (id: string) => {
      recordarVigencia(id);
      irA({ tipo: "visita", id });
    },
    [irA, recordarVigencia],
  );

  const abrirNuevo = useCallback(() => {
    setFiltrosAbiertos(false);
    vigenciaAlAbrir.current = null;
    irA({ tipo: "formulario", id: "nuevo" }, { replace: vista.tipo !== "resumen" });
  }, [irA, vista.tipo]);

  // Con una visita a medio escribir, el navegador pregunta antes de recargar o cerrar.
  useEffect(() => {
    if (!visitaSucia) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [visitaSucia]);

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
      // Con un formulario abierto, un toque en un pin no debe descartar lo escrito.
      if (vista.tipo === "formulario" || vista.tipo === "visita") return;
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
  const hayFiltros = filtros.vigencia.length + contarFiltrosExtra(filtros) > 0;
  const titulo =
    vista.tipo === "visita"
      ? "Registrar nueva visita"
      : vista.tipo === "formulario"
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
        onSaved={(id) => {
          setUbicacion(null);
          setEligiendo(false);
          volverTrasGuardar(id);
        }}
      />
    );
  } else if (vista.tipo === "visita") {
    const id = vista.id;
    contenido = (
      // Si el formulario no gestiona su propio scroll, este contenedor lo hace.
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <VisitaForm
          key={id}
          reporteId={id}
          onClose={() => {
            vigenciaAlAbrir.current = null;
            irA({ tipo: "ficha", id }, { replace: true });
          }}
          onSaved={() => volverTrasGuardar(id)}
          onDirtyChange={setVisitaSucia}
        />
      </div>
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
        animarDesde={animacion?.id === vista.id ? animacion.desde : null}
        ahora={ahora}
        onCerrar={cerrarFicha}
        onEditar={() => abrirEdicion(vista.id)}
        onRegistrarVisita={() => abrirVisita(vista.id)}
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
        ahora={ahora}
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
    <VigenciaChips
      filtros={filtros}
      conteo={conteo}
      onChange={setFiltros}
      flotante={!esEscritorio}
      onAbrirFiltros={() => setFiltrosAbiertos((v) => !v)}
      filtrosAbiertos={filtrosAbiertos}
    />
  );

  const conFormulario = vista.tipo === "formulario" || vista.tipo === "visita";
  const mostrarFab = !conFormulario && !eligiendo && (esEscritorio || snap === SNAP.asomado);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-paper">
      {esEscritorio && (
        <DesktopPanel
          titulo={titulo}
          vistaKey={vistaKey}
          contenidoPropio={conFormulario}
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
            ahora={ahora}
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
          contenidoPropio={conFormulario}
          pie={
            vista.tipo === "ficha" && !filtrosAbiertos && seleccionado ? (
              <AccionesFicha
                vigencia={vigenciaDe(seleccionado, ahora)}
                onEditar={() => abrirEdicion(seleccionado.id)}
                onRegistrarEntrega={() => abrirEdicion(seleccionado.id)}
                onRegistrarVisita={() => abrirVisita(seleccionado.id)}
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
