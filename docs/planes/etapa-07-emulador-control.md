# Etapa 7 — Emulador de Android I: control

[← Etapa 6](./etapa-06-diseno-superficies.md) · [Planes de ejecución](./README.md) · [Siguiente: emulador II →](./etapa-08-emulador-pantalla.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e7` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e6`

## Objetivo

Manejar emuladores de Android **reales** desde el IDE: ver los dispositivos virtuales (AVD) que la persona tiene, lanzarlos, detenerlos, ver su logcat, instalar un APK y mandar las acciones básicas. La pantalla embebida y la creación de dispositivos son la [etapa 8](./etapa-08-emulador-pantalla.md).

Es la **Etapa Experimental 2**: entra al lado del contrato de alcance de la v1, con las mismas cuatro reglas con las que entró el asistente de IA ([alcance experimental](../01-vision-y-alcance.md#alcance-experimental)).

## Dos cosas que hay que tener claras antes de empezar

**No se empaqueta nada.** El Android SDK son varios gigabytes. PasteCode usa el que la persona ya tiene instalado —normalmente por Android Studio—, igual que usa su `git` y su `pyright`. Sin SDK, la feature muestra un mensaje que dice qué instalar y el resto del IDE no se entera.

**Esta etapa no se puede verificar de punta a punta en la nube.** No hay SDK, ni emulador, ni virtualización anidada. Todo se construye y se testea contra **dobles**, como `main/debug/fake-adapter.mjs` hace con DAP. Los formatos de salida de `adb` y `emulator` que este plan describe salen de su documentación, no de haberlos corrido: los parsers tienen que ser tolerantes, y la etapa se entrega marcada como **pendiente de verificación manual**, con un checklist para el autor.

## Leer antes

- [`docs/convenciones/seguridad.md`](../convenciones/seguridad.md), sección de procesos hijo: cómo se resuelve un ejecutable, qué puede y qué no puede elegir el workspace.
- [ADR-0016](../adr/0016-supervisor-de-procesos-generico.md), [ADR-0019](../adr/0019-git-con-spawn-crudo.md) y [ADR-0028](../adr/0028-adaptador-dap-externo-y-cliente-propio.md): son el molde.
- `main/git/resolve-git.ts` y `main/git/run.ts`; `main/supervisors/`; `main/services/search.ts` (un proceso que emite resultados por eventos).
- `main/debug/fake-adapter.mjs` y cómo lo usan sus tests y el E2E.
- [ADR-0029](../adr/0029-asistente-de-ia-en-el-main.md) y la "Etapa Experimental 1" de [`00-guia-paso-a-paso.md`](../00-guia-paso-a-paso.md): cómo se documenta una etapa experimental.

---

## Tareas

### T1 — Documentación primero

Es la regla de las etapas experimentales: si la decisión no se puede escribir, no está tomada.

- `docs/01-vision-y-alcance.md`: el emulador de Android en "Alcance experimental", con las cuatro reglas —no cuenta contra el contrato, es opt-in, se puede sacar sin romper nada, no entra en los criterios de éxito—.
- `docs/03-requerimientos-funcionales.md`: módulo nuevo **RF-11xx · Emulador de Android**, con prioridad MoSCoW y criterio de aceptación por requerimiento. Los de la etapa 8 se listan ya, sin marcar.
- `docs/adr/0037-emulador-de-android-sobre-el-sdk-instalado.md`: SDK externo contra empaquetado; `adb` y `emulator` por línea de comandos contra el endpoint gRPC del emulador (que pediría una dependencia de gRPC); sondeo contra `adb track-devices`; qué pasa con los emuladores al cerrar el IDE.
- `docs/00-guia-paso-a-paso.md`: sección "Etapa Experimental 2", con numeración propia (E2.1…), como hizo la primera.
- Scope `emulator` en `commitlint.config.js` y en `docs/convenciones/git.md`.

### T2 — Settings

Grupo nuevo `android`:

| Clave          | Tipo            | Por omisión | Qué es                                 |
| -------------- | --------------- | ----------- | -------------------------------------- |
| `sdkPath`      | ruta o `null`   | `null`      | Raíz del SDK. `null` es "buscalo"      |
| `emulatorArgs` | lista de textos | `[]`        | Argumentos extra al lanzar un emulador |

**Las dos son sólo de usuario.** Elegir el SDK es elegir qué ejecutable corre, y los argumentos extra alcanzan para cambiar qué hace: es el mismo razonamiento que `debug.adapterPath` y `debug.adapterArgs`. Seguí ese molde en `merge.ts`, con tests que fijen que un `.pastecode/settings.json` no las puede escribir. Si la etapa 6 dejó una lista única de settings sólo de usuario, sumalas ahí.

### T3 — La lógica pura

`packages/core/src/android/`, todo con tests. Cada parser lleva como fixture una muestra de la salida que espera, **con un comentario que diga que la muestra sale de la documentación y no de una corrida**.

- **Dónde buscar el SDK**: dado el entorno, la plataforma y el directorio del usuario, la lista ordenada de candidatos —`ANDROID_HOME`, `ANDROID_SDK_ROOT`, y las ubicaciones por omisión de Android Studio en cada sistema—.
- **Dónde están las herramientas** adentro de un SDK: `emulator` y `adb`, con su extensión según la plataforma.
- **`emulator -list-avds`**: un nombre por línea. Las versiones nuevas mezclan líneas informativas; se descarta todo lo que no sea un nombre válido.
- **Nombre de AVD y serial de dispositivo válidos**: dos expresiones estrictas. Son lo que impide que un valor llegado del renderer termine siendo un argumento inesperado.
- **`adb devices -l`**: serial, estado (`device`, `offline`, `unauthorized`) y modelo.
- **Argumentos**: los de lanzar un emulador y los de cada acción de `adb`, como arrays. La tabla de teclas (inicio, atrás, recientes, encendido, volumen).
- **Logcat** en formato `threadtime`: hora, pid, tid, nivel, etiqueta y mensaje. Una línea que no parsea se conserva como texto crudo; no se pierde.
- **El ciclo de vida de un dispositivo**, como reductor: detenido, lanzando, arrancando, en línea, deteniéndose, con error.

### T4 — El main

`apps/desktop/src/main/android/`:

- **`resolve-sdk.ts`**: la setting del usuario primero, después los candidatos. Cada herramienta pasa por `assertExecutable`. **Se rechaza un SDK adentro de la raíz del workspace**, por lo mismo que se rechaza un `git` ahí: un repositorio clonado puede traer el suyo. Lo que llega a `spawn` es siempre absoluto.
- **`adb.ts`**: una función para correr un comando de `adb` y esperar su salida, con `shell: false`, tiempo límite y `sanitizedEnvironment`. Mirá `runGit`.
- **`emulator-service.ts`**: lanza y detiene emuladores. El emulador es un proceso largo con ventana propia. No se reinicia solo si se cae: es `createManagedProcess`, no el supervisor con reintentos —verificá la diferencia leyendo los dos—.
- **`logcat-service.ts`**: un `adb logcat` por dispositivo, con las líneas entregadas **en lotes** por un evento, como hace la búsqueda. Una línea por evento satura el IPC.
- **Sondeo de dispositivos**: `adb devices` cada pocos segundos, **sólo mientras la vista está abierta**. El renderer avisa cuándo empezar y cuándo parar.

**Al cerrar, todos mueren** (RNF-10). Lo que PasteCode lanzó se registra con `registerDisposer`: primero se le pide al emulador que se apague por `adb`, y si no responde se mata el proceso. Un emulador que la persona abrió por su cuenta no se toca.

**El directorio de trabajo.** `seguridad.md` dice que el `cwd` de todo proceso hijo es el workspace y que sin workspace no se lanza nada. `adb` y `emulator` no tienen nada que ver con el workspace y tienen que andar sin uno abierto: su `cwd` es la raíz del SDK. Es una excepción a la regla escrita; va en el ADR y en `seguridad.md`.

### T5 — El contrato

`packages/ipc-contract/src/schemas/android.ts`:

| Canal                  | Para qué                                                               |
| ---------------------- | ---------------------------------------------------------------------- |
| `android:getStatus`    | Si hay SDK, y si no, qué falta                                         |
| `android:listAvds`     | Los dispositivos virtuales definidos                                   |
| `android:watchDevices` | Empezar o parar el sondeo                                              |
| `android:start`        | Lanzar un AVD por nombre                                               |
| `android:stop`         | Detener un dispositivo por serial                                      |
| `android:action`       | Una acción de una lista cerrada: inicio, atrás, recientes, rotar, etc. |
| `android:installApk`   | Instalar un APK en un dispositivo                                      |
| `android:screenshot`   | Guardar una captura                                                    |
| `android:setLogcat`    | Empezar o parar el logcat de un dispositivo                            |

Eventos: `android:devicesChanged`, `android:logcat` y `android:emulatorExited`.

- Todo nombre de AVD y todo serial se valida en el schema con las expresiones de `core`.
- **`installApk` y `screenshot` no reciben rutas.** El main abre el diálogo nativo para elegir el APK o dónde guardar la captura. Es más simple que validar una ruta y no le da al renderer nada que falsificar.

### T6 — El renderer

- Vista lateral `'devices'`: entrada en `SIDE_VIEWS` y en `SIDE_VIEW_REGISTRY`, ícono, comando `android.toggleDevices`.
- Por dispositivo: nombre, estado y las acciones que ese estado permite.
- **Los tres estados que no son el feliz**: sin SDK (qué instalar y qué setting tocar), SDK sin ningún AVD (cómo crear uno; en la etapa 8 será un botón), y error al lanzar (con el final de la salida del emulador, que es lo único que sirve para diagnosticar).
- Pestaña `'logcat'` en `PANEL_VIEWS`: lista virtualizada con `@tanstack/react-virtual` —ya es dependencia—, filtro por nivel y por texto, pausar y limpiar. Con un tope de líneas en memoria.

**Es opt-in de verdad:** nada se resuelve, se lanza ni se sondea hasta que alguien abre la vista. RNF-01 y RNF-04 no se pueden mover con la feature sin usar.

### T7 — Tests

- `core`: todo lo de T3.
- main: los servicios contra **`fake-adb.mjs` y `fake-emulator.mjs`**, scripts de Node que imitan la salida de las herramientas. El patrón `src/main/**/fake-*.mjs` ya está declarado en `knip.jsonc`.
- **Cómo se apunta a los dobles.** Un `.mjs` no es un ejecutable. El resolvedor tiene que poder devolver "archivo más argumentos fijos", como ya hace `ShellCommand`, para que bajo una variable de E2E —leída sólo si `!app.isPackaged`— la herramienta sea Node corriendo el doble. Es el mismo truco con el que se lanza el servidor de TypeScript.
- E2E `android.spec.ts`, contra los dobles: la vista lista los AVD, lanzar uno lo lleva a "en línea", el logcat muestra líneas, y al cerrar la app no queda ningún proceso.

### T8 — Cierre

- `docs/convenciones/seguridad.md`: `android.sdkPath` y `android.emulatorArgs` en la allow-list del usuario, y la excepción del `cwd`.
- `docs/05-modelo-de-datos.md`: el grupo `android`.
- `CHANGELOG.md`.
- `PROGRESO.md`, con el **checklist de verificación manual** para el autor: qué probar con un SDK real, en qué orden, y qué salida copiar si algo no coincide con lo que los parsers esperan.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde.
2. Con la feature sin usar, los presupuestos de performance no se mueven.
3. Ningún valor que llega del renderer alcanza un `spawn` sin pasar por una expresión estricta.
4. Un `.pastecode/settings.json` no puede elegir el SDK ni los argumentos del emulador. Hay test.
5. Al cerrar la app no queda ningún proceso lanzado por PasteCode. Hay test.
6. Sin SDK, la vista explica qué hacer y nada más se rompe.
7. ADR-0037 escrito e indexado, y el módulo RF-11xx en los requerimientos.
8. `PROGRESO.md` dice sin vueltas que la etapa está pendiente de verificación con un SDK real, y trae el checklist.

## Trampas

- **`adb` arranca un servidor propio** la primera vez que se lo llama, y ese proceso sobrevive al comando. No lo lanzó PasteCode a propósito, pero queda vivo: decidí en el ADR si se lo apaga al cerrar (`adb kill-server` afecta a cualquier otra herramienta que lo esté usando) o se lo deja, y escribí por qué.
- **Un emulador tarda en arrancar.** "En línea" no es "listo": `adb` lo lista antes de que el sistema termine de arrancar. El reductor de T3 distingue los dos estados; la UI también.
- **Varios emuladores a la vez.** Cada uno tiene su serial. Nada puede asumir que hay uno solo.
- **Windows.** `emulator.exe` y `adb.exe` son ejecutables de verdad y se lanzan sin shell. Los `.bat` de `avdmanager` son otro problema, y es de la etapa 8.
- **No inventes flags.** Si no estás seguro de que un argumento de `adb` o de `emulator` existe, no lo uses: es la regla 7, y acá no hay forma de comprobarlo corriéndolo.
