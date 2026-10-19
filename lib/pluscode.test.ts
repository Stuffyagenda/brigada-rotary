import { describe, expect, it } from "vitest";
import { decodeFullPlusCode, decodePlusCode, encodePlusCode } from "@/lib/pluscode";

describe("encodePlusCode", () => {
  it("codifica coordenadas reales de la zona", () => {
    expect(encodePlusCode(7.961630869237435, -80.42457282543184)).toBe("66VXXH6G+M5");
    expect(encodePlusCode(7.657187500000001, -80.72668750000001)).toBe("66VXM74F+V8");
  });

  it("devuelve null con coordenadas inválidas", () => {
    expect(encodePlusCode(Number.NaN, -80)).toBeNull();
    expect(encodePlusCode(8, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("acota la latitud y normaliza la longitud", () => {
    expect(encodePlusCode(90, 0)).toMatch(/^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2}$/);
    expect(encodePlusCode(7.9616, 279.5754)).toBe(encodePlusCode(7.9616, -80.4246));
  });
});

describe("decodePlusCode", () => {
  it("ida y vuelta: decodificar y volver a codificar da el mismo código", () => {
    for (const code of ["66VXXH6G+M5", "66VXM74F+V8"]) {
      const c = decodePlusCode(code);
      expect(c).not.toBeNull();
      expect(encodePlusCode(c!.lat, c!.lng)).toBe(code);
    }
  });

  it("el centro de la celda queda a menos de 14 m del punto original", () => {
    const c = decodePlusCode("66VXXH6G+M5")!;
    expect(Math.abs(c.lat - 7.961630869237435)).toBeLessThan(0.000125);
    expect(Math.abs(c.lng - -80.42457282543184)).toBeLessThan(0.000125);
  });

  it("acepta minúsculas, espacios y el código sin '+'", () => {
    expect(decodePlusCode(" 66vx xh6g+m5 ")).toEqual(decodePlusCode("66VXXH6G+M5"));
    expect(decodePlusCode("66VXXH6GM5")).toEqual(decodePlusCode("66VXXH6G+M5"));
  });

  it("resuelve códigos cortos con la referencia [7.965, -80.432]", () => {
    const corto = decodePlusCode("XH6G+M5")!;
    const completo = decodePlusCode("66VXXH6G+M5")!;
    expect(corto.lat).toBeCloseTo(completo.lat, 9);
    expect(corto.lng).toBeCloseTo(completo.lng, 9);
    const corto2 = decodePlusCode("M74F+V8")!;
    expect(encodePlusCode(corto2.lat, corto2.lng)).toBe("66VXM74F+V8");
  });

  it("decodifica códigos de 8 y 11 dígitos", () => {
    const ocho = decodeFullPlusCode("66VXXH6G+")!;
    expect(ocho.latRes).toBe(0.0025);
    const once = decodeFullPlusCode("66VXXH6G+M5C")!;
    expect(once.latRes).toBeCloseTo(0.000025, 12);
    expect(once.lngRes).toBeCloseTo(0.00003125, 12);
    expect(encodePlusCode(once.lat, once.lng)).toBe("66VXXH6G+M5");
  });

  it("rechaza textos que no son Plus Code", () => {
    expect(decodePlusCode("Chitré")).toBeNull();
    expect(decodePlusCode("")).toBeNull();
    expect(decodePlusCode("66VXXH6A+M5")).toBeNull();
    expect(decodePlusCode("66VX+XH6G+M5")).toBeNull();
    expect(decodePlusCode("X+M5")).toBeNull();
  });
});
