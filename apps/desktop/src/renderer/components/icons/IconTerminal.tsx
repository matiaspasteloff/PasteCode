import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Terminal. El prompt y la línea del cursor.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconTerminal />
 */
export function IconTerminal(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M4.5 6.5 6.5 8l-2 1.5" />
      <path d="M8.5 10h3" />
    </IconRoot>
  );
}
