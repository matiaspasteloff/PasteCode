/**
 * El estado de las actualizaciones de la app, y cómo cambia.
 *
 * Es lógica pura: el main traduce los eventos de electron-updater a
 * `UpdateEvent` y le pregunta a `reduceUpdateState` qué estado sigue. Que viva
 * acá y no en el servicio es lo que permite testear cada transición por tabla,
 * sin Electron ni red.
 *
 * **Ningún evento lleva a descargar ni a instalar.** El reductor sólo describe
 * lo que pasó; las dos acciones con consecuencias (`update:download` y
 * `update:install`) las dispara la persona desde la UI (ADR-0034).
 */

/** Lo que todos los estados llevan, sea cual sea. */
interface UpdateStateBase {
  /** La versión que está corriendo. */
  readonly currentVersion: string;
  /** La versión nueva, cuando se conoce una. */
  readonly availableVersion: string | null;
  /** La página del release: de la versión nueva si hay, si no la lista. */
  readonly releaseUrl: string;
  /**
   * Si esta instalación se puede actualizar sola. Cuando es `false`, lo que se
   * ofrece es abrir la página del release (ver `canInstallInApp`).
   */
  readonly canInstallInApp: boolean;
}

/** El estado, como unión discriminada por `status`. */
export type UpdateState = UpdateStateBase &
  (
    | { readonly status: 'idle' }
    | { readonly status: 'checking' }
    | { readonly status: 'up-to-date' }
    | { readonly status: 'available' }
    | { readonly status: 'downloading'; readonly percent: number }
    | { readonly status: 'downloaded' }
    | { readonly status: 'error'; readonly message: string }
    // La app sin empaquetar: no hay instalador que actualizar ni a quién
    // preguntarle. No se hace ninguna llamada de red.
    | { readonly status: 'unsupported' }
  );

/** Lo que puede pasar, ya traducido de electron-updater. */
export type UpdateEvent =
  | { readonly type: 'checking' }
  | { readonly type: 'not-available' }
  | { readonly type: 'available'; readonly version: string }
  | { readonly type: 'progress'; readonly percent: number }
  | { readonly type: 'downloaded'; readonly version: string }
  | { readonly type: 'error'; readonly message: string };

/** El repositorio de donde salen los releases. */
const RELEASES_URL = 'https://github.com/matiaspasteloff/PasteCode/releases';

/**
 * La página del release de una versión, o la lista de releases si no hay una.
 *
 * Los tags llevan `v` delante (`release.yml` los valida contra la versión del
 * package.json), así que la página de `0.4.0` es la del tag `v0.4.0`.
 *
 * @param version La versión, o `null`.
 * @returns La URL, siempre `https://github.com/...`.
 * @example
 * releasePageUrl('0.4.0'); // 'https://github.com/matiaspasteloff/PasteCode/releases/tag/v0.4.0'
 * releasePageUrl(null);    // 'https://github.com/matiaspasteloff/PasteCode/releases'
 */
export function releasePageUrl(version: string | null): string {
  return version === null
    ? RELEASES_URL
    : `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`;
}

/**
 * El estado con el que arranca la app.
 *
 * @param currentVersion La versión que corre.
 * @param canInstallInApp Si esta instalación se puede actualizar sola.
 * @param isPackaged Si la app está empaquetada; si no, es `unsupported`.
 * @returns El estado inicial.
 * @example
 * initialUpdateState('0.3.1', true, true); // { status: 'idle', ... }
 */
export function initialUpdateState(
  currentVersion: string,
  canInstallInApp: boolean,
  isPackaged: boolean
): UpdateState {
  return {
    status: isPackaged ? 'idle' : 'unsupported',
    currentVersion,
    availableVersion: null,
    releaseUrl: releasePageUrl(null),
    canInstallInApp,
  };
}

/** La base con una versión nueva conocida. */
function withVersion(state: UpdateState, version: string): UpdateStateBase {
  return { ...base(state), availableVersion: version, releaseUrl: releasePageUrl(version) };
}

/** Lo común de un estado, sin el `status` ni sus campos propios. */
function base(state: UpdateState): UpdateStateBase {
  return {
    currentVersion: state.currentVersion,
    availableVersion: state.availableVersion,
    releaseUrl: state.releaseUrl,
    canInstallInApp: state.canInstallInApp,
  };
}

/**
 * El estado que sigue a un evento.
 *
 * `unsupported` es absorbente: sin empaquetar no hay nada que actualizar, y un
 * evento que llegara igual sería un error de cableado, no un cambio de estado.
 * El porcentaje se acota a 0–100 y se redondea, porque electron-updater lo
 * informa con decimales y la UI no los muestra.
 *
 * @param state El estado actual.
 * @param event Lo que pasó.
 * @returns El estado nuevo. Nunca muta el anterior.
 * @example
 * reduceUpdateState(state, { type: 'available', version: '0.4.0' }); // status 'available'
 */
export function reduceUpdateState(state: UpdateState, event: UpdateEvent): UpdateState {
  if (state.status === 'unsupported') return state;

  switch (event.type) {
    case 'checking':
      return { ...base(state), status: 'checking' };
    case 'not-available':
      return { ...base(state), status: 'up-to-date', availableVersion: null };
    case 'available':
      return { ...withVersion(state, event.version), status: 'available' };
    case 'progress':
      return {
        ...base(state),
        status: 'downloading',
        percent: Math.round(Math.min(100, Math.max(0, event.percent))),
      };
    case 'downloaded':
      return { ...withVersion(state, event.version), status: 'downloaded' };
    case 'error':
      return { ...base(state), status: 'error', message: event.message };
  }
}
