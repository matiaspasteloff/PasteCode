import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Triángulo de advertencia. Pestaña del panel de problemas.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconProblems size={14} />
 */
export function IconProblems(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <path d="M8 2.25 14.5 13.5h-13z" />
      <path d="M8 6.5v3" />
      <path d="M8 11.5h.01" />
    </IconRoot>
  );
}
