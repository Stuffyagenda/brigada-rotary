import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { clampCount, Counter } from "@/components/ui/Counter";
import { YesNo } from "@/components/ui/YesNo";

describe("Button", () => {
  it("es type=button por defecto y responde al clic", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar reporte</Button>);
    const btn = screen.getByRole("button", { name: "Guardar reporte" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn).toHaveAttribute("data-variant", "primary");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("aplica la variante y nunca usa transition-all", () => {
    render(<Button variant="danger">Borrar</Button>);
    const btn = screen.getByRole("button", { name: "Borrar" });
    expect(btn.className).toContain("bg-pending");
    expect(btn.className).not.toContain("transition-all");
    expect(btn.className).toContain("min-h-11");
  });
});

function YesNoControlado({ inicial = false }: { inicial?: boolean }) {
  const [v, setV] = useState(inicial);
  return <YesNo value={v} onChange={setV} label="Agua Potable" />;
}

describe("YesNo", () => {
  it("es un radiogroup accesible con una opción marcada", () => {
    render(<YesNoControlado />);
    const grupo = screen.getByRole("radiogroup", { name: "Agua Potable" });
    expect(grupo).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "No" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Sí" })).toHaveAttribute("aria-checked", "false");
  });

  it("cambia con clic y mueve el marcador", async () => {
    render(<YesNoControlado />);
    await userEvent.click(screen.getByRole("radio", { name: "Sí" }));
    expect(screen.getByRole("radio", { name: "Sí" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("yesno-marker").className).toContain("translate-x-0");
  });

  it("cambia con las flechas del teclado", () => {
    render(<YesNoControlado inicial />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "No" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "No" })).toHaveFocus();
  });
});

function CounterControlado() {
  const [v, setV] = useState(0);
  return <Counter value={v} onChange={setV} label="Adultos (18 a 59)" />;
}

describe("Counter", () => {
  it("suma y resta sin bajar de 0", async () => {
    render(<CounterControlado />);
    const input = screen.getByLabelText("Adultos (18 a 59)");
    const menos = screen.getByRole("button", { name: /Restar uno/ });
    expect(menos).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Sumar uno/ }));
    await userEvent.click(screen.getByRole("button", { name: /Sumar uno/ }));
    expect(input).toHaveValue(2);
    await userEvent.click(menos);
    expect(input).toHaveValue(1);
  });

  it("corrige valores inválidos al escribir", () => {
    render(<CounterControlado />);
    const input = screen.getByLabelText("Adultos (18 a 59)");
    fireEvent.change(input, { target: { value: "7" } });
    expect(input).toHaveValue(7);
    fireEvent.change(input, { target: { value: "-3" } });
    expect(input).toHaveValue(0);
  });

  it("clampCount", () => {
    expect(clampCount("abc")).toBe(0);
    expect(clampCount("4.9")).toBe(4);
    expect(clampCount(12, 0, 10)).toBe(10);
  });
});

function ChipControlado() {
  const [p, setP] = useState(false);
  return (
    <Chip pressed={p} onPressedChange={setP}>
      Ropa
    </Chip>
  );
}

describe("Chip", () => {
  it("alterna aria-pressed", async () => {
    render(<ChipControlado />);
    const chip = screen.getByRole("button", { name: "Ropa" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip.className).toContain("transition-[background-color,border-color]");
  });
});
