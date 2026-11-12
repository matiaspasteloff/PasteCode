# Etapa 3 — Modelo de confianza

[← Etapa 2](./etapa-02-instalador.md) · [Planes de ejecución](./README.md) · [Siguiente: deuda y tipografías →](./etapa-04-deuda-y-tipografias.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e3` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e2`

## Objetivo

Cerrar los dos hallazgos altos del [informe](../informes/2026-11-auditoria.md):

- **S2** — abrir una carpeta ejecuta código de esa carpeta sin preguntar.
- **S1** — una extensión corre con Node completo y se carga sin consentimiento.

El resto del modelo de seguridad del proyecto defiende contra un renderer comprometido. Estas dos son las formas realistas de que código ajeno llegue a la máquina, y ninguna pasa por el renderer.

**El principio que ordena toda la etapa:** la decisión de confiar la toma la persona frente a un diálogo **nativo, dibujado por el main**. El renderer puede _pedir_ que se muestre; no puede _contestar_ por ella. Es la misma idea que el filtro de modelos gratuitos y la allow-list de eventos: el control existe del lado que no se puede convencer.

## Leer antes

- [`docs/convenciones/seguridad.md`](../convenciones/seguridad.md), como quedó después de la etapa 1.
- `main/lsp/resolve-server-path.ts`, `main/lsp/registry.ts`, `main/ipc/workspace.ts`, `main/ipc/git.ts`, `main/ipc/debug.ts`, `main/ipc/ai.ts`, `main/services/settings.ts`.
- `packages/extension-host/src/` entero, `main/extensions/` entero y `main/ipc/extensions.ts`.
- [ADR-0003](../adr/0003-extension-host-aislado.md), [ADR-0025](../adr/0025-forma-de-la-api-de-extensiones.md), [ADR-0026](../adr/0026-broker-unico-y-pull-del-documento-activo.md).

---

## Parte A — Confianza de workspace

### Qué significa

Cada raíz de workspace es **de confianza** o está en **modo restringido**. Una carpeta que nunca se abrió arranca restringida hasta que la persona decide.

En modo restringido el main **no hace nada que ejecute o dependa de contenido del workspace**:

| Subsistema              | En modo restringido                     | Por qué                                                                                                                                             |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servidores de lenguaje  | No se lanza ninguno                     | El de TypeScript carga el `tsserver` del `node_modules` del workspace. `rust-analyzer` corre build scripts del proyecto                             |
| Debug                   | `debug:start` se rechaza                | Depurar es ejecutar el programa                                                                                                                     |
| Git                     | No se lanza `git`                       | La configuración local de un repositorio puede hacer que un `git status` ejecute un programa. Una carpeta bajada como archivo trae su `.git/config` |
| Settings del workspace  | `.pastecode/settings.json` no se aplica | Menos superficie; las claves peligrosas ya eran sólo de usuario                                                                                     |
| Asistente, modo `agent` | Se rechaza                              | El modelo lee archivos del workspace, y en `agent` escribe sin confirmación                                                                         |

**Sigue andando:** editar, guardar, el árbol, la búsqueda (ripgrep sólo lee), la terminal (cada comando lo escribe la persona) y los modos `ask` y `plan` del asistente.

### T1 — La lógica pura

`packages/core/src/workspace/trust.ts`, con tests:

- El schema del almacén: versión y lista de raíces de confianza.
- `isTrusted(store, root)`, y las funciones que devuelven un almacén nuevo con una raíz agregada o quitada.
- La comparación de rutas **no es `===`**: en Windows no distingue mayúsculas. Mirá cómo normaliza `workspace/is-inside-root.ts` y reusalo.

Sólo raíces exactas. Confiar en una carpeta madre no extiende la confianza a las hijas: es una regla más y nadie la pidió.

### T2 — El servicio y el diálogo

`main/services/workspace-trust.ts`:

- Carga y guarda el almacén en el directorio de datos del usuario con `writeTextFileAtomically`. Con un `useTrustDirectory(path)` para el E2E, como `useSessionDirectory`.
- Un archivo corrupto se trata como vacío —todo restringido— y se loguea. Fallar hacia "restringido" es la única dirección segura.
- `askForTrust(root)`: un `dialog.showMessageBox` nativo, con el nombre de la carpeta, qué habilita confiar, y dos botones. **El botón por omisión es el restringido.**

Verificá las opciones de `showMessageBox` en `electron.d.ts`.

### T3 — El contrato

| Canal                          | Para qué                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `workspace:getTrust`           | Devuelve `{ trusted }` del workspace abierto                                                              |
| `workspace:requestTrustChange` | Le pide al main que muestre el diálogo. Devuelve el estado después. **No lleva una respuesta**: sólo abre |

Evento `workspace:trustChanged`.

**No existe ningún canal que reciba `trusted: true` del renderer.** Ése es el punto de toda la parte A; un test del contrato debería hacerlo explícito.

### T4 — Aplicarlo

En `handleOpenWorkspace` (`main/ipc/workspace.ts`): después de elegir la carpeta, si no es de confianza se pregunta, y recién ahí se decide qué arrancar.

- De confianza: como hoy.
- Restringido: no se llama `startWatchingGit`, las settings se resuelven sin la capa del workspace, y los servidores de lenguaje quedan apagados.

Cada compuerta va **en el main, en el punto donde se lanza el proceso**, y responde con un `PasteCodeError` de código propio y un mensaje que diga qué hacer:

- LSP: en `resolve-server-path.ts` / `registry.ts`, un `problem` nuevo. El renderer ya sabe mostrar un servidor que no arrancó.
- Debug: en `debug:start`.
- Asistente: en el handler de `ai:chat`, cuando el modo es `agent`. La barrera de los modos ya vive en el main (`toolsForMode`); ésta va al lado.
- Git: donde se inicia el watcher y en cada handler de `git:*`.

**Cambiar de estado en caliente:**

- Restringido → confianza: arrancar Git, aplicar las settings del workspace. Los servidores de lenguaje son perezosos y arrancan solos al próximo `lsp:openDocument`.
- Confianza → restringido: `stopLspServers`, detener la sesión de debug, detener el watcher de Git, soltar las settings del workspace.

### T5 — La UI

- Un ítem en la barra de estado, visible **sólo en modo restringido**, que dispara el comando.
- Comando `workspace.manageTrust`, que llama a `workspace:requestTrustChange`.
- Una clave de contexto `workspaceTrusted` para las cláusulas `when`.
- El panel de Git y el del asistente explican por qué están apagados, en vez de aparecer vacíos.

### T6 — El E2E

La suite abre el workspace por `PASTECODE_E2E_WORKSPACE` y no puede clickear un diálogo nativo. Agregá `PASTECODE_E2E_TRUST` (`trusted` o `restricted`), leída **sólo si `!app.isPackaged`**, igual que las otras variables de `main/environment.ts`. Con el workspace forzado y sin esa variable, el valor es `trusted`: los specs existentes no cambian.

`e2e/tests/workspace-trust.spec.ts`, con `restricted`:

- la barra de estado muestra el modo restringido;
- abrir un `.ts` no lanza ningún servidor de lenguaje;
- el panel de Git explica que está apagado.

### Tests de la parte A

`core` (trust), el servicio (carga, guardado, archivo corrupto), y **un test por compuerta** que demuestre que en modo restringido no se lanza nada.

---

## Parte B — Extensiones

### T7 — Consentimiento y habilitación (RF-910)

**Estado**, en el directorio de datos del usuario: por extensión, si está habilitada y qué se aprobó —nombre, versión y lista de capabilities—. El schema y sus funciones van en `packages/core` o en `packages/extension-host`, puros y con tests.

**Reglas:**

- Las extensiones **incorporadas** (las de `resources/extensions`) están habilitadas y no piden consentimiento: viajan con la app.
- Una extensión **de usuario** (`~/.pastecode/extensions/`) que nunca se aprobó **no se carga**. Aparece en la lista como pendiente.
- Si cambia su versión o su lista de capabilities, vuelve a quedar pendiente.
- La aprobación es un diálogo **nativo** del main, que muestra nombre, versión y capabilities, y dice con todas las letras que una extensión corre con los permisos del usuario.

**Quién decide qué se carga.** Hoy `HOST_METHODS.loadExtensions` le pasa directorios al host, que escanea y activa en un solo paso. Eso tiene que cambiar: **el host nunca importa un módulo que el main no haya aprobado.** `scanExtensions` es fs puro y el main ya importa `@pastecode/extension-host`, así que lo más directo es que el main escanee, filtre por el estado, y le pase al host la lista exacta de qué cargar. Si encontrás una forma mejor, sirve: lo que no se negocia es que la decisión viva en el main.

**Contrato:**

- `extensions:list` suma por extensión: `source` (`bundled` o `user`), `enabled` y `approval` (`approved` o `pending`).
- `extensions:setEnabled` — habilitar o deshabilitar una ya aprobada. Recarga el host.
- `extensions:requestApproval` — abre el diálogo nativo. Sin payload de respuesta, por lo mismo que en la parte A.

### T8 — Vista de extensiones

Una vista lateral nueva: `'extensions'` en `SIDE_VIEWS`, una entrada en `SIDE_VIEW_REGISTRY`, un ícono y el comando `extensions.toggle`. Por extensión: nombre, versión, origen, estado, capabilities, el motivo si falló, y los botones de habilitar/deshabilitar o aprobar.

`components/status/StatusExtensions.tsx` ya existe: que abra la vista.

### T9 — Spike S5: ¿se puede confinar el host?

La pregunta: ¿`utilityProcess.fork` respeta el modelo de permisos de Node si se le pasa por `execArgv`?

**Antes de escribir una línea:**

1. Confirmá en `electron.d.ts` que las opciones de `utilityProcess.fork` aceptan `execArgv`.
2. Averiguá qué versión de Node trae Electron 43. El saludo del host ya la devuelve (`HOST_METHODS.ready`).
3. Con esa versión, mirá en la documentación de Node cómo se llaman los flags del modelo de permisos y cuáles existen. Cambiaron de nombre entre versiones.

**El experimento:** una extensión de prueba que intente leer un archivo fuera de su carpeta, lanzar un proceso hijo y hacer un `fetch`. Con los flags puestos, cada intento tiene que fallar con un error de permisos, y el host tiene que seguir andando: necesita leer su propio bundle —que en la app empaquetada está **adentro del asar**—, las carpetas de extensiones y hablar por `process.parentPort`.

Hace falta un Electron corriendo. Si tu contenedor no puede (mirá _Entorno_ en `PROGRESO.md`), corré el experimento como un spec del E2E y leé el resultado en el job de Windows del PR.

**Según lo que dé:**

- **Funciona:** se activa siempre, con lectura limitada a las carpetas de extensiones y al bundle, sin procesos hijo. Queda un spec que lo demuestra con la extensión de prueba. Decí explícitamente qué pasa con la red: si esa versión de Node no la restringe, queda anotado como límite.
- **No funciona, o funciona a medias:** no se fuerza. Se escribe exactamente qué se probó y qué pasó, y el control que queda es el consentimiento de T7.

En los dos casos el resultado va en un ADR. **Un spike que dice "no se pudo" con evidencia está terminado; uno que no dice nada, no.**

### T10 — Documentación

- **`docs/adr/0035-confianza-de-workspace.md`**: qué apaga el modo restringido y por qué cada cosa; por qué el diálogo es nativo; la alternativa descartada de confiar por carpeta madre.
- **`docs/adr/0036-consentimiento-y-confinamiento-de-extensiones.md`**: el consentimiento, quién decide qué se carga, y el resultado de S5.
- **`docs/convenciones/seguridad.md`**: sección nueva de confianza de workspace; el modelo de amenazas de extensiones, actualizado a lo que ahora es cierto.
- **`docs/extension-api/README.md`**: cómo se instala y se aprueba una extensión, y la sección "Qué no hay" corregida según S5.
- **`docs/03-requerimientos-funcionales.md`**: RF-910 cerrado; requerimientos nuevos para la confianza de workspace, con IDs nuevos.
- **`docs/05-modelo-de-datos.md`**: los dos archivos de estado nuevos.
- **`docs/06-roadmap-y-riesgos.md`**: los riesgos de S1 y S2, con su nueva probabilidad.
- **`CHANGELOG.md`** y **`PROGRESO.md`**.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde.
2. Una carpeta nunca vista abre en modo restringido salvo decisión explícita en el diálogo nativo.
3. En modo restringido no se lanza ningún servidor de lenguaje, ni `git`, ni una sesión de debug; hay un test por cada uno.
4. No existe ningún canal de IPC por el que el renderer pueda marcar un workspace como de confianza ni aprobar una extensión.
5. Una extensión de usuario sin aprobar no se importa. Hay un test que lo demuestra.
6. La vista de extensiones permite aprobar, habilitar y deshabilitar.
7. El spike S5 tiene resultado escrito, con evidencia, en ADR-0036.
8. `workspace-trust.spec.ts` pasa, y los specs anteriores siguen pasando sin tocarlos.
9. `seguridad.md` y la documentación de la API de extensiones describen lo que el código hace.

## Trampas

- **El orden de arranque ya mordió tres veces** (ver "Lo que salió distinto" de la Etapa 5 en `00-guia-paso-a-paso.md`). El host publica lo que cargó por un evento; si el main ahora escanea y filtra antes, cuidá que la ventana ya exista cuando se emita.
- **Un `git` que se lanza desde cinco handlers.** Poné la compuerta en un solo lugar por el que pasen todos, no en cada uno.
- **RF-907 sigue valiendo:** deshabilitar una extensión recarga el host, y eso no puede tumbar el IDE ni perder los ítems de status bar de las demás.
- **No rompas a `word-count` y `theme-nord`.** Son incorporadas: tienen que seguir cargando sin pedir nada, y sus specs del E2E tienen que seguir pasando.
- **RNF-04.** Escanear en el main suma poco, pero el margen es de 3,2MB. Miralo.
