import { t } from '../../i18n/index.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';

/**
 * Encabezado de la barra lateral: el nombre del workspace y el botón para
 * abrir otro.
 *
 * Es un componente con lógica —lee y escribe el store— y por eso no recibe
 * props. El día que haya una versión puramente presentacional del encabezado,
 * se parte; hoy partirlo sería una capa que no hace nada.
 */
export function WorkspaceHeader(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const isOpening = useWorkspaceStore((state) => state.isOpening);
  const error = useWorkspaceStore((state) => state.error);
  const open = useWorkspaceStore((state) => state.open);

  return (
    <header className="workspace-header">
      <h2 className="workspace-header__name" data-testid="workspace-name">
        {workspace?.name ?? t('workspace.emptyTitle')}
      </h2>

      <button
        type="button"
        className="workspace-header__action"
        onClick={() => {
          // El store no lanza: los errores del IPC quedan en `error`. El
          // `void` es explícito porque la regla de promesas flotantes exige
          // que la decisión de no esperar esté escrita, no implícita.
          void open();
        }}
        disabled={isOpening}
      >
        {isOpening ? t('workspace.opening') : t('workspace.open')}
      </button>

      {error !== null && (
        // `userMessage` y nunca `message`: RNF-25. El técnico quedó en el log
        // del main.
        <p className="workspace-header__error" role="alert" data-testid="workspace-error">
          {error.userMessage}
        </p>
      )}
    </header>
  );
}
