import { describe, expect, it } from "vitest";
import { ordenarVisitas } from "@/hooks/useVisitas";

describe("ordenarVisitas", () => {
  it("de la más reciente a la más antigua: fecha y luego visitado_at", () => {
    const a = { id: "a", fecha: "2026-10-10", visitado_at: "2026-10-10T20:00:00.000Z" };
    const b = { id: "b", fecha: "2026-10-12", visitado_at: "2026-10-12T14:00:00.000Z" };
    const c = { id: "c", fecha: "2026-10-12", visitado_at: "2026-10-12T18:00:00.000Z" };
    const lista = [a, b, c];
    expect(ordenarVisitas(lista).map((v) => v.id)).toEqual(["c", "b", "a"]);
    expect(lista.map((v) => v.id)).toEqual(["a", "b", "c"]);
  });
});
