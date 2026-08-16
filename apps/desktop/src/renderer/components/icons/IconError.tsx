import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Círculo con una cruz. Conteo de errores en la barra de estado.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconError size={12} />
 */
export function IconError(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6 6l4 4" />
      <path d="M10 6l-4 4" />
    </IconRoot>
  );
}
