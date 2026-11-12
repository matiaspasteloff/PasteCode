import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Restaurar la ventana maximizada. Dos cuadrados superpuestos, con el de atrás
 * asomando arriba a la derecha.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconRestore size={10} />
 */
export function IconRestore(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <rect x="2.5" y="5" width="8.5" height="8.5" rx="1" />
      <path d="M5 2.5h7.5a1 1 0 0 1 1 1V11" />
    </IconRoot>
  );
}
