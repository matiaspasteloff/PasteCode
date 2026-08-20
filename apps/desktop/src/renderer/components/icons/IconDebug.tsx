import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Un bicho. Pestaña del panel de debug.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconDebug size={14} />
 */
export function IconDebug(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <path d="M5 6a3 3 0 0 1 6 0v4a3 3 0 0 1-6 0z" />
      <path d="M6 3.5 7 5M10 3.5 9 5" />
      <path d="M2.5 7h2.5M11 7h2.5M2.5 11h2.5M11 11h2.5" />
    </IconRoot>
  );
}
