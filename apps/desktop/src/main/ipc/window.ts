import {
  CloseWindowRequestSchema,
  IsWindowMaximizedRequestSchema,
  MinimizeWindowRequestSchema,
  ToggleMaximizeWindowRequestSchema,
} from '@pastecode/ipc-contract';
import type { BrowserWindow } from 'electron';
import { BrowserWindow as ElectronBrowserWindow } from 'electron';

import type { EventRecipient } from './emitter.js';
import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/**
 * La ventana que mandó el pedido.
 *
 * Se resuelve por `getAllWindows()[0]` y no por el `event.sender` del handler
 * porque `registerHandler` no lo expone a propósito: el `sender` trae
 * `senderFrame` y con él toda la superficie de Electron, que es lo que el
 * envoltorio existe para no repartir. Con una sola ventana la diferencia es
 * ninguna; el día que haya dos, esto es lo que hay que cambiar.
 */
function mainWindow(): BrowserWindow | undefined {
  return ElectronBrowserWindow.getAllWindows()[0];
}

/**
 * Registra los handlers del dominio `window`.
 *
 * Existen desde [ADR-0030](../../../../../docs/adr/0030-barra-de-titulo-propia.md):
 * la ventana va sin marco y los tres botones los dibuja el renderer, así que
 * minimizar, maximizar y cerrar pasan a ser canales como cualquier otro.
 *
 * @example
 * registerWindowIpcHandlers(); // antes de app.whenReady()
 */
export function registerWindowIpcHandlers(): void {
  registerHandler('window:minimize', MinimizeWindowRequestSchema, () => {
    mainWindow()?.minimize();

    return {};
  });

  registerHandler('window:toggleMaximize', ToggleMaximizeWindowRequestSchema, () => {
    const window = mainWindow();

    if (window === undefined) return {};

    // Un solo canal y no dos: el estado lo tiene el main, y hacer que el
    // renderer elija entre maximizar y restaurar lo obligaría a decidir con un
    // estado que pudo cambiar hace un milisegundo por un arrastre al borde.
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();

    return {};
  });

  registerHandler('window:close', CloseWindowRequestSchema, () => {
    // `close()` y no `destroy()`: dispara `before-quit`, que es donde vive el
    // guardado de sesión y la limpieza de procesos hijo de RNF-10. Destruir la
    // ventana se saltearía las dos cosas.
    mainWindow()?.close();

    return {};
  });

  registerHandler('window:isMaximized', IsWindowMaximizedRequestSchema, () => ({
    isMaximized: mainWindow()?.isMaximized() ?? false,
  }));
}

/**
 * Lo único que `watchMaximizedState` necesita de una ventana.
 *
 * `BrowserWindow` lo cumple estructuralmente. Pedir la interfaz mínima y no la
 * clase de Electron es lo que deja testear esto en Node sin levantar una app:
 * es la misma razón por la que `EventRecipient` existe, y de hecho lo extiende.
 */
export interface MaximizableWindow extends EventRecipient {
  isMaximized(): boolean;
  on(event: 'maximize' | 'unmaximize' | 'leave-full-screen', listener: () => void): void;
}

/**
 * Avisa al renderer cada vez que la ventana se maximiza o se restaura.
 *
 * **No alcanza con que el renderer pregunte al montar.** El estado cambia
 * también sin que nadie apriete un botón: arrastrar la ventana al borde
 * superior la maximiza y un doble click en la barra la restaura. Sin este
 * evento, el glifo del botón se queda mostrando lo contrario de lo que pasó.
 *
 * Se engancha al crear la ventana y no al registrar los handlers porque
 * necesita la ventana, que en ese momento todavía no existe.
 *
 * @param window La ventana recién creada.
 * @example
 * watchMaximizedState(window);
 */
export function watchMaximizedState(window: MaximizableWindow): void {
  const publish = (): void => {
    emit(window, 'window:maximizedChanged', { isMaximized: window.isMaximized() });
  };

  window.on('maximize', publish);
  window.on('unmaximize', publish);
  // Salir de pantalla completa deja la ventana en un estado que ninguno de los
  // dos eventos de arriba informa, y el botón tiene que reflejarlo igual.
  window.on('leave-full-screen', publish);
}
