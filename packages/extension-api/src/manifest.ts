/**
 * Las capabilities que una extensión puede declarar.
 *
 * Es la base del modelo de seguridad: **sin declaración, sin acceso**
 * ([RNF-14](../../../docs/04-requerimientos-no-funcionales.md), y el
 * [modelo de amenazas](../../../docs/convenciones/seguridad.md#modelo-de-amenazas--extensiones)).
 * Quien las hace cumplir es el main, que es el único proceso que puede: el
 * host corre el código de terceros, así que un chequeo del lado del host lo
 * escribe el mismo que se quiere saltear.
 *
 * `documentRead` y `documentWrite` están partidas a propósito. El modelo de
 * datos nombraba sólo `documentRead`, pero [RF-905](../../../docs/03-requerimientos-funcionales.md)
 * pide *leer y modificar*, y una extensión que cuenta palabras necesita lo
 * primero y no lo segundo. Una sola capability para las dos cosas obligaría a
 * `word-count` a pedir permiso de escritura para no usarlo nunca, que es
 * exactamente cómo los permisos dejan de significar algo.
 */
export type Capability = 'statusBar' | 'documentRead' | 'documentWrite' | 'network';

/**
 * Cuándo se activa una extensión.
 *
 * Son los tres del alcance de [RF-908](../../../docs/03-requerimientos-funcionales.md).
 * Se escriben como plantillas y no como `string` para que un `onComand:` mal
 * tipeado sea un error de compilación en la extensión y no una extensión que
 * nunca arranca sin decir por qué.
 */
export type ActivationEvent =
  'onStartupFinished' | `onCommand:${string}` | `onLanguage:${string}`;

/** Un comando que la extensión aporta a la paleta. */
export interface CommandContribution {
  /** El `id` con el que se registra, formato `namespace.acción`. */
  command: string;
  /** El título que se ve en la paleta. */
  title: string;
  /** Categoría para agrupar. Opcional. */
  category?: string;
}

/**
 * Un tema que la extensión aporta ([RF-906](../../../docs/03-requerimientos-funcionales.md),
 * [RF-803](../../../docs/03-requerimientos-funcionales.md)).
 *
 * El `path` apunta a un JSON con los colores, relativo a la raíz de la
 * extensión. Es un archivo de datos y no código a propósito: un tema no debería
 * necesitar que su extensión se active, y un JSON se puede leer y validar sin
 * ejecutar nada de terceros.
 */
export interface ThemeContribution {
  /** Identificador único del tema. */
  id: string;
  /** El nombre que se ve al elegirlo. */
  label: string;
  /** Contra qué base de la UI se dibuja. */
  uiTheme: 'light' | 'dark';
  /** Ruta al JSON de colores, relativa a la raíz de la extensión. */
  path: string;
}

/** Una opción de configuración que la extensión aporta a las settings. */
export interface ConfigurationContribution {
  type: 'boolean' | 'number' | 'string';
  default: boolean | number | string;
  /** Para qué sirve, en la UI de settings. Opcional. */
  description?: string;
}

/** Todo lo que una extensión puede aportar sin ejecutar código. */
export interface Contributions {
  commands?: readonly CommandContribution[];
  themes?: readonly ThemeContribution[];
  /** Indexado por la clave completa, formato `extensión.opción`. */
  configuration?: Readonly<Record<string, ConfigurationContribution>>;
}

/**
 * El `package.json` de una extensión.
 *
 * Es el contrato del [modelo de datos](../../../docs/05-modelo-de-datos.md#manifest-de-extensión).
 * Acá vive como **tipo** para que una extensión pueda escribirlo con el
 * compilador mirando; el schema de Zod que lo valida en runtime es del loader
 * (paso 33) y vive en el main, porque este paquete no tiene dependencias.
 *
 * Que estén en dos lados es una obligación real: el schema del loader tiene que
 * seguir derivando este mismo tipo, y el paso 33 lo ata con un chequeo de
 * tipos, no con buena voluntad.
 */
export interface ExtensionManifest {
  /** Identificador dentro del publisher, en kebab-case. */
  name: string;
  /** El nombre que ve una persona. */
  displayName: string;
  /** SemVer de la extensión. */
  version: string;
  publisher: string;
  /** Rango de versiones del IDE con las que declara andar. */
  engines: { pastecode: string };
  /**
   * Ruta al módulo ESM con `activate`, relativa a la raíz de la extensión.
   *
   * **Opcional**: una extensión que sólo aporta un tema no tiene código, y
   * exigirle un `activate` vacío obligaría a cargar y ejecutar un módulo de
   * terceros para pintar colores. Sin `main` no hay nada que activar, y los
   * `activationEvents` sobran.
   */
  main?: string;
  activationEvents: readonly ActivationEvent[];
  capabilities: readonly Capability[];
  contributes?: Contributions;
}
