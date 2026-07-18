import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// O Node 26 expõe um global experimental `localStorage` (undefined sem a
// flag --localstorage-file) que sombreia o do jsdom. Polyfill em memória.
if (window.localStorage === undefined || window.localStorage === null) {
  const data = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
  Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// jsdom não implementa matchMedia (necessário para useReducedMotion do Framer).
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

// Stub de ResizeObserver para componentes animados.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom não implementa getBBox (o Framer Motion o usa para medir SVGs do rig).
const svgPrototype = SVGElement.prototype as SVGElement & {
  getBBox?: () => { x: number; y: number; width: number; height: number };
};
if (typeof svgPrototype.getBBox !== 'function') {
  svgPrototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
}
