import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Paleta de comandos. El signo de mayor y una línea, como un prompt.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconCommand />
 */
export function IconCommand(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M5 6.5 7 8l-2 1.5" />
      <path d="M9 10h2.5" />
    </IconRoot>
  );
}
