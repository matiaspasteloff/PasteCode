import type { TranslationKey } from '../i18n/index.js';

/** Un ítem de menú: un comando, o la línea que separa dos grupos. */
export type MenuItem = { readonly commandId: string } | { readonly separator: true };

/** Un menú de la barra, con su título y sus ítems. */
export interface MenuDescriptor {
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly items: readonly MenuItem[];
}

/**
 * Los menús de la barra superior.
 *
 * **Sólo ids de comando.** No hay títulos ni atajos escritos acá: los resuelve
 * `MenuBar` contra el registro de comandos y contra los keybindings, que es lo
 * mismo que hace el rail de actividades desde
 * [ADR-0022](../../../../../docs/adr/0022-cascaron-con-barra-de-actividades.md).
 * Una segunda tabla de títulos se desincroniza el día que alguien renombre un
 * comando, y una segunda tabla de atajos miente en cuanto alguien edite su
 * `keybindings.json`.
 *
 * **Un ítem cuyo comando no está registrado no se dibuja.** No es tolerancia a
 * errores: es lo que hace que sacar el asistente de la
 * [etapa experimental](../../../../../docs/01-vision-y-alcance.md#alcance-experimental)
 * no deje tres entradas muertas en el menú Ver.
 *
 * @example
 * for (const menu of MENU_REGISTRY) renderMenu(menu);
 */
export const MENU_REGISTRY: readonly MenuDescriptor[] = [
  {
    id: 'file',
    labelKey: 'menu.file',
    items: [
      { commandId: 'workspace.open' },
      { separator: true },
      { commandId: 'fileTree.newFile' },
      { commandId: 'fileTree.newFolder' },
      { commandId: 'files.quickOpen' },
      { separator: true },
      { commandId: 'file.save' },
      { separator: true },
      { commandId: 'file.closeTab' },
      { commandId: 'file.closeAll' },
    ],
  },
  {
    id: 'edit',
    labelKey: 'menu.edit',
    items: [{ commandId: 'search.toggle' }, { commandId: 'files.quickOpen' }],
  },
  {
    id: 'selection',
    labelKey: 'menu.selection',
    items: [{ commandId: 'ai.explainSelection' }, { commandId: 'terminal.copy' }],
  },
  {
    id: 'view',
    labelKey: 'menu.view',
    items: [
      { commandId: 'view.showExplorer' },
      { commandId: 'search.toggle' },
      { commandId: 'git.toggle' },
      { commandId: 'ai.toggle' },
      { separator: true },
      { commandId: 'problems.togglePanel' },
      { commandId: 'terminal.toggle' },
      { separator: true },
      { commandId: 'editor.splitRight' },
      { commandId: 'editor.splitDown' },
      { separator: true },
      { commandId: 'view.selectTheme' },
      { commandId: 'view.cycleTheme' },
    ],
  },
  {
    id: 'run',
    labelKey: 'menu.run',
    items: [{ commandId: 'debug.togglePanel' }],
  },
  {
    id: 'terminal',
    labelKey: 'menu.terminal',
    items: [
      { commandId: 'terminal.toggle' },
      { commandId: 'terminal.new' },
      { separator: true },
      { commandId: 'terminal.copy' },
      { commandId: 'terminal.paste' },
    ],
  },
  {
    id: 'help',
    labelKey: 'menu.help',
    items: [{ commandId: 'ai.toggle' }, { commandId: 'ai.newChat' }],
  },
];
