/**
 * El envoltorio `<svg>` que comparten todos los iconos.
 *
 * Los iconos son **componentes SVG propios, inline y con `currentColor`**. No
 * hay dependencia de una librería de iconos ni una fuente empaquetada, y las
 * dos ausencias son deliberadas: una fuente de iconos son cientos de kilobytes
 * contra el techo de RNF-05 para dibujar quince glifos, y una librería trae mil
 * iconos de los que se usan quince. `currentColor` es lo que hace que un icono
 * herede el color de su contexto, así que cambiar de tema no toca ni un
 * componente.
 *
 * El `viewBox` es de 16 porque es la grilla en la que están dibujados los
 * trazos: a 16 unidades una línea de 1,5 cae sobre el píxel y no se ve borrosa.
 */

export interface IconProps {
  /** Tamaño en píxeles, alto y ancho. Por defecto 16. */
  readonly size?: number;
  /** Clase para el color. Los iconos no eligen el suyo. */
  readonly className?: string;
}

interface IconRootProps extends IconProps {
  readonly children: React.ReactNode;
}

/**
 * Dibuja el marco común de un icono.
 *
 * `aria-hidden` va acá y no en cada icono: **ningún icono de esta carpeta
 * transmite información por sí solo**. Todos acompañan a un texto o viven
 * adentro de un botón que ya tiene su `aria-label`, así que anunciarlos sería
 * repetir lo mismo dos veces (RNF-23).
 *
 * @param props Tamaño, clase y los trazos.
 * @returns El `<svg>` listo.
 * @example
 * <IconRoot className="icon--accent"><path d="M2 2h12" /></IconRoot>
 */
export function IconRoot({ size = 16, className, children }: IconRootProps): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
