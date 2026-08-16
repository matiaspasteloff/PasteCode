/**
 * Un módulo del workspace que el servidor necesita para trabajar.
 *
 * Existe por `typescript-language-server`, que necesita saber dónde está el
 * `tsserver` **del proyecto**: el paquete `typescript` son ~22MB contra los
 * 22,3MB de margen de RNF-05 —es el presupuesto entero—, y además tipar un
 * proyecto con una versión distinta a la que apunta su `tsconfig` produce
 * errores que no existen. Es lo mismo que hace VS Code con "use workspace
 * version".
 *
 * Está expresado como dato y no como un `if (serverId === 'typescript')` porque
 * el criterio de esta etapa es que agregar un lenguaje sea agregar una fila.
 */
export interface WorkspaceModuleRequirement {
  /**
   * Dónde se escribe la ruta resuelta, adentro de `initializationOptions`.
   *
   * Es un array de claves y no `'tsserver.path'` para no tener que parsear un
   * string: una clave con un punto adentro es legal en JSON y no hay forma de
   * distinguirla del separador.
   */
  readonly option: readonly string[];
  /** Ruta relativa al `node_modules` del workspace. */
  readonly modulePath: string;
  /** Qué habría que instalar. Va en el mensaje cuando falta. */
  readonly packageName: string;
}

/** Todo lo que hace falta para hablar con el servidor de un lenguaje. */
export interface LanguageServerDefinition {
  /** Identificador estable. Es la clave de `lsp.serverPaths` en las settings. */
  readonly serverId: string;
  /** Los `languageId` de Monaco que este servidor atiende. */
  readonly languageIds: readonly string[];
  /** Las extensiones, con el punto y en minúscula. */
  readonly extensions: readonly string[];
  /**
   * Argumentos del proceso.
   *
   * Es dato por entrada y **no** una constante compartida porque no todos los
   * servidores piden `--stdio`: `rust-analyzer` habla por stdio sin bandera, y
   * pasársela lo hace fallar al arrancar.
   */
  readonly args: readonly string[];
  /**
   * Archivos que marcan la raíz de un proyecto de este lenguaje.
   *
   * Todavía no eligen el `rootUri` —eso es siempre la raíz del workspace, por
   * la limitación documentada de RNF-11—, pero sí deciden si vale la pena
   * arrancar el servidor: levantar `rust-analyzer` en una carpeta sin
   * `Cargo.toml` son 200MB para nada.
   */
  readonly rootMarkers: readonly string[];
  /**
   * Con qué caracteres se dispara el completado sin que nadie lo pida.
   *
   * Es dato por lenguaje y no una lista compartida porque los lenguajes usan
   * separadores distintos: `::` en Rust no significa nada en TypeScript, y
   * pedirle a un servidor un completado en cada `:` de un objeto literal es
   * trabajo para descartar.
   */
  readonly completionTriggers: readonly string[];
  /**
   * El módulo Node que empaquetamos, o `null` si es un ejecutable externo.
   *
   * Con módulo se lanza el binario de Electron en modo Node y no hace falta un
   * segundo runtime en el instalador. Sin módulo, la ruta sale de
   * `lsp.serverPaths[serverId]` y si no está, el servidor simplemente no
   * arranca: empaquetar `rust-analyzer` son 70MB contra el techo de RNF-05.
   */
  readonly bundledModule: string | null;
  readonly workspaceModules: readonly WorkspaceModuleRequirement[];
  /** Lo que viaja en `initialize`, antes de resolver los módulos del workspace. */
  readonly initializationOptions: Readonly<Record<string, unknown>>;
}

/**
 * La tabla de servidores de lenguaje. **Es la única fuente de verdad.**
 *
 * El renderer consume los `languageIds` para saber si un archivo tiene
 * servidor; el main consume el resto para lanzarlo. Agregar un lenguaje es
 * agregar una fila acá y, si es un ejecutable externo, una clave en
 * `lsp.serverPaths`. Ver
 * [ADR-0017](../../../../docs/adr/0017-cliente-lsp-con-vscode-jsonrpc.md).
 *
 * @example
 * for (const server of LANGUAGE_SERVERS) console.warn(server.serverId);
 */
export const LANGUAGE_SERVERS: readonly LanguageServerDefinition[] = [
  {
    serverId: 'typescript',
    languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
    args: ['--stdio'],
    rootMarkers: ['tsconfig.json', 'jsconfig.json', 'package.json'],
    completionTriggers: ['.', '"', "'", '`', '/', '@', '<', '#', ' '],
    bundledModule: 'typescript-language-server/lib/cli.mjs',
    workspaceModules: [
      { option: ['tsserver', 'path'], modulePath: 'typescript/lib', packageName: 'typescript' },
    ],
    initializationOptions: {},
  },
];

/**
 * El servidor que atiende un `languageId` de Monaco.
 *
 * @param languageId El id que reporta el modelo.
 * @returns La definición, o `undefined` si ese lenguaje no tiene servidor.
 * @example
 * languageServerFor('typescript')?.serverId; // 'typescript'
 */
export function languageServerFor(languageId: string): LanguageServerDefinition | undefined {
  return LANGUAGE_SERVERS.find((server) => server.languageIds.includes(languageId));
}

/**
 * El servidor que atiende un archivo, según su extensión.
 *
 * Hace falta además de `languageServerFor` porque los diagnósticos llegan por
 * ruta y **se guardan aunque el archivo no esté abierto**: sin modelo de Monaco
 * no hay `languageId` a quien preguntarle.
 *
 * @param path Ruta del archivo, absoluta o relativa.
 * @returns La definición, o `undefined`.
 * @example
 * languageServerForPath('C:\\p\\a.ts')?.serverId; // 'typescript'
 */
export function languageServerForPath(path: string): LanguageServerDefinition | undefined {
  const extension = extensionOf(path);

  if (extension === '') return undefined;

  return LANGUAGE_SERVERS.find((server) => server.extensions.includes(extension));
}

/**
 * La extensión de una ruta, con el punto y en minúscula.
 *
 * Se parte a mano y no con `node:path` porque este paquete no importa Node: es
 * la misma razón por la que `splitDisplayPath` del renderer tampoco lo hace.
 *
 * @param path Ruta con cualquiera de los dos separadores.
 * @returns La extensión, o `''` si no tiene.
 * @example
 * extensionOf('C:\\p\\a.TS'); // '.ts'
 */
export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).at(-1) ?? '';
  const dot = name.lastIndexOf('.');

  // Un `.gitignore` no tiene extensión, tiene nombre: el punto en la posición 0
  // es parte del nombre y no un separador.
  if (dot <= 0) return '';

  return name.slice(dot).toLowerCase();
}

/**
 * Escribe un valor adentro de un objeto de opciones, sin mutarlo.
 *
 * Es lo que convierte un `WorkspaceModuleRequirement` en
 * `initializationOptions`. Inmutable porque la tabla de arriba es compartida y
 * mutarla haría que el segundo workspace heredara las rutas del primero.
 *
 * @param options Opciones de partida.
 * @param path Claves anidadas, de afuera hacia adentro. Vacío devuelve `options`.
 * @param value Qué escribir en la hoja.
 * @returns Una copia con el valor puesto.
 * @example
 * setOption({}, ['tsserver', 'path'], 'C:\\p\\node_modules\\typescript\\lib');
 * // { tsserver: { path: '...' } }
 */
export function setOption(
  options: Readonly<Record<string, unknown>>,
  path: readonly string[],
  value: unknown
): Record<string, unknown> {
  const [head, ...rest] = path;

  if (head === undefined) return { ...options };
  if (rest.length === 0) return { ...options, [head]: value };

  const child: unknown = options[head];

  return {
    ...options,
    [head]: setOption(isPlainObject(child) ? child : {}, rest, value),
  };
}

/** Si el valor es un objeto de opciones y no un array, `null` ni un primitivo. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
