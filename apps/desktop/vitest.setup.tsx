import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

/**
 * Medidas que jsdom le reporta a cualquier elemento.
 *
 * `@tanstack/react-virtual` pinta sólo las filas que entran en el contenedor y
 * lo mide con `offsetHeight`, que en jsdom siempre es 0 porque no hace layout.
 * Sin esto, el virtualizador decide que no entra ninguna fila y los tests del
 * árbol verifican una lista vacía. Los números son arbitrarios; lo que importa
 * es que entren varias filas.
 */
const VIEWPORT_HEIGHT = 600;
const VIEWPORT_WIDTH = 300;

/**
 * jsdom no implementa `ResizeObserver`, y el virtualizador lo usa para saber
 * cuándo cambió el tamaño del contenedor. El stub avisa una vez al observar,
 * con la lista de entradas vacía: la librería cae de nuevo en `offsetHeight`,
 * que es justamente lo que estamos fijando.
 */
class ResizeObserverStub implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(): void {
    this.callback([], this);
  }

  unobserve(): void {
    // Nada que desuscribir: el stub no agenda nada.
  }

  disconnect(): void {
    // Ídem.
  }
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverStub;

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => VIEWPORT_HEIGHT,
  });

  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => VIEWPORT_WIDTH,
  });

  Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return new DOMRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  };

  // Lo usa la navegación por teclado del árbol para seguir al foco.
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // jsdom no scrollea; alcanza con que exista y no explote.
  };
});

afterEach(() => {
  cleanup();
});
