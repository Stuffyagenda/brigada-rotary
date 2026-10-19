import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { altoPanel, MobileSheet, SNAP } from "./MobileSheet";

describe("MobileSheet", () => {
  it("no es modal: el mapa y la barra siguen accesibles (sin aria-hidden)", async () => {
    render(
      <div>
        <main data-testid="mapa">
          <button type="button">Mi ubicación</button>
        </main>
        <MobileSheet snap={SNAP.asomado} onSnapChange={vi.fn()} titulo="Resumen de la zona" onEscape={vi.fn()} vistaKey="resumen">
          <p>Contenido del panel</p>
        </MobileSheet>
      </div>,
    );
    expect(await screen.findByText("Contenido del panel")).toBeInTheDocument();
    expect(screen.getByTestId("mapa").closest("[aria-hidden='true']")).toBeNull();
    expect(screen.getByRole("button", { name: "Mi ubicación" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Resumen de la zona" })).toBeInTheDocument();
  });

  it("Tab no queda atrapado en el panel (el FocusScope de Radix no hace loop)", async () => {
    render(
      <div>
        <button type="button">Buscar</button>
        <MobileSheet snap={SNAP.media} onSnapChange={vi.fn()} titulo="Ficha" onEscape={vi.fn()} vistaKey="ficha">
          <button type="button">Primero</button>
          <button type="button">Último</button>
        </MobileSheet>
      </div>,
    );
    const primero = await screen.findByRole("button", { name: "Primero" });
    const ultimo = screen.getByRole("button", { name: "Último" });

    // Tab en el último: el navegador debe seguir al siguiente elemento de la página.
    ultimo.focus();
    expect(fireEvent.keyDown(ultimo, { key: "Tab" })).toBe(true);
    expect(ultimo).toHaveFocus();

    // Mayús+Tab en el primero: vuelve a lo anterior (buscador, controles del mapa…).
    primero.focus();
    expect(fireEvent.keyDown(primero, { key: "Tab", shiftKey: true })).toBe(true);
    expect(primero).toHaveFocus();
  });

  it("calcula el alto tapado por cada posición", () => {
    expect(altoPanel(SNAP.asomado, 800)).toBe(156);
    expect(altoPanel(SNAP.media, 800)).toBe(496);
    expect(altoPanel(SNAP.completa, 800)).toBe(800);
  });
});
