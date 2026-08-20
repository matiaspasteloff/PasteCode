import type {
  Activate,
  Deactivate,
  PasteCode,
  StatusBarItem,
  TextEditor,
} from '@pastecode/extension-api';

/**
 * Cuánto se espera antes de recontar.
 *
 * Cada recuento es un `getText()`, y un `getText()` es un ida y vuelta hasta el
 * renderer con el archivo entero adentro. Reaccionar a cada evento sin esperar
 * es exactamente lo que la API está diseñada para desalentar: con un archivo de
 * 10MB serían dos saltos de proceso por tecla.
 */
const DEBOUNCE_MS = 250;

/** El ítem de la status bar, o `undefined` mientras no se activó. */
let statusItem: StatusBarItem | undefined;

/** El recuento pendiente, si hay uno agendado. */
let pending: ReturnType<typeof setTimeout> | undefined;

/** Si la cuenta se está mostrando. Lo alterna `wordCount.toggle`. */
let enabled = true;

/**
 * Cuenta las palabras de un texto.
 *
 * Una palabra es una corrida de caracteres que no son espacio. Es
 * deliberadamente tosco: contar de verdad depende del idioma —el japonés no
 * separa con espacios— y esta extensión existe para ejercitar la API, no para
 * resolver segmentación de texto.
 */
function countWords(text: string): number {
  return text.match(/\S+/gu)?.length ?? 0;
}

/** Pinta la cuenta del editor que se le pase, o esconde el ítem si no hay. */
async function render(editor: TextEditor | undefined): Promise<void> {
  if (statusItem === undefined) return;

  if (!enabled || editor === undefined) {
    await statusItem.hide();
    return;
  }

  const text = await editor.document.getText();

  await statusItem.setText(`${String(countWords(text))} palabras`);
  await statusItem.show();
}

/** Agenda un recuento, pisando el que estuviera pendiente. */
function schedule(editor: TextEditor | undefined): void {
  if (pending !== undefined) clearTimeout(pending);

  pending = setTimeout(() => {
    pending = undefined;
    void render(editor);
  }, DEBOUNCE_MS);
}

export const activate: Activate = async (pastecode: PasteCode) => {
  statusItem = await pastecode.window.createStatusBarItem({ alignment: 'right', priority: 10 });
  await statusItem.setTooltip('Palabras del documento activo');
  await statusItem.setCommand('wordCount.toggle');

  await pastecode.commands.registerCommand('wordCount.toggle', async () => {
    enabled = !enabled;
    await render(pastecode.window.activeTextEditor);
  });

  // El `Disposable` se descarta a propósito: el IDE da de baja lo que registró
  // esta extensión cuando se descarga, sin que la extensión colabore. Un
  // `Disposable` sirve para soltar algo *antes* de tiempo, y acá no hace falta.
  await pastecode.window.onDidChangeActiveTextEditor(schedule);

  // La primera pintada es sin debounce: al activarse ya hay un documento y
  // esperar un cuarto de segundo se vería como un parpadeo.
  await render(pastecode.window.activeTextEditor);
};

export const deactivate: Deactivate = () => {
  // El timer sí es recurso propio, y es lo único que hay que soltar acá.
  if (pending !== undefined) {
    clearTimeout(pending);
    pending = undefined;
  }

  statusItem = undefined;
};
