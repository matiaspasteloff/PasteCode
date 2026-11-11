# Planes de ejecución

[Índice](../README.md) · [Informe de auditoría](../informes/2026-11-auditoria.md) · [Progreso](./PROGRESO.md)

> Cada archivo de esta carpeta es el plan de **una etapa**, escrito para que lo ejecute una sesión de un agente de IA sin más contexto que el repositorio. Salen del [informe de auditoría de noviembre de 2026](../informes/2026-11-auditoria.md).
>
> **Si sos el agente que va a ejecutar una etapa: leé este archivo entero antes que el plan de tu etapa.** Las reglas de acá valen para todas.

---

## Etapas

Van **en secuencia**: tocan los mismos archivos (`main/index.ts`, el contrato de IPC, `i18n/es.ts`, el schema de settings), así que ejecutarlas en paralelo es fabricar conflictos.

| #   | Etapa                                      | Plan                                                                 | Rama                                         |
| --- | ------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------- |
| 0   | Informe y planes                           | este directorio                                                      | `claude/ide-exponential-improvements-mh7gtv` |
| 1   | Hardening de Electron                      | [etapa-01-hardening.md](./etapa-01-hardening.md)                     | `…-e1`                                       |
| 2   | Instalador y releases multiplataforma      | [etapa-02-instalador.md](./etapa-02-instalador.md)                   | `…-e2`                                       |
| 3   | Modelo de confianza                        | [etapa-03-confianza.md](./etapa-03-confianza.md)                     | `…-e3`                                       |
| 4   | Deuda barata, tipografías e idioma         | [etapa-04-deuda-y-tipografias.md](./etapa-04-deuda-y-tipografias.md) | `…-e4`                                       |
| 5   | Diseño I: estructura                       | [etapa-05-diseno-estructura.md](./etapa-05-diseno-estructura.md)     | `…-e5`                                       |
| 6   | Diseño II: superficies nuevas              | [etapa-06-diseno-superficies.md](./etapa-06-diseno-superficies.md)   | `…-e6`                                       |
| 7   | Emulador de Android I: control             | [etapa-07-emulador-control.md](./etapa-07-emulador-control.md)       | `…-e7`                                       |
| 8   | Emulador de Android II: pantalla y modelos | [etapa-08-emulador-pantalla.md](./etapa-08-emulador-pantalla.md)     | `…-e8`                                       |
| 9   | IDE I: lenguaje y búsqueda                 | [etapa-09-ide-lenguaje.md](./etapa-09-ide-lenguaje.md)               | `…-e9`                                       |
| 10  | IDE II: Git, debug e IA                    | [etapa-10-ide-git-debug-ia.md](./etapa-10-ide-git-debug-ia.md)       | `…-e10`                                      |
| 11  | Cierre de la Fase 5                        | [etapa-11-cierre.md](./etapa-11-cierre.md)                           | `…-e11`                                      |

`…` es `claude/ide-exponential-improvements-mh7gtv`. La rama de la etapa N nace de la punta de la rama de la etapa N−1, y su PR apunta a esa rama: así cada PR muestra sólo lo suyo.

**Los planes viven en la rama de la etapa 0.** Si tu rama no trae el archivo de tu etapa, leelo desde ahí sin copiarlo a tu rama:

```bash
git fetch origin claude/ide-exponential-improvements-mh7gtv
```

```bash
git show origin/claude/ide-exponential-improvements-mh7gtv:docs/planes/etapa-02-instalador.md
```

---

## Decisiones ya tomadas

No se vuelven a discutir en cada etapa. Las tomó el autor del proyecto:

| Tema                    | Decisión                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instalador              | Todas las plataformas: Windows x64 y arm64 (un click + portable), macOS `.dmg`, Linux AppImage y `.deb`, con auto-update                                                             |
| Emulador de celular     | Android real (AVD), integrado con el Android SDK instalado. No un simulador web                                                                                                      |
| Reglas del repo         | **Intermedio.** Las reglas duras de `CLAUDE.md` no se negocian. Lo que se relaja es el ritmo: una tarea puede tocar más de 5 archivos, y sólo se escriben los ADR que el plan nombra |
| Features fuera de la v1 | Entran como **Etapa Experimental 2**, al lado del contrato de alcance, igual que entró el asistente de IA ([alcance experimental](../01-vision-y-alcance.md#alcance-experimental))   |

---

## Protocolo de una etapa

1. **Leé**, en este orden: [`CLAUDE.md`](../../CLAUDE.md), este archivo, el plan de tu etapa, y los documentos que ese plan cite. Mirá [`PROGRESO.md`](./PROGRESO.md): la sección _Entorno_ dice qué comandos corren en tu contenedor, y las notas de las etapas anteriores dicen qué salió distinto de lo previsto.
2. **Instalá**: `pnpm install --frozen-lockfile`. Si falla, anotá el error exacto en `PROGRESO.md` antes de intentar otra cosa.
3. **Corré la línea base antes de tocar nada**: `pnpm check`. Si algo ya falla, anotalo: no es tuyo, pero tenés que saber distinguirlo de lo que rompas.
4. **Trabajá tarea por tarea**, en el orden del plan. Un commit por tarea, que deje el proyecto compilando.
5. **Antes de cada push**, los cuatro: `pnpm check`, `pnpm format:check`, `pnpm knip`, `pnpm coverage`.
6. **Abrí el PR en borrador** contra la rama de la etapa anterior, con la [plantilla del repo](../../.github/pull_request_template.md).
7. **Mirá el CI y arreglá lo que falle.** El E2E y los presupuestos de performance sólo corren ahí, en Windows.
8. **Actualizá [`PROGRESO.md`](./PROGRESO.md)**: el estado de tu etapa y tu sección de notas.
9. **Avisá que terminaste** como diga el mensaje con el que se te lanzó.

### Qué es "terminado"

Una etapa está terminada cuando se cumplen sus **criterios de aceptación**, el CI de su PR está en verde, y `PROGRESO.md` lo dice. No antes, y no "casi". Si un criterio no se puede cumplir, se dice cuál y por qué: una etapa que reporta honestamente un criterio abierto sirve; una que lo tilda sin cumplirlo, no.

---

## Reglas

### Las de `CLAUDE.md`, sin excepción

Nunca desactivar la seguridad de Electron. Nunca tocar el filesystem desde el renderer. Nunca `any`. Nunca una dependencia sin justificar. Nunca romper la regla de dependencias de `packages/core`. Nunca lógica en `core` sin su test. **Nunca inventar una API.**

### La regla 7, en concreto

Antes de usar un método, una opción o un evento de una librería, **verificá que existe en lo que está instalado**:

| Qué              | Dónde se verifica                                          |
| ---------------- | ---------------------------------------------------------- |
| Electron         | `node_modules/electron/electron.d.ts`                      |
| Monaco           | `node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts` |
| electron-builder | `node_modules/app-builder-lib/scheme.json`                 |
| xterm            | `node_modules/@xterm/xterm/typings/xterm.d.ts`             |
| LSP y DAP        | `vscode-languageserver-protocol` y `@vscode/debugprotocol` |

Los planes nombran APIs. **Los escribió alguien que no pudo ejecutar el código**, así que tomalos como una pista fuerte y no como una garantía. Si algo que el plan nombra no existe, usá la alternativa que el plan indique; si no indica ninguna, resolvelo con lo que sí existe y dejalo anotado en `PROGRESO.md`.

### Cómo se escribe código acá

- **El contrato de IPC primero.** Un canal nuevo empieza en `packages/ipc-contract/src/schemas/`, sigue en `channels.ts`, y recién después tiene handler. Un evento nuevo va en **dos** lugares de `events.ts`: el mapa de tipos y la lista de runtime que consulta `isEventName`.
- **La lógica que se puede escribir sin I/O va en `packages/core`**, con su test al lado. El main se queda con la parte que toca el sistema.
- **Los handlers se registran con `registerHandler`** (`main/ipc/handler.ts`) y lanzan `PasteCodeError`. Los eventos salen con `emit` (`main/ipc/emitter.ts`).
- **Todo lo que hay que apagar al cerrar se registra con `registerDisposer`** (`main/services/shutdown.ts`). RNF-10: cero procesos huérfanos.
- **Ningún string en la UI**: va a `renderer/i18n/es.ts` (y a `en.ts` desde la etapa 4).
- **Ningún `data-testid` se renombra ni se borra.** Los E2E dependen de ellos, y un rediseño ya los rompió dos veces.
- **Una vista nueva es una entrada en un registro**, no un `if` en el cascarón: `SIDE_VIEW_REGISTRY`, `AUX_VIEW_REGISTRY`, `PANEL_VIEW_REGISTRY`.
- **Comparar rutas con `===` está mal**: Monaco devuelve la unidad en minúscula. Existe `renderer/features/editor/same-path.ts`.
- ESLint hace cumplir como **error**: 400 líneas por archivo, 50 por función, complejidad 10, sin `as` fuera de los límites del sistema, sin `console.log`. Si una función no entra, se parte; no se desactiva la regla.
- Toda función exportada lleva JSDoc con `@param`, `@returns` y un `@example`. Los comentarios explican **por qué**, no qué.
- Colores: si tocás un token, `pnpm check:contrast` tiene que pasar, y los tres bloques de `tokens.css` tienen que declarar las mismas claves.

### Commits y PRs

- Conventional Commits, en español, minúscula, sin punto final. **La lista de scopes es cerrada** y vive en `commitlint.config.js` y en `docs/convenciones/git.md`; se tocan juntos.
- El cuerpo del commit explica el porqué.
- **Ningún identificador de modelo de IA** en commits, PRs, comentarios ni código.

### Prohibido

- Empujar tags o publicar releases. Eso lo hace el autor.
- Mergear un PR, propio o ajeno.
- Empujar a una rama que no sea la tuya.
- Saltear, deshabilitar o marcar como `skip` un test para llegar a verde.
- Agregar una dependencia que el plan no nombra. Si de verdad hace falta, se justifica en el PR como pide la regla 4: qué resuelve, cuánto pesa, cuándo fue su último release.
- Subir un presupuesto de performance para que pase.

### Si te trabás

Anotá el bloqueo en `PROGRESO.md` —qué intentaste, qué pasó, qué harías después—, seguí con las tareas que no dependan de él, y reportalo al final. No inventes un resultado y no te quedes esperando.

---

## Lo que ningún agente puede hacer

Queda del lado del autor, y los planes lo marcan donde aparece:

- Revisar y mergear los PRs, en orden.
- Empujar los tags de release y probar los instaladores en una máquina real.
- Probar el emulador con un Android SDK de verdad.
- Decidir comprar un certificado de firma.
