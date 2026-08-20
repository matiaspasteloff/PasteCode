import type { Disposable } from './disposable.js';

/**
 * Una posición en un documento, **base 1** en línea y en columna.
 *
 * Misma convención que el resto del proyecto. El tipo está declarado acá y no
 * importado de `@pastecode/core` porque este paquete no tiene dependencias —
 * es lo que lo hace publicable y lo que impide que una extensión termine
 * arrastrando la lógica interna del IDE. La duplicación es de cuatro líneas y
 * el acoplamiento que evita es permanente.
 */
export interface Position {
  readonly line: number;
  readonly column: number;
}

/** Un rango del documento, en las mismas coordenadas base 1. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}

/** Reemplazar un rango por un texto. Insertar es un rango vacío. */
export interface TextEdit {
  readonly range: Range;
  readonly newText: string;
}

/**
 * El documento abierto en el editor activo.
 *
 * **No trae el texto.** `getText()` lo va a buscar cuando hace falta, y esa es
 * la decisión de fondo de toda esta API: el texto vive sólo en el modelo de
 * Monaco, en el renderer. Un espejo en el main sería una segunda copia de cada
 * archivo abierto, y con [RNF-03](../../../docs/04-requerimientos-no-funcionales.md)
 * permitiendo archivos de 10MB esa copia es memoria que
 * [RNF-04](../../../docs/04-requerimientos-no-funcionales.md) no tiene. Ver
 * ADR-0026.
 *
 * Lo que sí viaja solo es el metadato —`path`, `languageId`, `version`—, que es
 * chico y acotado. Si el evento de cambio arrastrara el texto, cada tecla
 * serían dos saltos de proceso con el archivo entero adentro.
 */
export interface TextDocument {
  /** Ruta absoluta del archivo. */
  readonly path: string;
  /** El lenguaje que el IDE le asignó, por ejemplo `markdown`. */
  readonly languageId: string;
  /** Sube con cada cambio. Es lo que hace verificable un `edit`. */
  readonly version: number;

  /**
   * Pide el contenido completo del documento.
   *
   * Es un ida y vuelta hasta el renderer, así que cuesta: llamarlo en cada
   * tecla es exactamente lo que esta API está diseñada para desalentar. Con
   * debounce.
   *
   * @returns El texto tal como está en el editor, guardado o no.
   * @example
   * const text = await pastecode.window.activeTextEditor?.document.getText();
   */
  getText(): Promise<string>;
}

/**
 * El editor activo.
 *
 * Es una **instantánea**, no un objeto vivo: refleja el estado del último
 * evento recibido. Guardarlo en una variable y usarlo cinco minutos después es
 * mirar el pasado; lo que se guarda es la suscripción, no el editor.
 */
export interface TextEditor {
  readonly document: TextDocument;

  /**
   * Aplica cambios al documento.
   *
   * Es el criterio de aceptación de [RF-905](../../../docs/03-requerimientos-funcionales.md).
   * Requiere la capability `documentWrite`.
   *
   * Los cambios se aplican **contra `document.version`**. Si el documento se
   * movió entre que se leyó y que se escribe —la persona siguió tipeando, que
   * con dos saltos de proceso de por medio no es un caso raro— la edición no se
   * aplica y devuelve `false`. Es la única respuesta honesta que un modelo sin
   * espejo puede dar: la alternativa es pisar lo que alguien acaba de escribir.
   *
   * Los `edits` se aplican como una sola operación, así que sus rangos se
   * refieren todos al documento previo y el orden entre ellos no importa. Una
   * sola operación es también un solo undo.
   *
   * @param edits Los cambios, en coordenadas base 1.
   * @returns `true` si se aplicaron; `false` si el documento ya había cambiado.
   * @example
   * await editor.edit([{ range, newText: 'hola' }]);
   */
  edit(edits: readonly TextEdit[]): Promise<boolean>;
}

/** De qué lado de la status bar se para un ítem. */
export type StatusBarAlignment = 'left' | 'right';

/** Cómo se crea un ítem de la status bar. */
export interface StatusBarItemOptions {
  /** Por omisión, `right`. */
  alignment?: StatusBarAlignment;
  /** Mayor va más cerca del borde. Por omisión, `0`. */
  priority?: number;
}

/**
 * Un ítem que una extensión pone en la status bar
 * ([RF-904](../../../docs/03-requerimientos-funcionales.md)).
 *
 * **Los setters son métodos asincrónicos y no propiedades.** En VS Code se
 * escribe `item.text = 'x'` y anda porque la asignación y la UI están en el
 * mismo proceso. Acá hay dos saltos de por medio, así que una propiedad
 * asignable sería una operación que puede fallar disfrazada de asignación, sin
 * nada que esperar y sin dónde ver el error. Es más largo de escribir y no
 * miente.
 *
 * Nace oculto: se le pone el texto y recién ahí `show()`. Al revés parpadearía
 * vacío.
 */
export interface StatusBarItem extends Disposable {
  setText(text: string): Promise<void>;
  setTooltip(tooltip: string): Promise<void>;
  /** El comando que se ejecuta al hacerle clic. */
  setCommand(commandId: string): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
}

/** La ventana del IDE: status bar y editor activo. */
export interface WindowNamespace {
  /**
   * El editor activo, o `undefined` si no hay ninguno abierto.
   *
   * Se lee sincrónicamente porque es metadato que el IDE ya empujó; lo que
   * cuesta —el texto, la edición— son los métodos, y ésos son `Promise`.
   * Requiere la capability `documentRead`; sin ella vale siempre `undefined`,
   * que es lo mismo que ve una extensión cuando no hay nada abierto y por lo
   * tanto un caso que ya tiene que manejar.
   */
  readonly activeTextEditor: TextEditor | undefined;

  /**
   * Avisa cuando cambia el editor activo, o cuando cambia su documento.
   *
   * El listener recibe la instantánea nueva. **No recibe el texto**; para eso
   * está `document.getText()`.
   *
   * @param listener Se llama con el editor activo, o `undefined` si no hay.
   * @returns Con qué cortar la suscripción.
   * @example
   * await pastecode.window.onDidChangeActiveTextEditor(recontar);
   */
  onDidChangeActiveTextEditor(
    listener: (editor: TextEditor | undefined) => void
  ): Promise<Disposable>;

  /**
   * Crea un ítem de la status bar, oculto.
   *
   * Requiere la capability `statusBar`.
   *
   * @param options Alineación y prioridad. Todo opcional.
   * @example
   * const item = await pastecode.window.createStatusBarItem();
   */
  createStatusBarItem(options?: StatusBarItemOptions): Promise<StatusBarItem>;
}
