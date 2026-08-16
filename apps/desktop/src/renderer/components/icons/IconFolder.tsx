import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Carpeta. Cerrada o abierta según se la esté expandiendo.
 *
 * @param props Tamaño, clase y si está expandida.
 * @returns El icono.
 * @example
 * <IconFolder isExpanded />
 */
export function IconFolder({
  isExpanded = false,
  ...props
}: IconProps & { readonly isExpanded?: boolean }): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <path d="M1.5 3.5a1 1 0 0 1 1-1h3l1.5 2h6.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
      {isExpanded ? <path d="M1.5 6.5h13" /> : null}
    </IconRoot>
  );
}
