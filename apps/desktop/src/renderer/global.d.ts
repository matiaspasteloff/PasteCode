import type { PasteCodeApi } from '@pastecode/ipc-contract';

declare global {
  interface Window {
    /** Expuesto por el preload vía contextBridge. Ver src/preload/index.ts. */
    readonly pastecode: PasteCodeApi;
  }
}
