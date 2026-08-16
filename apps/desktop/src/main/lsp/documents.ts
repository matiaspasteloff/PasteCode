/** Un documento que el servidor tiene abierto. */
export interface OpenDocument {
  readonly path: string;
  readonly serverId: string;
  readonly languageId: string;
  /** El `getVersionId()` de Monaco de la última descarga aceptada. */
  readonly version: number;
}

/** Los documentos abiertos, con la guarda de versión. */
export interface DocumentRegistry {
  /** Anota una apertura. Devuelve `true` si es nueva y hay que mandar `didOpen`. */
  open(document: OpenDocument): boolean;
  /**
   * Decide si una descarga de cambios corresponde mandarla.
   *
   * @returns `false` si el documento no está abierto o si la versión es vieja.
   */
  accept(path: string, version: number): boolean;
  /** Saca el documento. Devuelve el que estaba, o `undefined`. */
  close(path: string): OpenDocument | undefined;
  get(path: string): OpenDocument | undefined;
  /** Los abiertos de un servidor, para saber a quién avisarle de un reinicio. */
  forServer(serverId: string): OpenDocument[];
  /** Olvida todo lo de un servidor. Se usa cuando el proceso se reinicia. */
  forgetServer(serverId: string): void;
  clear(): void;
}

/**
 * Crea el registro de documentos abiertos.
 *
 * Guarda **la versión y nada del texto**, a propósito. Tener el contenido acá
 * sería una segunda copia de cada archivo abierto —la primera es el modelo de
 * Monaco, que es la fuente de verdad— y con
 * [RNF-03](../../../../../docs/04-requerimientos-no-funcionales.md#performance)
 * permitiendo archivos de 10MB eso es memoria que
 * [RNF-04](../../../../../docs/04-requerimientos-no-funcionales.md#performance)
 * no tiene. Cuando un servidor se reinicia, el main olvida sus documentos y
 * avisa por `lsp:serverChanged`; el renderer, que sí tiene el texto, los
 * reabre.
 *
 * @returns El registro, vacío.
 * @example
 * const documents = createDocumentRegistry();
 * documents.open({ path, serverId: 'typescript', languageId: 'typescript', version: 1 });
 */
export function createDocumentRegistry(): DocumentRegistry {
  const open = new Map<string, OpenDocument>();

  return {
    open(document) {
      const existing = open.get(document.path);

      open.set(document.path, document);

      return existing === undefined;
    },

    accept(path, version) {
      const existing = open.get(path);

      if (existing === undefined) return false;

      // Se descarta lo que no avanza, y eso incluye la igualdad. Una descarga
      // con una versión que ya se aplicó es una que llegó tarde después de un
      // close/reopen, y aplicarla desincroniza al servidor para siempre: a
      // partir de ahí los rangos que manda no corresponden al texto que tiene.
      if (version <= existing.version) return false;

      open.set(path, { ...existing, version });

      return true;
    },

    close(path) {
      const existing = open.get(path);

      open.delete(path);

      return existing;
    },

    get(path) {
      return open.get(path);
    },

    forServer(serverId) {
      return [...open.values()].filter((document) => document.serverId === serverId);
    },

    forgetServer(serverId) {
      for (const [path, document] of open) {
        if (document.serverId === serverId) open.delete(path);
      }
    },

    clear() {
      open.clear();
    },
  };
}
