import type { Response } from '@pastecode/ipc-contract';
import { useEffect, useState } from 'react';

import { useDebugStore } from '../../stores/debug-store.js';

/** Una variable o un scope, tal como llega del contrato. */
type Variable = Response<'debug:getVariables'>['variables'][number];

/**
 * El árbol de variables y scopes
 * ([RF-504](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * **Los scopes son variables expandibles**, no una lista aparte: DAP los
 * devuelve con la misma `variablesReference` que cualquier objeto, así que
 * tratarlos igual hace que el panel sea un solo árbol y no dos listas anidadas
 * a mano.
 *
 * Los hijos se piden **al expandir** y no de una. Un objeto grande tiene cientos
 * de propiedades y cada una puede tener las suyas; traer el árbol entero en cada
 * freno sería pedirle al adaptador todo lo que nadie va a mirar.
 */
export function DebugVariables(): React.JSX.Element {
  const frameId = useDebugStore((store) => store.selectedFrameId);
  const [scopes, setScopes] = useState<Variable[]>([]);

  useEffect(() => {
    if (frameId === null) {
      setScopes([]);
      return;
    }

    void window.pastecode
      .invoke('debug:getVariables', { variablesReference: null, frameId })
      .then((result) => {
        setScopes(result.ok ? result.value.variables : []);
      });
  }, [frameId]);

  return (
    <ul className="debug-variables" data-testid="debug-variables">
      {scopes.map((scope) => (
        <VariableNode
          key={`${scope.name}-${String(scope.variablesReference)}`}
          variable={scope}
        />
      ))}
    </ul>
  );
}

/** Un nodo del árbol: se expande pidiéndole los hijos al adaptador. */
function VariableNode({ variable }: { variable: Variable }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<Variable[]>([]);

  // `variablesReference` en cero significa "esto no tiene adentro". Es de DAP y
  // viaja tal cual: traducirlo a un booleano perdería el número que hay que
  // devolverle al adaptador para pedir los hijos.
  const isExpandable = variable.variablesReference !== 0;

  useEffect(() => {
    if (!isOpen) return;

    void window.pastecode
      .invoke('debug:getVariables', {
        variablesReference: variable.variablesReference,
        frameId: null,
      })
      .then((result) => {
        setChildren(result.ok ? result.value.variables : []);
      });
  }, [isOpen, variable.variablesReference]);

  return (
    <li className="debug-variables__node">
      {isExpandable ? (
        <button
          type="button"
          className="debug-variables__toggle"
          aria-expanded={isOpen}
          onClick={() => {
            setIsOpen(!isOpen);
          }}
        >
          <span className="debug-variables__name">{variable.name}</span>
          {variable.value !== '' && (
            <span className="debug-variables__value">{variable.value}</span>
          )}
        </button>
      ) : (
        <span className="debug-variables__leaf">
          <span className="debug-variables__name">{variable.name}</span>
          <span className="debug-variables__value">{variable.value}</span>
        </span>
      )}

      {isOpen && (
        <ul className="debug-variables">
          {children.map((child) => (
            <VariableNode
              key={`${child.name}-${String(child.variablesReference)}`}
              variable={child}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
