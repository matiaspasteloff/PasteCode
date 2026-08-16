import type { ClientCapabilities } from 'vscode-languageserver-protocol';

/**
 * Lo que este cliente sabe hacer, tal como se lo declara en `initialize`.
 *
 * Está escrito a mano y corto a propósito: cada capability que se anuncia es
 * una promesa de saber manejar lo que el servidor mande de vuelta. Declarar
 * `relatedInformation` sin pintarla, o `linkSupport` sin leer el
 * `targetSelectionRange`, no es optimista: es pedirle al servidor que trabaje
 * de más para que la respuesta se descarte.
 *
 * **`general.positionEncodings: ['utf-16']` es el detalle de corrección más
 * valioso de toda la integración y cuesta una línea.** Sin esto, un servidor
 * que trabaje en unidades UTF-8 —la spec lo permite desde 3.17— devuelve
 * columnas que no son las de Monaco, y el resultado es que cada subrayado, cada
 * hover y cada salto a definición se corren de lugar en cualquier archivo que
 * tenga un emoji o un acento fuera del plano básico. No falla: miente. El valor
 * negociado se verifica en la respuesta, y un servidor que insista con otro se
 * marca `failed`.
 */
export const CLIENT_CAPABILITIES: ClientCapabilities = {
  general: { positionEncodings: ['utf-16'] },
  textDocument: {
    synchronization: { dynamicRegistration: false, didSave: false },
    publishDiagnostics: { relatedInformation: false, versionSupport: true },
    completion: {
      contextSupport: true,
      completionItem: {
        snippetSupport: true,
        documentationFormat: ['markdown', 'plaintext'],
        resolveSupport: { properties: ['documentation', 'detail'] },
      },
    },
    hover: { contentFormat: ['markdown', 'plaintext'] },
    definition: { linkSupport: false },
  },
  workspace: {
    workspaceFolders: true,
    didChangeWatchedFiles: { dynamicRegistration: false },
  },
};
