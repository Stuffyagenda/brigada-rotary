import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }) }));

import { HOLD_MS, HoldToDelete } from "@/components/ui/HoldToDelete";

function boton() {
  return screen.getByRole("button", { name: "Mantén pulsado 2 segundos para borrar" });
}

describe("HoldToDelete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastError.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tiene un nombre accesible que explica el gesto", () => {
    render(<HoldToDelete onConfirm={vi.fn(async () => {})} />);
    expect(boton()).toHaveTextContent("Mantén pulsado para borrar");
    expect(boton().className).not.toContain("transition-all");
  });

  it("no confirma si se suelta antes de 2 s", async () => {
    const onConfirm = vi.fn(async () => {});
    render(<HoldToDelete onConfirm={onConfirm} />);
    fireEvent.pointerDown(boton(), { pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" });
    expect(boton()).toHaveAttribute("data-fase", "pulsado");
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS - 100);
    });
    fireEvent.pointerUp(boton(), { pointerId: 1, isPrimary: true, pointerType: "touch" });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(boton()).toHaveAttribute("data-fase", "reposo");
  });

  it("confirma al mantener pulsado 2 s", async () => {
    const onConfirm = vi.fn(async () => {});
    render(<HoldToDelete onConfirm={onConfirm} />);
    fireEvent.pointerDown(boton(), { pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancela con pointercancel y con un segundo dedo", async () => {
    const onConfirm = vi.fn(async () => {});
    render(<HoldToDelete onConfirm={onConfirm} />);
    fireEvent.pointerDown(boton(), { pointerId: 1, isPrimary: true, pointerType: "touch" });
    fireEvent.pointerCancel(boton(), { pointerId: 1, pointerType: "touch" });
    fireEvent.pointerDown(boton(), { pointerId: 2, isPrimary: true, pointerType: "touch" });
    fireEvent.pointerDown(boton(), { pointerId: 3, isPrimary: false, pointerType: "touch" });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS * 2);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("funciona con Enter sostenido y se cancela al soltar la tecla", async () => {
    const onConfirm = vi.fn(async () => {});
    render(<HoldToDelete onConfirm={onConfirm} />);
    fireEvent.keyDown(boton(), { key: "Enter" });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.keyUp(boton(), { key: "Enter" });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(boton(), { key: " " });
    // Las repeticiones de la tecla no reinician el temporizador.
    fireEvent.keyDown(boton(), { key: " ", repeat: true });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("muestra el error de onConfirm en un aviso", async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error("Sin señal. No se pudo borrar el reporte.");
    });
    render(<HoldToDelete onConfirm={onConfirm} />);
    fireEvent.pointerDown(boton(), { pointerId: 1, isPrimary: true, pointerType: "mouse", button: 0 });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(toastError).toHaveBeenCalledWith("Sin señal. No se pudo borrar el reporte.");
    expect(boton()).toHaveAttribute("data-fase", "reposo");
  });

  it("muestra «Borrando…» mientras se ejecuta onConfirm", async () => {
    let resolver: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolver = r)));
    render(<HoldToDelete onConfirm={onConfirm} />);
    fireEvent.pointerDown(boton(), { pointerId: 1, isPrimary: true, pointerType: "touch" });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(screen.getByRole("button", { name: "Borrando…" })).toHaveAttribute("data-fase", "borrando");
    await act(async () => {
      resolver();
    });
    expect(boton()).toHaveAttribute("data-fase", "reposo");
  });

  it("no hace nada deshabilitado", async () => {
    const onConfirm = vi.fn(async () => {});
    render(<HoldToDelete onConfirm={onConfirm} disabled />);
    fireEvent.pointerDown(boton(), { pointerId: 1, isPrimary: true, pointerType: "touch" });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
