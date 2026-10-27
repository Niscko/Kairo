import "@testing-library/jest-dom/vitest";

// jsdom no implementa scrollTo ni ResizeObserver, usados por algunos componentes.
window.scrollTo = () => {};

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;