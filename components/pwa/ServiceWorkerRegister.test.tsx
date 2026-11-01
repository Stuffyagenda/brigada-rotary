import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const { INTERVALO_ACTUALIZACION_MS, MSG_VERSION_NUEVA, ServiceWorkerRegister } = await import(
  "@/components/pwa/ServiceWorkerRegister"
);

/** `navigator.serviceWorker` simulado, con `controllerchange` disparable. */
function simularServiceWorker({ controller }: { controller: boolean }) {
  const eventos = new EventTarget();
  const registro = { update: vi.fn(async () => {}), unregister: vi.fn(async () => true) };
  const sw = {
    controller: controller ? {} : null,
    register: vi.fn(async () => registro),
    getRegistrations: vi.fn(async () => [registro]),
    addEventListener: eventos.addEventListener.bind(eventos),
    removeEventListener: eventos.removeEventListener.bind(eventos),
    cambiarControlador: () => eventos.dispatchEvent(new Event("controllerchange")),
  };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
  return { sw, registro };
}

function ponerVisibilidad(estado: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => estado });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Espera a que se resuelva `register()` (promesas pendientes). */
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mocks.toast.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  // @ts-expect-error se quita el simulado
  delete navigator.serviceWorker;
});

describe("ServiceWorkerRegister en producción", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("registra /sw.js y busca una versión nueva al volver a la app", async () => {
    const { sw, registro } = simularServiceWorker({ controller: true });
    render(<ServiceWorkerRegister />);
    await tick();
    expect(sw.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });

    ponerVisibilidad("hidden");
    expect(registro.update).not.toHaveBeenCalled();
    ponerVisibilidad("visible");
    expect(registro.update).toHaveBeenCalledOnce();
  });

  it("busca una versión nueva cada hora con la app abierta", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { registro } = simularServiceWorker({ controller: true });
    render(<ServiceWorkerRegister />);
    await tick();
    vi.advanceTimersByTime(INTERVALO_ACTUALIZACION_MS);
    expect(registro.update).toHaveBeenCalledOnce();
  });

  it("cuando la versión nueva toma el control, avisa con «Actualizar» (sin recargar sola)", async () => {
    const { sw } = simularServiceWorker({ controller: true });
    render(<ServiceWorkerRegister />);
    await tick();
    sw.cambiarControlador();
    expect(mocks.toast).toHaveBeenCalledOnce();
    const [mensaje, opciones] = mocks.toast.mock.calls[0];
    expect(mensaje).toBe(MSG_VERSION_NUEVA);
    expect(opciones).toMatchObject({ duration: Infinity, action: { label: "Actualizar" } });
  });

  it("en la primera instalación (sin controller previo) no avisa", async () => {
    const { sw } = simularServiceWorker({ controller: false });
    render(<ServiceWorkerRegister />);
    await tick();
    sw.cambiarControlador();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("al desmontar deja de escuchar", async () => {
    const { sw, registro } = simularServiceWorker({ controller: true });
    const { unmount } = render(<ServiceWorkerRegister />);
    await tick();
    unmount();
    sw.cambiarControlador();
    ponerVisibilidad("visible");
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(registro.update).not.toHaveBeenCalled();
  });
});

describe("ServiceWorkerRegister en desarrollo", () => {
  it("no registra y desregistra los service workers que encuentre", async () => {
    const { sw, registro } = simularServiceWorker({ controller: false });
    render(<ServiceWorkerRegister />);
    await tick();
    expect(sw.register).not.toHaveBeenCalled();
    expect(registro.unregister).toHaveBeenCalledOnce();
  });
});
