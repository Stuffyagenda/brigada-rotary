import { describe, expect, it } from "vitest";
import { reporteFicticio } from "./fixtures";
import {
  desglosePersonas,
  digitosTelefono,
  enlaceComoLlegar,
  enlaceTel,
  enlaceWhatsApp,
  formatoTelefono,
  haceCuanto,
  listaEntregas,
  listaNecesidades,
  textoMascotas,
  tituloReporte,
  urlSegura,
} from "./format";

describe("teléfono", () => {
  it("normaliza dígitos y quita el prefijo de Panamá", () => {
    expect(digitosTelefono("6000-0001")).toBe("60000001");
    expect(digitosTelefono("+507 6000 0001")).toBe("60000001");
    expect(digitosTelefono("")).toBeNull();
    expect(formatoTelefono("60000001")).toBe("6000-0001");
    expect(formatoTelefono("9960001")).toBe("996-0001");
  });

  it("arma los enlaces tel: y WhatsApp", () => {
    expect(enlaceTel("6000-0001")).toBe("tel:+50760000001");
    expect(enlaceWhatsApp("6000-0001")).toBe("https://wa.me/50760000001");
    expect(enlaceWhatsApp(null)).toBeNull();
  });
});

describe("fechas", () => {
  const ahora = new Date("2026-10-19T12:00:00Z");
  it("dice hace cuánto en español", () => {
    expect(haceCuanto("2026-10-19T11:59:40Z", ahora)).toBe("hace un momento");
    expect(haceCuanto("2026-10-19T11:55:00Z", ahora)).toBe("hace 5 minutos");
    expect(haceCuanto("2026-10-19T09:00:00Z", ahora)).toBe("hace 3 horas");
    expect(haceCuanto("2026-10-18T12:00:00Z", ahora)).toBe("ayer");
    expect(haceCuanto("no es fecha", ahora)).toBeNull();
  });
});

describe("contenido de la ficha", () => {
  const r = reporteFicticio({
    contacto_nombre: null,
    adultos: 2,
    adultos_mayores: 1,
    menores: 3,
    discapacitados: 1,
    casos_medicos: 2,
    condiciones_medicas: ["Hipertenso"],
    perros: 2,
    gatos: 1,
    nec_agua: true,
    nec_lona: true,
    nec_otros: ["Frazadas"],
    ent_kit_alimento: true,
  });

  it("desglosa personas con condiciones médicas", () => {
    expect(desglosePersonas(r).map((l) => l.texto)).toEqual([
      "2 adultos",
      "1 adulto mayor",
      "3 menores",
      "1 persona con discapacidad",
      "2 casos médicos: Hipertenso",
    ]);
    expect(textoMascotas(r)).toBe("2 perros y 1 gato");
  });

  it("lista necesidades y entregas con mayúscula inicial", () => {
    expect(listaNecesidades(r)).toEqual(["Agua", "Lona", "Frazadas"]);
    expect(listaEntregas(r)).toEqual(["Kit de alimentos"]);
  });

  it("usa 'Registro <id>' sin nombre", () => {
    expect(tituloReporte(r)).toBe(`Registro ${r.id.slice(0, 8)}`);
  });

  it("solo acepta enlaces http(s) y arma la ruta de Google Maps", () => {
    expect(urlSegura("javascript:alert(1)")).toBeNull();
    expect(urlSegura("https://ejemplo.test/f.jpg")).toBe("https://ejemplo.test/f.jpg");
    expect(enlaceComoLlegar(7.9, -80.4)).toBe("https://www.google.com/maps/dir/?api=1&destination=7.9,-80.4");
  });
});
