"use client";

/**
 * Buscador en píldora: SOLO Plus Codes y comunidades (lib/geocode). Nunca se
 * usa para nombres o teléfonos de familias: el texto libre puede terminar en
 * Nominatim (un servicio externo), así que los términos que parecen teléfonos,
 * correos o nombres de contactos locales no se envían. La búsqueda por contacto
 * está en /registros.
 */
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { toast } from "sonner";
import { geocode, GEOCODE_NO_ENCONTRADO, type GeocodeResult } from "@/lib/geocode";
import { cn } from "@/lib/cn";

/** Placeholders de más largo a más corto: se usa el más largo que quepa. */
const PLACEHOLDERS = ["Comunidad o código", "Lugar o código", "Buscar lugar", "Buscar"] as const;

/**
 * Elige el placeholder más largo que cabe en el input (cambia con el ancho de la
 * pantalla y con lo que ocupa el indicador de sincronización a su lado).
 */
function usePlaceholderQueCabe(ref: RefObject<HTMLInputElement | null>): string {
  const [texto, setTexto] = useState<string>(PLACEHOLDERS[0]);
  useEffect(() => {
    const input = ref.current;
    if (!input || typeof ResizeObserver === "undefined") return;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    const elegir = () => {
      const cs = getComputedStyle(input);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const disponible = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setTexto(PLACEHOLDERS.find((t) => ctx.measureText(t).width <= disponible) ?? PLACEHOLDERS[PLACEHOLDERS.length - 1]);
    };
    elegir();
    const ro = new ResizeObserver(elegir);
    ro.observe(input);
    // La fuente web puede llegar después y cambiar las medidas.
    void document.fonts?.ready.then(elegir);
    return () => ro.disconnect();
  }, [ref]);
  return texto;
}

export interface SearchPillProps {
  onResult: (resultado: GeocodeResult) => void;
  /** Nombres de contactos locales: si el término coincide, no se consulta Nominatim. */
  nombresExcluidos?: readonly (string | null | undefined)[];
  className?: string;
}

export function SearchPill({ onResult, nombresExcluidos, className }: SearchPillProps) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const placeholder = usePlaceholderQueCabe(inputRef);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    const termino = texto.trim();
    if (!termino || buscando) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBuscando(true);
    try {
      const r = await geocode(termino, { signal: ac.signal, excluir: nombresExcluidos });
      if (ac.signal.aborted) return;
      if (r) {
        onResult(r);
        inputRef.current?.blur();
      } else {
        toast.error(
          navigator.onLine
            ? GEOCODE_NO_ENCONTRADO
            : "Sin señal solo se encuentran Plus Codes y comunidades conocidas (ej: Chitré, Las Tablas, Pesé).",
        );
      }
    } finally {
      if (!ac.signal.aborted) setBuscando(false);
    }
  }

  return (
    <form
      role="search"
      onSubmit={buscar}
      className={cn(
        "flex h-13 min-w-0 items-center rounded-full border border-line bg-white pr-1 pl-4",
        "shadow-[0_1px_2px_rgb(28_39_51/0.18),0_4px_14px_rgb(28_39_51/0.12)]",
        // Anillo de foco en la píldora entera (como :focus-visible en globals.css),
        // no en el input. Solo al escribir: los botones internos tienen el suyo.
        "has-[input:focus-visible]:border-ink has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-gold",
        "has-[input:focus-visible]:shadow-[0_0_0_2px_var(--color-ink),0_1px_2px_rgb(28_39_51/0.18),0_4px_14px_rgb(28_39_51/0.12)]",
        className,
      )}
    >
      <label htmlFor={id} className="sr-only">
        Buscar comunidad o Plus Code
      </label>
      <Search aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-ink placeholder:text-ink-soft focus-visible:shadow-none focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {texto && (
        <button
          type="button"
          onClick={() => {
            setTexto("");
            inputRef.current?.focus();
          }}
          aria-label="Borrar búsqueda"
          className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:text-ink"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      )}
      {/* Sin texto se oculta: Enter / la tecla "buscar" del teclado también envían. */}
      <button
        type="submit"
        hidden={!texto.trim()}
        disabled={buscando}
        aria-busy={buscando}
        className={cn(
          "h-11 shrink-0 rounded-full bg-rotary px-4 font-semibold text-white",
          "transition-[scale,background-color] duration-140 ease-out motion-safe:active:scale-[0.97] hover:bg-rotary-strong",
          "disabled:bg-line disabled:text-ink-soft",
        )}
      >
        {buscando ? "Buscando" : "Buscar"}
      </button>
    </form>
  );
}
