import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Búsqueda. Lupa.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconSearch />
 */
export function IconSearch(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </IconRoot>
  );
}
