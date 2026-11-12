# Etapa 5 — Diseño I: estructura

[← Etapa 4](./etapa-04-deuda-y-tipografias.md) · [Planes de ejecución](./README.md) · [Siguiente: diseño II →](./etapa-06-diseno-superficies.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e5` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e4`

## Objetivo

Los cimientos de interacción que le faltan al cascarón: paneles que se pueden redimensionar, menús contextuales, un lugar único para avisar cosas, y un sistema de estilos que se pueda mantener. Nada de esto es una vista nueva; eso es la [etapa 6](./etapa-06-diseno-superficies.md).

Ver "Diseño e interactividad" en el [informe](../informes/2026-11-auditoria.md).

## Leer antes

- [ADR-0022](../adr/0022-cascaron-con-barra-de-actividades.md) y [ADR-0030](../adr/0030-barra-de-titulo-propia.md).
- `renderer/App.tsx`, `renderer/styles/tokens.css`, y el principio de `renderer/styles/global.css` (la grilla de `.app`).
- `renderer/components/Menu.tsx` y `MenuBar.tsx`.
- "Lo que salió distinto" de la Etapa Experimental 1 en [`00-guia-paso-a-paso.md`](../00-guia-paso-a-paso.md): el bug del hueco de la grilla y el de `-webkit-app-region`.

## La regla que manda en toda la etapa

**No se renombra ni se borra ningún `data-testid`, ningún `role` y ningún selector de clase que use el E2E.** Un rediseño ya rompió la suite dos veces. Todo lo de acá es aditivo o mecánico.

---

## Tareas

### T1 — Partir `global.css`, sin cambiar un byte de comportamiento

`global.css` tiene 2.132 líneas. Va primero porque todo lo demás de la etapa agrega CSS.

- Partilo en archivos por área (base, cascarón, barra de título, árbol, pestañas, paleta, búsqueda, Git, terminal, debug, asistente…), y dejá un `styles/index.css` que los importe **en el mismo orden en que hoy aparecen**. La cascada depende del orden.
- **Verificación obligatoria:** concatenados en el orden de los `@import`, los archivos nuevos tienen que dar exactamente el `global.css` original. Comprobalo con un `diff` antes de borrar el original.
- El archivo empieza con un BOM. Sacalo, y tenelo en cuenta en el `diff`.
- **Commit propio, sólo de movimiento.** Sin un solo cambio de valor mezclado: es lo que hace que el commit se pueda revisar.

### T2 — Escala tipográfica y de movimiento

Hoy hay una docena de `font-size` sueltos, de `0.6rem` a `1rem`.

- En `tokens.css`: una escala de texto (`--text-2xs` … `--text-lg`), una de interlineado, duraciones (`--duration-fast`, `--duration-normal`) y una curva.
- Reemplazá los literales por tokens con una tabla de correspondencia **explícita**, escrita en el cuerpo del commit. Donde dos valores casi iguales se unifican, decilo.
- Los tamaños en `em` del markdown del asistente son relativos a propósito: no se tocan.
- Toda transición nueva respeta `prefers-reduced-motion`. Ya hay un bloque para eso en el CSS: extendelo.

Las claves que no son de color no entran en `check-contrast.mjs`, pero los tres bloques de `tokens.css` siguen teniendo que declarar las mismas claves de color.

### T3 — Paneles redimensionables

Tres medidas, hoy fijas en variables CSS: el ancho de la barra lateral, el alto del panel inferior y el ancho del panel auxiliar.

**Lógica pura** — `packages/core/src/workspace/layout.ts`, con tests: mínimos, máximos y defaults de cada medida, y `clampPanelSize`, que además tiene que garantizarle un mínimo al área de edición cuando la ventana es chica (el mínimo de ventana es 680×420).

**Componente `Sash`:**

- `role="separator"`, con `aria-orientation`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` y un `aria-label`.
- Arrastre con captura de puntero.
- **Teclado** (RNF-21): flechas para mover, `Home` y `End` para los extremos, `Enter` o doble click para volver al default.
- Mientras se arrastra **escribe la variable CSS directo en el `<html>`**, sin re-renderizar React por cada frame. Es la misma idea que el tema: una escritura de atributo repinta. Al soltar, guarda en el store.
- Limitá las escrituras con `requestAnimationFrame` (RNF-06).

**Persistencia:** en la sesión del workspace. `WorkspaceStateSchema` es `looseObject`, así que un campo `layout` opcional no rompe las sesiones ya guardadas. Verificá que una sesión vieja, sin el campo, siga cargando.

**Lo que ya se acomoda solo:** Monaco tiene `automaticLayout`, y la terminal observa su contenedor. Leé el comentario de `use-terminal.ts` sobre el `resize` y conpty antes de tocar nada ahí.

**E2E** `layout.spec.ts`: enfocar el separador, moverlo con el teclado, verificar el ancho, cerrar, reabrir y verificar que persistió.

### T4 — Menús contextuales

No hay un solo `onContextMenu` en el renderer. Renombrar y eliminar en el árbol existen sólo por teclado.

**Componente `ContextMenu`**, construido sobre `Menu.tsx`:

- Se abre en la posición del puntero, y **también desde el teclado** (`Shift+F10` y la tecla de menú) sobre el elemento enfocado.
- `Escape` cierra y devuelve el foco a donde estaba.
- No se sale de la ventana: se reubica si no entra.

**Los ítems son datos.** Una función pura por menú que, dado el objetivo, devuelve los ítems con su clave de i18n y si están habilitados. Se testea sin DOM.

| Menú           | Ítems                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Fila del árbol | Nuevo archivo, nueva carpeta, renombrar, eliminar, copiar ruta, copiar ruta relativa, mostrar en el explorador del sistema |
| Pestaña        | Cerrar, cerrar las demás, cerrar las de la derecha, cerrar todas, copiar ruta, dividir a la derecha                        |

- Renombrar y eliminar llaman a **lo mismo** que `F2` y `Delete`. Mirá `tree-keyboard.ts` y `tree-commands.ts`: no dupliques la lógica.
- "Cerrar las demás" y "cerrar las de la derecha" son funciones nuevas en `packages/core/src/workspace/tabs.ts`, con tests. Tienen que pasar por la misma confirmación que ya existe para cerrar una pestaña con cambios sin guardar.
- "Mostrar en el explorador del sistema" es un canal nuevo, `fs:revealInOS`: contrato primero, la ruta pasa por `resolveInsideWorkspace`, y recién ahí `shell.showItemInFolder`. Verificá el método en `electron.d.ts`.
- Copiar usa el canal de portapapeles que ya existe.

El menú contextual del editor es el de Monaco: no se toca.

### T5 — Notificaciones

Hoy cada feature muestra sus errores donde puede, y varios no se muestran.

- `stores/notification-store.ts` y `components/Notifications.tsx`.
- Cuatro severidades. `role="status"` con `aria-live="polite"`; los errores, `role="alert"`.
- Una acción opcional por notificación, que dispara **un comando** por id.
- Informativas y de éxito se van solas a los pocos segundos, con pausa mientras tienen el foco o el puntero encima. **Los errores se quedan hasta que alguien los cierra.**
- Un máximo visible, y el resto en cola.

**Después, el barrido que le da sentido.** Buscá en el renderer los resultados de IPC cuyo error se descarta —el patrón es `if (!result.ok) return;`— y hacé que avisen. Cada uno es un caso de RNF-25 incumplido en silencio.

**Aditivo:** los errores en línea que ya existen se quedan donde están, con sus `data-testid`. Las notificaciones cubren lo que hoy no se ve; no reemplazan lo que sí.

### T6 — Documentación

- `docs/02-arquitectura.md`: un párrafo sobre el layout redimensionable (variables CSS mientras se arrastra, sesión al soltar) y otro sobre las notificaciones.
- `docs/05-modelo-de-datos.md`: el campo `layout` de la sesión.
- `CHANGELOG.md` y `PROGRESO.md`.

Sin ADR: nada de esto es difícil de revertir.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde.
2. **La suite E2E existente pasa sin modificar ningún spec.**
3. El commit que parte `global.css` es de puro movimiento, y su mensaje dice cómo se verificó.
4. Los tres paneles se redimensionan con el mouse y con el teclado, y el tamaño persiste entre sesiones.
5. El árbol y las pestañas tienen menú contextual, operable sin mouse.
6. Ningún archivo de `styles/` supera las 400 líneas.
7. El barrido de errores descartados está hecho, y `PROGRESO.md` lista cuáles eran.

## Trampas

- **El bug del hueco.** Los hijos de la fila 2 de la grilla declaran su `grid-column` a mano porque el auto-placement los corría. Un `Sash` es un hijo más de la grilla: declarale su lugar o va a volver.
- **`-webkit-app-region`.** Todo lo interactivo dentro de la barra de título necesita `no-drag`. Un menú contextual o una notificación que se superponga a la barra, también.
- **El foco.** Un menú que se cierra y deja el foco en `<body>` es una trampa de teclado. Hay un test de teclado por componente en este repo: seguí ese molde (`use-quick-pick-keyboard.ts`, `tree-keyboard.ts`).
- **RNF-04.** Nada de esta etapa debería mover la memoria. Si la mueve, algo se está montando de más.
