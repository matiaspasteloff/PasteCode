import type { RpcEndpoint, RpcHandler } from '@pastecode/extension-host';
import { MAIN_METHODS } from '@pastecode/extension-host';
import type {
  ExtensionContributionsEvent,
  ExtensionDocumentRequestEvent,
} from '@pastecode/ipc-contract';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ExtensionBroker } from './broker.js';
import { createExtensionBroker } from './broker.js';

/** Un endpoint de mentira que deja llamar a los handlers que se le engancharon. */
function fakeRpc(): {
  endpoint: RpcEndpoint;
  call: (method: string, params: unknown) => unknown;
} {
  const handlers = new Map<string, RpcHandler>();

  return {
    endpoint: {
      request: () => Promise.resolve(null),
      handle: (method, handler) => handlers.set(method, handler),
      receive: () => undefined,
      dispose: () => undefined,
      pendingCount: () => 0,
    },
    call: (method, params) => {
      const handler = handlers.get(method);

      if (handler === undefined) throw new Error(`Nadie atiende "${method}"`);

      return handler(params);
    },
  };
}

let broker: ExtensionBroker;
let call: (method: string, params: unknown) => unknown;
let published: ExtensionContributionsEvent[];
let asked: ExtensionDocumentRequestEvent[];

beforeEach(() => {
  published = [];
  asked = [];

  broker = createExtensionBroker({
    onContributionsChanged: (contributions) => published.push(contributions),
    askRenderer: (request) => asked.push(request),
  });

  const rpc = fakeRpc();

  call = rpc.call;
  broker.attach(rpc.endpoint);
  broker.grant([
    { name: 'completa', capabilities: ['statusBar', 'documentRead', 'documentWrite'] },
    { name: 'pobre', capabilities: [] },
    { name: 'lectora', capabilities: ['documentRead'] },
  ]);
});

describe('comandos', () => {
  it('publica el comando registrado con su extensión', () => {
    call(MAIN_METHODS.registerCommand, { extension: 'completa', id: 'a.b' });

    expect(broker.contributions().commands).toEqual([
      { extension: 'completa', id: 'a.b', title: 'a.b' },
    ]);
    expect(published).toHaveLength(1);
  });

  it('lo saca al darlo de baja', () => {
    call(MAIN_METHODS.registerCommand, { extension: 'completa', id: 'a.b' });
    call(MAIN_METHODS.unregisterCommand, { extension: 'completa', id: 'a.b' });

    expect(broker.contributions().commands).toEqual([]);
  });

  it('dos extensiones pueden registrar el mismo id sin pisarse', () => {
    call(MAIN_METHODS.registerCommand, { extension: 'completa', id: 'a.b' });
    call(MAIN_METHODS.registerCommand, { extension: 'pobre', id: 'a.b' });

    expect(broker.contributions().commands).toHaveLength(2);
  });
});

describe('RNF-14: las capabilities se hacen cumplir acá', () => {
  it('niega la status bar a quien no la declaró', () => {
    expect(() =>
      call(MAIN_METHODS.createStatusBarItem, { extension: 'pobre', options: {} })
    ).toThrow(expect.objectContaining({ code: 'CAPABILITY_DENIED' }));
  });

  it('niega escribir a quien sólo declaró lectura', async () => {
    await expect(
      call(MAIN_METHODS.applyEdits, { extension: 'lectora', path: 'a', version: 1, edits: [] })
    ).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
  });

  it('deja leer a quien sí lo declaró', async () => {
    const answer = call(MAIN_METHODS.getDocumentText, { extension: 'lectora', path: 'a' });

    broker.resolveDocument(asked[0]?.requestId ?? '', 'hola');

    await expect(answer).resolves.toBe('hola');
  });

  it('una extensión que no reportó capabilities no puede nada', () => {
    // Es el estado de una que falló al cargar: no está en el mapa, así que no
    // tiene permisos. Ausente y sin permisos tienen que dar lo mismo.
    expect(() =>
      call(MAIN_METHODS.createStatusBarItem, { extension: 'fantasma', options: {} })
    ).toThrow();
  });
});

describe('status bar', () => {
  /** Crea un ítem para la extensión completa y devuelve su id. */
  function createItem(): string {
    const created = call(MAIN_METHODS.createStatusBarItem, {
      extension: 'completa',
      options: { alignment: 'right', priority: 5 },
    });

    if (typeof created !== 'string') throw new Error('No devolvió un id');

    return created;
  }

  it('nace oculto: ni crearlo ni ponerle texto lo dibuja', () => {
    const itemId = createItem();

    expect(broker.contributions().statusItems).toEqual([]);

    call(MAIN_METHODS.updateStatusBarItem, {
      extension: 'completa',
      itemId,
      patch: { tooltip: 'todavía no' },
    });

    // Sin esto, cualquier `setTooltip` alcanzaba para dibujar un ítem vacío, y
    // la barra parpadeaba con un hueco antes del primer texto.
    expect(broker.contributions().statusItems).toEqual([]);
  });

  it('aparece al mostrarlo, con el texto que se le puso', () => {
    const itemId = createItem();

    call(MAIN_METHODS.updateStatusBarItem, {
      extension: 'completa',
      itemId,
      patch: { text: '42 palabras' },
    });
    call(MAIN_METHODS.updateStatusBarItem, {
      extension: 'completa',
      itemId,
      patch: { visible: true },
    });

    expect(broker.contributions().statusItems[0]).toMatchObject({
      text: '42 palabras',
      alignment: 'right',
      priority: 5,
    });
  });

  it('esconderlo lo saca de la barra sin perder su texto', () => {
    const itemId = createItem();

    for (const patch of [{ text: 'x' }, { visible: true }, { visible: false }]) {
      call(MAIN_METHODS.updateStatusBarItem, { extension: 'completa', itemId, patch });
    }

    expect(broker.contributions().statusItems).toEqual([]);

    // Volver a mostrarlo no obliga a repetir el texto: esconder no es destruir.
    call(MAIN_METHODS.updateStatusBarItem, {
      extension: 'completa',
      itemId,
      patch: { visible: true },
    });

    expect(broker.contributions().statusItems[0]?.text).toBe('x');
  });

  it('una extensión no puede tocar el ítem de otra', () => {
    const itemId = createItem();

    // El `itemId` viaja por un canal que del otro lado maneja código de
    // terceros: nada impide que una extensión mande el id de otra, y el main es
    // el único que puede notar la diferencia.
    expect(() =>
      call(MAIN_METHODS.updateStatusBarItem, {
        extension: 'lectora',
        itemId,
        patch: { text: 'te pisé' },
      })
    ).toThrow();
  });

  it('ordena por prioridad descendente', () => {
    const bajo = call(MAIN_METHODS.createStatusBarItem, {
      extension: 'completa',
      options: { priority: 1 },
    });
    const alto = call(MAIN_METHODS.createStatusBarItem, {
      extension: 'completa',
      options: { priority: 9 },
    });

    for (const itemId of [bajo, alto]) {
      call(MAIN_METHODS.updateStatusBarItem, {
        extension: 'completa',
        itemId,
        patch: { text: 'x', visible: true },
      });
    }

    expect(broker.contributions().statusItems.map((item) => item.priority)).toEqual([9, 1]);
  });
});

describe('pull del documento activo', () => {
  it('le pregunta al renderer con un requestId y espera esa respuesta', async () => {
    const primera = call(MAIN_METHODS.getDocumentText, { extension: 'completa', path: 'a.md' });
    const segunda = call(MAIN_METHODS.getDocumentText, { extension: 'completa', path: 'b.md' });

    expect(asked).toHaveLength(2);
    expect(asked[0]?.requestId).not.toBe(asked[1]?.requestId);

    // A propósito al revés: sin correlación esto entregaría cruzado.
    broker.resolveDocument(asked[1]?.requestId ?? '', 'B');
    broker.resolveDocument(asked[0]?.requestId ?? '', 'A');

    await expect(primera).resolves.toBe('A');
    await expect(segunda).resolves.toBe('B');
  });

  it('la edición viaja con su versión y sus cambios', async () => {
    const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
    const applied = call(MAIN_METHODS.applyEdits, {
      extension: 'completa',
      path: 'a.md',
      version: 7,
      edits: [{ range, newText: 'x' }],
    });

    expect(asked[0]).toMatchObject({
      kind: 'edit',
      version: 7,
      edits: [{ range, newText: 'x' }],
    });

    broker.resolveDocument(asked[0]?.requestId ?? '', null, false);

    // El documento se movió: no se aplicó nada, y la extensión se entera.
    await expect(applied).resolves.toBe(false);
  });

  it('descarta una respuesta que no corresponde a ninguna pregunta', () => {
    expect(() => {
      broker.resolveDocument('inventado', 'tarde');
    }).not.toThrow();
  });
});

describe('reset', () => {
  it('borra lo aportado y libera lo que estaba esperando', async () => {
    call(MAIN_METHODS.registerCommand, { extension: 'completa', id: 'a.b' });

    const pendiente = call(MAIN_METHODS.getDocumentText, {
      extension: 'completa',
      path: 'a.md',
    });

    broker.reset();

    // Lo que las extensiones habían aportado murió con el proceso, y quien
    // estaba esperando se entera ahora y no dentro de cinco segundos.
    expect(broker.contributions()).toEqual({ commands: [], statusItems: [] });
    await expect(pendiente).resolves.toBeNull();
  });
});
