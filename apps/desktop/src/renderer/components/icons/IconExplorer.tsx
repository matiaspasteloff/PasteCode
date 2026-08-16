import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Explorador de archivos. Dos hojas superpuestas.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconExplorer />
 */
export function IconExplorer(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <path d="M9.5 1.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.5z" />
      <path d="M9.5 1.5v3h3" />
    </IconRoot>
  );
}
