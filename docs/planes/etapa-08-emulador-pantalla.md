# Etapa 8 — Emulador de Android II: pantalla y modelos

[← Etapa 7](./etapa-07-emulador-control.md) · [Planes de ejecución](./README.md) · [Siguiente: IDE I →](./etapa-09-ide-lenguaje.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e8` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e7`

## Objetivo

Las dos cosas que convierten el control de la [etapa 7](./etapa-07-emulador-control.md) en "un emulador de celular adentro del IDE":

- **Ver y tocar la pantalla** del dispositivo desde un panel de PasteCode.
- **Crear dispositivos de cualquier modelo**: elegir un perfil de hardware, una imagen de sistema, o una resolución y densidad a medida.

## Los límites, antes que las tareas

- **Es Android.** Un simulador de iOS sólo existe en macOS con Xcode; no hay forma de ofrecerlo en Windows ni en Linux.
- **Sigue sin poder verificarse en la nube**, igual que la etapa 7. Todo va contra dobles y sale marcado como pendiente de verificación manual.
- **La pantalla embebida va a ser lenta.** Se arma con capturas periódicas, a pocos cuadros por segundo. Alcanza para mirar y tocar una app; no para jugar ni para medir animaciones. La ventana propia del emulador sigue disponible para eso. Decilo en la UI y en la documentación: es una limitación elegida, no un bug.

## Leer antes

- Todo lo que dejó la etapa 7: `packages/core/src/android/`, `main/android/`, ADR-0037 y sus notas en `PROGRESO.md`.
- [`docs/convenciones/seguridad.md`](../convenciones/seguridad.md), "Argumentos como array, nunca como línea de comando". La parte C de esta etapa necesita una excepción a esa regla.
- `renderer/components/view-registry.tsx`, el registro `AUX_VIEW_REGISTRY`.

---

## Parte A — La pantalla

### T1 — Una fuente de cuadros, detrás de una interfaz

`main/android/screen-source.ts`: una interfaz con empezar —recibe un callback por cuadro— y parar. La implementación de esta etapa captura con `adb exec-out screencap -p`, que escribe un PNG por la salida estándar.

La interfaz existe porque hay una forma mejor —un stream de video H.264 decodificado en el renderer— que no se puede elegir a ciegas: depende de que la imagen del emulador tenga codificador y no se puede probar acá. Con la interfaz, cambiarla después es una implementación nueva y no una reescritura. Va en el ADR.

**El bucle:**

- Una captura por vez. La siguiente empieza cuando la anterior terminó, respetando un intervalo mínimo. **Nunca se encolan**: si el dispositivo es lento, bajan los cuadros por segundo, no sube la memoria.
- Un tope de tamaño por cuadro. Un PNG de una pantalla grande pesa megabytes.
- **Corre sólo mientras el panel está visible.** Al ocultarlo o al perder el foco la ventana, se detiene.

En `packages/core`, con tests: validar la firma de un PNG y leer su ancho y alto del encabezado. Es lo que permite descartar una captura truncada sin intentar dibujarla.

### T2 — El contrato y el panel

- Canal `android:setMirror`, que empieza o para el espejo de un dispositivo, con los cuadros por segundo pedidos (acotados en el schema).
- Evento `android:frame`, con el serial, un número de secuencia y los bytes del PNG. Verificá que el IPC de Electron lleve un `Uint8Array` sin convertirlo a texto: base64 infla cada cuadro un tercio.
- Vista nueva `'device'` en `AUX_VIEWS` y en `AUX_VIEW_REGISTRY`: comparte la columna derecha con el asistente. Un `<canvas>` que se ajusta al panel manteniendo la proporción, una barra con las acciones de la etapa 7, y los cuadros por segundo reales a la vista.
- Decodificá fuera del hilo principal (`createImageBitmap`) y dibujá en el canvas. RNF-06 prohíbe bloquear el renderer más de 50ms, y decodificar un PNG grande de forma síncrona lo hace.

### T3 — Tocar y escribir

**De coordenadas del canvas a coordenadas del dispositivo**: función pura en `core`, con tests, incluida la pantalla rotada y el canvas escalado con bandas.

| Gesto en el canvas | Qué se manda                       |
| ------------------ | ---------------------------------- |
| Click              | Un toque                           |
| Arrastre           | Un deslizamiento, con su duración  |
| Click sostenido    | Un toque largo                     |
| Rueda              | Un deslizamiento corto, vertical   |
| Teclas especiales  | El evento de tecla correspondiente |
| Texto              | El texto, por lotes                |

Un canal, `android:input`, con una unión discriminada y **cotas estrictas** en el schema: coordenadas enteras dentro de un rango, duración máxima, largo máximo de texto.

**El escapado del texto es la tarea delicada de la etapa.** `adb shell input text` pasa su argumento por el shell **del dispositivo**. Un texto con comillas, `$`, `;`, `&`, `|`, paréntesis, acentos graves o un salto de línea, mal escapado, ejecuta comandos en el emulador. No es la máquina del usuario, pero pegar un texto no puede hacer otra cosa que escribirlo.

- Función pura en `core`, con un test por cada carácter peligroso y uno con todos juntos.
- Los espacios tienen su propia codificación en `input text`. Los saltos de línea se mandan como evento de tecla, no adentro del texto.
- Lo que `input text` no soporta —verificá en su documentación qué pasa con lo que no es ASCII— se rechaza con un mensaje, no se manda a ver qué pasa.
- Agrupá las teclas: una llamada a `adb` por carácter es inusable.

---

## Parte B — Cualquier modelo

### T4 — Listar perfiles e imágenes

Las herramientas son `avdmanager` y `sdkmanager`, del paquete de herramientas de línea de comandos del SDK. **Pueden no estar instaladas**, y necesitan Java. Los dos casos tienen que terminar en un mensaje que diga qué instalar, no en un error crudo.

En `core`, con tests y la misma advertencia de la etapa 7 sobre las muestras:

- El listado de perfiles de dispositivo de `avdmanager`.
- El listado de paquetes instalados de `sdkmanager`, filtrado a imágenes de sistema.
- Los parsers son **tolerantes**: lo que no reconocen se saltea y se cuenta, no rompe el listado.

### T5 — Crear un AVD

Un asistente en la vista de dispositivos: nombre, perfil de hardware (con buscador), imagen de sistema, y opcionalmente resolución y densidad a medida.

- El nombre se valida con la expresión de la etapa 7.
- `avdmanager create avd` hace una pregunta interactiva; hay que contestarla por la entrada estándar.
- La resolución y la densidad a medida se escriben en el `config.ini` del AVD recién creado. Función pura en `core` que edita un `.ini` conservando lo demás, con tests. **Dónde está ese archivo no se asume**: se saca de lo que `avdmanager` informa, porque una variable de entorno lo puede mover.
- La salida de la herramienta se muestra mientras corre (RNF-24) y, si falla, queda a la vista entera.

**Alcance de esta etapa: se crean AVD con imágenes de sistema ya instaladas.** Si no hay ninguna, el asistente muestra el comando exacto para instalarla. Descargar imágenes desde el IDE implica aceptar licencias en nombre del usuario y bajar gigabytes; queda como requerimiento `C`, abierto.

### T6 — Los `.bat` de Windows

En Windows, `avdmanager` y `sdkmanager` son archivos `.bat`. Node se niega a lanzar un `.bat` sin shell —es una defensa contra inyección de argumentos—, así que la regla del proyecto, "argumentos como array, `shell: false`, nunca una línea de comando", **no se puede cumplir tal cual** para estas dos herramientas.

La salida es una excepción acotada, no un `shell: true`:

- Se lanza el intérprete de comandos por **ruta absoluta**, construida desde la variable de sistema, como ya hace `main/services/shell.ts` con PowerShell.
- Cada argumento se valida contra una **allow-list de caracteres**, sin espacios ni metacaracteres del intérprete. Un argumento que no pasa, no se lanza.
- La ruta del `.bat` puede tener espacios —un SDK bajo una carpeta de usuario con espacio en el nombre—: se entrecomilla, y se rechaza si contiene algo que rompa las comillas.
- Todo eso es **una función pura en `core`** que devuelve la invocación o el motivo del rechazo, con tests exhaustivos. Es la pieza más sensible de la etapa.

En macOS y Linux son scripts ejecutables y se lanzan directo, sin nada de esto.

**`docs/adr/0038-invocar-los-bat-del-sdk-de-android.md`**: por qué no se puede evitar, las condiciones exactas de la excepción, y la alternativa descartada de invocar la clase de Java directamente —depende de la disposición interna del SDK, que no es un contrato—. `seguridad.md` se enmienda con la excepción, en los mismos términos en que ya enmendó la regla del `PATH` para `git`.

---

## T7 — Tests y cierre

- `core`: todo lo puro de arriba.
- main: la fuente de cuadros y la creación de AVD contra los dobles de la etapa 7, ampliados (`fake-avdmanager.mjs`).
- E2E, contra dobles: el panel recibe y dibuja un cuadro; un click en el canvas produce el comando de toque con las coordenadas correctas; crear un AVD lo hace aparecer en la lista.
- `docs/03-requerimientos-funcionales.md`: el módulo RF-11xx al día.
- `CHANGELOG.md`.
- `PROGRESO.md`, con el checklist manual ampliado: qué versión de emulador y de imagen probar, qué mirar en la pantalla embebida, y los casos de texto con caracteres raros.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde.
2. Con el panel cerrado no corre ninguna captura. Hay test.
3. El escapado de `input text` tiene un test por carácter peligroso.
4. La invocación de `.bat` es una función pura con tests, y ningún camino lanza un `.bat` sin pasar por ella.
5. La fuente de cuadros está detrás de una interfaz, y el ADR dice por qué.
6. ADR-0038 escrito e indexado; `seguridad.md` enmendado.
7. La UI y la documentación dicen que la pantalla embebida es de pocos cuadros por segundo y que la etapa espera verificación con un SDK real.

## Trampas

- **RNF-04.** Cuadros de varios megabytes viajando por IPC varias veces por segundo es la forma más fácil de romper el presupuesto de memoria. Medí con el panel abierto, y soltá cada `ImageBitmap` al reemplazarlo.
- **La rotación.** Al rotar el dispositivo cambian el ancho y el alto del cuadro. El canvas y el mapeo de coordenadas tienen que seguir al cuadro que llega, no a un tamaño guardado.
- **El foco del teclado.** Con el canvas enfocado, las teclas van al dispositivo. Los atajos del IDE tienen que seguir pudiendo sacar el foco de ahí: una clave de contexto para las cláusulas `when`, como `terminalFocus`.
- **`avdmanager` es lento** y arranca una máquina virtual de Java en cada llamada. Los listados se piden al abrir el asistente, no al abrir la vista.
- **No inventes flags ni formatos.** Vale lo mismo que en la etapa 7, y acá hay más herramientas.
