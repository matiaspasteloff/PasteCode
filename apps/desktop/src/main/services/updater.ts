import type { UpdateEvent, UpdateState } from '@pastecode/core';
import { reduceUpdateState } from '@pastecode/core';

/**
 * Lo que el servicio necesita de un actualizador. Es la interfaz propia detrás
 * de la cual queda electron-updater (`electron-updater-backend.ts`): los tests
 * usan uno falso y no dependen de la librería ni de la red.
 */
export interface UpdaterBackend {
  /** Se llama con cada cosa que pasa, ya traducida. */
  onEvent(listener: (event: UpdateEvent) => void): void;
  /** `true` ofrece también los prereleases (canal `beta`). */
  setAllowPrerelease(allow: boolean): void;
  check(): Promise<void>;
  download(): Promise<void>;
  /** Cierra la app e instala. No vuelve si la instalación arranca. */
  install(): void;
}

export interface UpdateServiceOptions {
  /** El estado de arranque (`initialUpdateState`). */
  readonly initial: UpdateState;
  /**
   * Carga el actualizador. Se llama **una vez, recién en el primer chequeo**:
   * electron-updater trae consigo `fs-extra`, `js-yaml` y compañía, y cargarlo
   * al arrancar el main se paga en RNF-01 y RNF-04 aunque nadie busque nada.
   */
  readonly loadBackend: () => Promise<UpdaterBackend>;
  /** El canal de las settings en el momento del chequeo. */
  readonly channel: () => 'stable' | 'beta';
  /** Se llama con cada estado nuevo, para emitirlo al renderer. */
  readonly onChange: (state: UpdateState) => void;
}

export interface UpdateService {
  getState(): UpdateState;
  check(): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  install(): void;
}

/** El mensaje de un error cualquiera, para el estado `error`. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Carga el backend una sola vez y corre operaciones sobre él, convirtiendo
 * cualquier falla en un evento `error` en vez de propagarla.
 */
function backendRunner(
  load: () => Promise<UpdaterBackend>,
  dispatch: (event: UpdateEvent) => void
): {
  loaded: () => Promise<UpdaterBackend> | undefined;
  run: (operation: (backend: UpdaterBackend) => Promise<void>) => Promise<void>;
} {
  let backend: Promise<UpdaterBackend> | undefined;

  const ensure = (): Promise<UpdaterBackend> => {
    backend ??= load().then((loaded) => {
      loaded.onEvent(dispatch);
      return loaded;
    });
    return backend;
  };

  const run = async (operation: (backend: UpdaterBackend) => Promise<void>): Promise<void> => {
    let loaded: UpdaterBackend;
    try {
      loaded = await ensure();
    } catch (error) {
      // Si la carga misma falló, se reintenta en el próximo chequeo. Sólo
      // entonces: descartar un backend ya cargado le volvería a registrar los
      // listeners al mismo `autoUpdater`, y cada evento llegaría dos veces.
      backend = undefined;
      dispatch({ type: 'error', message: messageOf(error) });
      return;
    }
    try {
      await operation(loaded);
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) });
    }
  };

  return { loaded: () => backend, run };
}

/**
 * Crea el servicio de actualizaciones.
 *
 * **Nunca descarga ni instala por su cuenta.** Un `available` deja el estado en
 * `available` y nada más: descargar es `download()` e instalar es `install()`,
 * y a los dos los llama sólo el handler de IPC, que sólo llama la UI cuando la
 * persona lo pide (ADR-0034). Las dos además se niegan fuera del estado que
 * corresponde y cuando la instalación no se puede actualizar sola.
 *
 * Sin empaquetar (`unsupported`) ningún método carga el actualizador ni toca
 * la red. Un error —de red, del backend o al cargarlo— termina en el estado
 * `error` y no se propaga: buscar actualizaciones no puede tumbar nada.
 *
 * @param options Estado inicial, cómo cargar el actualizador y a quién avisar.
 * @returns El servicio.
 * @example
 * const updates = createUpdateService({ initial, loadBackend, channel, onChange });
 * await updates.check();
 */
export function createUpdateService(options: UpdateServiceOptions): UpdateService {
  let state = options.initial;

  const dispatch = (event: UpdateEvent): void => {
    const next = reduceUpdateState(state, event);
    if (next === state) return;
    state = next;
    options.onChange(state);
  };

  const runner = backendRunner(options.loadBackend, dispatch);
  const attempt = async (
    operation: (loaded: UpdaterBackend) => Promise<void>
  ): Promise<UpdateState> => {
    await runner.run(operation);
    return state;
  };

  return {
    getState: () => state,

    check: async () => {
      if (state.status === 'unsupported' || state.status === 'downloading') return state;
      return attempt(async (loaded) => {
        loaded.setAllowPrerelease(options.channel() === 'beta');
        await loaded.check();
      });
    },

    download: async () => {
      if (state.status !== 'available' || !state.canInstallInApp) return state;
      return attempt((loaded) => loaded.download());
    },

    install: () => {
      const loaded = runner.loaded();
      if (state.status !== 'downloaded' || !state.canInstallInApp || loaded === undefined)
        return;
      void loaded.then((backend) => {
        backend.install();
      });
    },
  };
}
