import type { IconProps } from './Icon.js';
import { IconRoot } from './Icon.js';

/**
 * Un grafo de ramas. El rail de Git y el indicador de rama.
 *
 * Es el mismo glifo en los dos lugares a propósito: si son el mismo concepto,
 * mismo dibujo.
 *
 * @param props Tamaño y clase.
 * @returns El icono.
 * @example
 * <IconGit size={14} />
 */
export function IconGit(props: IconProps): React.JSX.Element {
  return (
    <IconRoot {...props}>
      <circle cx="4.5" cy="3.5" r="1.75" />
      <circle cx="4.5" cy="12.5" r="1.75" />
      <circle cx="11.5" cy="5.5" r="1.75" />
      <path d="M4.5 5.25v5.5" />
      <path d="M11.5 7.25c0 2.25-2 3.25-4 3.5" />
    </IconRoot>
  );
}
