import type { LspServerStatus } from '@pastecode/ipc-contract';
import { create } from 'zustand';

interface LspStatusState {
  /** El último estado conocido de cada servidor, por `serverId`. */
  servers: Readonly<Record<string, LspServerStatus>>;
  /** Aplica un `lsp:serverChanged`. */
  apply: (status: LspServerStatus) => void;
  /** Reemplaza todo con el snapshot de `lsp:status`. */
  replaceAll: (servers: readonly LspServerStatus[]) => void;
}

/**
 * En qué estado están los servidores de lenguaje.
 *
 * Existe por dos cosas concretas y ninguna es decorativa:
 *
 * - **Reabrir los documentos después de un reinicio.** El main no guarda el
 *   texto de los archivos abiertos —sería una segunda copia de cada uno—, así
 *   que cuando un servidor vuelve a `running` el renderer, que sí lo tiene en
 *   el modelo de Monaco, se los manda de nuevo.
 * - **Contar por qué no hay diagnósticos.** Un servidor `failed` con su
 *   `userMessage` es la diferencia entre "este archivo no tiene errores" y "no
 *   hay quien los busque", y son dos cosas muy distintas de creer.
 *
 * @example
 * const servers = useLspStatusStore((state) => state.servers);
 */
export const useLspStatusStore = create<LspStatusState>((set, get) => ({
  servers: {},

  apply: (status) => {
    set({ servers: { ...get().servers, [status.serverId]: status } });
  },

  replaceAll: (servers) => {
    set({
      servers: Object.fromEntries(servers.map((server) => [server.serverId, server])),
    });
  },
}));

/**
 * Los servidores que fallaron, con su motivo.
 *
 * @param servers El mapa del store.
 * @returns Los estados `failed`, en orden de `serverId`.
 * @example
 * const failed = useMemo(() => failedServers(servers), [servers]);
 */
export function failedServers(
  servers: Readonly<Record<string, LspServerStatus>>
): LspServerStatus[] {
  return Object.values(servers)
    .filter((server) => server.state === 'failed')
    .toSorted((left, right) => left.serverId.localeCompare(right.serverId));
}
