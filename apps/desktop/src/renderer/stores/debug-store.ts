import type { Breakpoint } from '@pastecode/core';
import { toggleBreakpoint } from '@pastecode/core';
import type { DebugStoppedEvent, Request, Response } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Cuántas líneas de consola se conservan. */
const CONSOLE_LIMIT = 2000;

/**
 * Una línea de la consola de debug (RF-505).
 *
 * No se exporta: quien la consume la saca de `store.console`, y nombrarla
 * afuera sería darle un segundo nombre a lo mismo.
 */
interface ConsoleLine {
  category: string;
  text: string;
}

interface DebugState {
  /** Todos los del workspace, de todos los archivos. */
  breakpoints: Breakpoint[];
  /** El estado de la sesión, tal como lo reporta el main. */
  status: Response<'debug:getStatus'>;
  /** Las configuraciones del `launch.json`, con su error si lo hay. */
  configurations: Response<'debug:getConfigurations'>;
  /** El call stack del freno actual (RF-504). */
  frames: Response<'debug:getStackTrace'>['frames'];
  /** El frame seleccionado, que es el contexto de las variables y la consola. */
  selectedFrameId: number | null;
  /** Lo que salió por la consola (RF-505). */
  console: ConsoleLine[];

  setStatus: (status: Response<'debug:getStatus'>) => void;
  setConfigurations: (configurations: Response<'debug:getConfigurations'>) => void;
  selectFrame: (frameId: number | null) => void;
  appendConsole: (line: ConsoleLine) => void;
  /** Refresca el stack tras un freno y selecciona el primer frame. */
  onStopped: (event: DebugStoppedEvent) => Promise<void>;
  /** Limpia lo que sólo tiene sentido con una sesión viva. */
  onTerminated: (status: Response<'debug:getStatus'>) => void;

  /** Pone o saca el de una línea. Es lo que hace un click en el gutter. */
  toggle: (path: string, line: number) => void;
  /** Reemplaza la lista entera. Lo usa la restauración de la sesión. */
  setBreakpoints: (breakpoints: readonly Breakpoint[]) => void;
  /** Saca todos. Se usa al cambiar de workspace. */
  clear: () => void;
}

/** Le manda al main los breakpoints de un archivo, reemplazando los que tenía. */
async function pushBreakpoints(
  breakpoints: readonly Breakpoint[],
  path: string
): Promise<void> {
  const payload: Request<'debug:setBreakpoints'> = {
    path,
    lines: breakpoints
      .filter((breakpoint) => breakpoint.path === path && breakpoint.enabled)
      .map((breakpoint) => breakpoint.line),
  };

  await window.pastecode.invoke('debug:setBreakpoints', payload);
}

/**
 * Estado del debugging en el renderer.
 *
 * **Los breakpoints viven acá y no en el editor.** Sobreviven a cerrar la
 * pestaña —un breakpoint en un archivo que no está abierto sigue existiendo— y
 * se persisten con la sesión ([RF-502](../../../../../docs/03-requerimientos-funcionales.md)),
 * así que atarlos al modelo de Monaco los perdería en cuanto el registro
 * libere ese modelo.
 *
 * La lógica de poner y sacar está en `packages/core`: es aritmética sobre una
 * lista y se testea sin montar nada.
 *
 * @example
 * const breakpoints = useDebugStore((state) => state.breakpoints);
 */
export const useDebugStore = create<DebugState>((set, get) => ({
  breakpoints: [],
  status: { state: 'unavailable', userMessage: null, threadId: null },
  configurations: { configurations: [], error: null },
  frames: [],
  selectedFrameId: null,
  console: [],

  toggle: (path, line) => {
    const breakpoints = toggleBreakpoint(get().breakpoints, path, line);

    set({ breakpoints });

    // Se le avisa al main en el acto y no al arrancar la sesión: con una sesión
    // viva, poner un breakpoint tiene que frenar el programa sin reiniciarlo.
    //
    // El fallo se traga: el breakpoint ya está puesto del lado de la UI y se le
    // manda igual al adaptador al arrancar la próxima sesión. Un diálogo de
    // error por no haber podido avisar sería peor que el problema.
    void pushBreakpoints(breakpoints, path).catch(() => undefined);
  },

  setStatus: (status) => {
    set({ status });
  },

  setConfigurations: (configurations) => {
    set({ configurations });
  },

  selectFrame: (selectedFrameId) => {
    set({ selectedFrameId });
  },

  appendConsole: (line) => {
    // Se recorta por el final: una sesión que escupe megabytes no puede hacer
    // crecer el renderer sin techo (RNF-04).
    set({ console: [...get().console, line].slice(-CONSOLE_LIMIT) });
  },

  onStopped: async (event) => {
    set({ status: { state: 'stopped', userMessage: null, threadId: event.threadId } });

    const result = await window.pastecode.invoke('debug:getStackTrace', {});

    if (!result.ok) return;

    // Se selecciona el primero: es donde frenó, y es el contexto que alguien
    // espera al escribir en la consola sin haber tocado nada.
    set({ frames: result.value.frames, selectedFrameId: result.value.frames[0]?.id ?? null });
  },

  onTerminated: (status) => {
    // El stack y el frame mueren con la sesión; la consola **no**, que es donde
    // quedó lo que el programa alcanzó a decir antes de terminar.
    set({ status, frames: [], selectedFrameId: null });
  },

  setBreakpoints: (breakpoints) => {
    set({ breakpoints: [...breakpoints] });
  },

  clear: () => {
    set({ breakpoints: [] });
  },
}));
