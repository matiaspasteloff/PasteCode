import { fileURLToPath } from 'node:url';

import type { LanguageServerDefinition } from '@pastecode/core';
import type { LspServerStatus } from '@pastecode/ipc-contract';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublishDiagnosticsParams } from 'vscode-languageserver-protocol';

import type { LanguageClient } from './client.js';
import { createLanguageClient } from './client.js';

/**
 * El servidor falso, lanzado como proceso de verdad sobre pipes de verdad.
 *
 * Nada de lo que este archivo verifica se puede probar contra un doble: el
 * framing de `Content-Length`, el handshake, la cancelación y la escalada a
 * `SIGKILL` son sobre lo que pasa entre dos procesos. Ver
 * [testing.md](../../../../../docs/convenciones/testing.md#integración).
 */
const FAKE_SERVER = fileURLToPath(new URL('../supervisors/fake-server.mjs', import.meta.url));

/** Holgado: en el CI de Windows lanzar un Node cuesta cientos de milisegundos. */
const TIMEOUT_MS = 20_000;

const DEFINITION: LanguageServerDefinition = {
  serverId: 'fake',
  languageIds: ['fake'],
  extensions: ['.fake'],
  args: [],
  rootMarkers: [],
  completionTriggers: [],
  bundledModule: null,
  workspaceModules: [],
  initializationOptions: {},
};

/** Lo que cada test observa del cliente. */
interface Observed {
  client: LanguageClient;
  statuses: LspServerStatus[];
  published: PublishDiagnosticsParams[];
}

function startClient(serverArgs: readonly string[], requestTimeoutMs = 10_000): Observed {
  const statuses: LspServerStatus[] = [];
  const published: PublishDiagnosticsParams[] = [];

  const client = createLanguageClient({
    definition: DEFINITION,
    launch: {
      file: process.execPath,
      args: [FAKE_SERVER, '--lsp', ...serverArgs],
      env: process.env,
    },
    root: process.cwd(),
    initializationOptions: {},
    requestTimeoutMs,
    onDiagnostics: (params) => published.push(params),
    onStatus: (status) => statuses.push(status),
  });

  client.start();

  return { client, statuses, published };
}

async function waitFor(condition: () => boolean, describeFailure: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Se agotó la espera: ${describeFailure}`);

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('createLanguageClient', () => {
  let running: LanguageClient | undefined;

  afterEach(async () => {
    await running?.stop(1000);
    running = undefined;
  });

  it(
    'queda en running después del handshake',
    async () => {
      const observed = startClient([]);

      running = observed.client;
      await waitFor(() => observed.client.status().state === 'running', 'el handshake');

      expect(observed.statuses.at(-1)).toEqual({
        serverId: 'fake',
        state: 'running',
        userMessage: null,
      });
    },
    TIMEOUT_MS
  );

  it(
    'responde un request sobre el pipe real',
    async () => {
      const observed = startClient([]);

      running = observed.client;

      const hover = await observed.client.request<{ contents: { value: string } }>(
        'textDocument/hover',
        {}
      );

      expect(hover?.contents.value).toContain('hover');
    },
    TIMEOUT_MS
  );

  it(
    'entrega los diagnósticos que el servidor publica al abrir un documento',
    async () => {
      const observed = startClient([]);

      running = observed.client;
      observed.client.notify('textDocument/didOpen', {
        textDocument: {
          uri: 'file:///a.fake',
          languageId: 'fake',
          version: 1,
          text: 'BOOM BOOM',
        },
      });

      await waitFor(() => observed.published.length > 0, 'la publicación de diagnósticos');

      expect(observed.published[0]?.diagnostics).toHaveLength(2);
    },
    TIMEOUT_MS
  );

  it(
    'marca failed al servidor que negocia un encoding que no es utf-16',
    async () => {
      const observed = startClient(['--position-encoding=utf-8']);

      running = observed.client;
      await waitFor(
        () => observed.client.status().state === 'failed',
        'el rechazo del encoding'
      );

      expect(observed.client.status().userMessage).toContain('utf-8');
      // Y no se queda esperando: una request sobre un servidor rechazado
      // devuelve `null` en vez de colgar a quien la pidió.
      expect(await observed.client.request('textDocument/hover', {})).toBeNull();
    },
    TIMEOUT_MS
  );

  it(
    'declara enfermo al que deja de contestar y lo reinicia',
    async () => {
      const observed = startClient(['--hang'], 300);

      running = observed.client;
      await waitFor(() => observed.client.status().state === 'running', 'el primer handshake');

      // Cuelga: el health check pasivo lo mata y el supervisor lo relanza, así
      // que el estado vuelve a `running` una segunda vez.
      void observed.client.request('textDocument/hover', {});

      await waitFor(
        () => observed.statuses.filter((status) => status.state === 'running').length >= 2,
        'el reinicio después del health check'
      );

      expect(
        observed.statuses.filter((status) => status.state === 'running').length
      ).toBeGreaterThan(1);
    },
    TIMEOUT_MS
  );

  it(
    'se rinde después de tres intentos y lo cuenta',
    async () => {
      const observed = startClient(['--exit-after=30']);

      running = observed.client;
      await waitFor(() => observed.client.status().state === 'failed', 'que se rinda');

      expect(observed.client.status().userMessage).toContain('reiniciarse');
    },
    TIMEOUT_MS
  );

  it(
    'escala a la señal cuando el servidor no contesta el shutdown',
    async () => {
      const observed = startClient(['--hang', '--ignore-term']);

      running = undefined;
      await waitFor(() => observed.client.status().state === 'running', 'el handshake');

      const started = Date.now();

      await observed.client.stop(1500);

      // Lo que se verifica es que termine: sin la carrera contra el
      // temporizador adentro de `requestGracefulExit`, el `await` del
      // `shutdown` no vuelve nunca y el apagado de la app se cuelga.
      expect(Date.now() - started).toBeLessThan(TIMEOUT_MS);
    },
    TIMEOUT_MS
  );
});
