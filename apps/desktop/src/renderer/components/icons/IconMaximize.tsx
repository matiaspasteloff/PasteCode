import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Maximizar la ventana. Un cuadrado.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconMaximize size={10} />
 */
export function IconMaximize(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    </IconRoot>
  );
}
