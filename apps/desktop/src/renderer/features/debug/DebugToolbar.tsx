import type { Request, Response } from '@pastecode/ipc-contract';

import { t } from '../../i18n/index.js';
import type { TranslationKey } from '../../i18n/index.js';
import { useDebugStore } from '../../stores/debug-store.js';

/** El estado de la sesión, tal como lo publica el contrato. */
type DebugState = Response<'debug:getStatus'>['state'];

/** Los cinco controles de RF-503, en el orden en que se usan. */
const CONTROLS: readonly { step: Request<'debug:step'>['step']; labelKey: TranslationKey }[] = [
  { step: 'continue', labelKey: 'debug.continue' },
  { step: 'over', labelKey: 'debug.stepOver' },
  { step: 'into', labelKey: 'debug.stepInto' },
  { step: 'out', labelKey: 'debug.stepOut' },
  { step: 'pause', labelKey: 'debug.pause' },
];

/**
 * Los controles de ejecución ([RF-503](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Cuando no hay sesión, en vez de cinco botones apagados hay un selector con
 * las configuraciones del `launch.json`: son dos estados distintos de la misma
 * barra, y mostrar controles deshabilitados no le dice a nadie qué hacer para
 * habilitarlos.
 *
 * Los pasos se deshabilitan mientras el programa corre —salvo `pause`, que es
 * justamente para eso— porque mandarlos ahí es un error que el adaptador
 * contesta con un mensaje que nadie pidió.
 */
export function DebugToolbar(): React.JSX.Element {
  const state = useDebugStore((store) => store.status.state);

  return state === 'idle' ? <StartControls /> : <RunningControls state={state} />;
}

/** Sin sesión: qué se puede arrancar, o por qué no hay nada que arrancar. */
function StartControls(): React.JSX.Element {
  const { configurations, error } = useDebugStore((store) => store.configurations);

  return (
    <div className="debug-toolbar">
      {error !== null && <span className="debug-toolbar__error">{error.userMessage}</span>}

      {configurations.length === 0 ? (
        <span className="debug-toolbar__hint">{t('debug.noConfigurations')}</span>
      ) : (
        configurations.map((configuration) => (
          <button
            key={configuration.name}
            type="button"
            className="debug-toolbar__button"
            data-testid={`debug-start-${configuration.name}`}
            onClick={() => {
              void window.pastecode.invoke('debug:start', {
                configuration: configuration.name,
              });
            }}
          >
            {t('debug.start')}: {configuration.name}
          </button>
        ))
      )}
    </div>
  );
}

/** Con sesión: los cinco controles y el botón de cortarla. */
function RunningControls({ state }: { state: DebugState }): React.JSX.Element {
  return (
    <div className="debug-toolbar">
      {CONTROLS.map(({ step, labelKey }) => (
        <button
          key={step}
          type="button"
          className="debug-toolbar__button"
          data-testid={`debug-${step}`}
          // `pause` es el único que sirve mientras corre; los demás sólo
          // frenado. Mandarlos en el momento equivocado hace que el adaptador
          // conteste un error que nadie pidió.
          disabled={step === 'pause' ? state !== 'running' : state !== 'stopped'}
          onClick={() => {
            void window.pastecode.invoke('debug:step', { step });
          }}
        >
          {t(labelKey)}
        </button>
      ))}

      <button
        type="button"
        className="debug-toolbar__button debug-toolbar__button--danger"
        data-testid="debug-stop"
        onClick={() => {
          void window.pastecode.invoke('debug:stop', {});
        }}
      >
        {t('debug.stop')}
      </button>
    </div>
  );
}
