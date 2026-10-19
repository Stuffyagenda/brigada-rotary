// Configuración común de los tests unitarios (Vitest + jsdom).
import "@testing-library/jest-dom/vitest";
// IndexedDB en memoria para probar Dexie sin navegador.
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
