# Etapa 11 — Cierre de la Fase 5

[← Etapa 10](./etapa-10-ide-git-debug-ia.md) · [Planes de ejecución](./README.md)

**Rama:** `claude/ide-exponential-improvements-mh7gtv-e11` · **PR contra:** `claude/ide-exponential-improvements-mh7gtv-e10`

## Objetivo

Dejar el proyecto listo para que su autor publique la `v1.0.0`: lo que la Fase 5 del [roadmap](../06-roadmap-y-riesgos.md) pide y las diez etapas anteriores no cubrieron —accesibilidad, la decisión sobre el presupuesto de memoria, el README de presentación—, y una pasada final para que la documentación diga lo que el código hace.

**Esta etapa no agrega features.** Si aparece una idea, va a un `IDEAS.md`, como pide la guía.

## Leer antes

- [`PROGRESO.md`](./PROGRESO.md) **entero**: las notas de las diez etapas son la materia prima de esta.
- [`docs/04-requerimientos-no-funcionales.md`](../04-requerimientos-no-funcionales.md), RNF-21 a RNF-25.
- [ADR-0021](../adr/0021-presupuesto-de-ram-partido.md) y [ADR-0015](../adr/0015-presupuestos-absolutos-de-performance.md).
- [`docs/00-guia-paso-a-paso.md`](../00-guia-paso-a-paso.md), Etapa 6 (pasos 38 a 43) y las reglas de ritmo.

---

## Tareas

### T1 — Accesibilidad (RNF-21 a RNF-25)

**Lo que se puede automatizar, se automatiza.**

- Un spec de E2E que corra un motor de reglas de accesibilidad sobre cada estado principal: bienvenida, editor con un archivo, cada vista lateral, cada pestaña del panel inferior, la paleta abierta, la configuración y cada diálogo. Falla con hallazgos serios o críticos.
- Para eso hace falta una dependencia de desarrollo: el motor de reglas con su integración para Playwright. Justificala en el PR como pide la regla 4. No llega al instalador.
- El interior de Monaco y de xterm es de terceros: se excluye **por selector y con un comentario que diga por qué**, no con una exclusión global.

**El teclado** (RNF-21):

- Un spec que recorra el cascarón con `Tab` y verifique que se llega a cada región y que de cada diálogo se sale.
- Si no existe, un comando para saltar el foco entre regiones.
- Revisá que todo lo interactivo tenga un anillo de foco visible: buscá en los estilos lo que tenga `:hover` sin `:focus-visible`.

**Progreso y errores** (RNF-24 y RNF-25): son dos listas a recorrer, no dos features.

- Toda operación que pueda pasar de medio segundo, con su indicador: abrir carpeta, buscar, las operaciones de Git, el arranque de un servidor de lenguaje, la descarga de una actualización, el arranque de un emulador.
- Todo `userMessage`, leído uno por uno: ¿dice qué pasó y qué hacer? Los que no, se reescriben.

Lo que se arregle va con su test. Lo que no se pueda arreglar acá queda listado, con su severidad.

**Probar con un lector de pantalla** es el paso 39 de la guía y no lo puede hacer un agente: va al checklist del autor.

### T2 — El presupuesto de memoria (RNF-04)

Al cerrar la Fase 4 la corrida completa dio 396,78MB contra un techo de 400, y el roadmap dejó escrito que antes de la Fase 5 había que elegir: partir el presupuesto, como se hizo por `tsserver`, o bajar de verdad lo que ocupa la app.

1. **Medí primero.** Los números actuales están en el comentario del job de performance de los PRs de la pila. Diez etapas agregaron código: anotá cuánto se movió y qué etapa lo movió.
2. **Probá las bajadas baratas antes de tocar el techo:**
   - No forkear el extension host si ninguna extensión habilitada trae código. Desde la etapa 3 se pueden deshabilitar, así que hay un caso real en que el host no hace falta.
   - Todo lo que se agregó y no se usa al arrancar tiene que cargarse por `import()` diferido: el actualizador, la configuración gráfica, el emulador, el editor de diff.
3. **Si después de eso el margen sigue sin alcanzar**, se parte el presupuesto con un ADR, siguiendo a ADR-0021: un escenario más, con su número medido y su justificación.

**Lo que no se hace es subir el número para que pase.** Un techo que se mueve cuando molesta no es un presupuesto. Cualquier cambio a RNF-04 va con el ADR, con los números de antes y de después, y con lo que se intentó primero.

### T3 — El README de presentación

Es el paso 41 de la guía: _"este archivo es lo que más gente va a leer de todo el repo"_.

- Una frase que diga qué es, y debajo el lugar del GIF de demo.
- Qué hace, en una lista corta, con capturas.
- Instalación por plataforma (la escribió la etapa 2; se revisa).
- **La arquitectura**: el diagrama de los tres procesos y un párrafo por decisión difícil, con link a su ADR. Es lo que un revisor técnico viene a buscar.
- El modelo de seguridad en cinco líneas, con link a `seguridad.md`.
- La tabla de presupuestos de performance con los números medidos.
- Cómo levantar el proyecto y los comandos.
- Estado y roadmap.

**Las capturas.** Si Electron corre en tu entorno (mirá _Entorno_ en `PROGRESO.md`), generalas con un script de Playwright y commitealas en `docs/assets/`. Si no corre, dejá los lugares marcados, con el nombre de archivo esperado, y sumalo al checklist del autor. **El GIF lo graba el autor**: no lo simules.

### T4 — Que la documentación diga la verdad

Una pasada por cada documento, contra el código:

- **`PROJECT.md`**: estado, versión de la documentación y fecha.
- **`docs/06-roadmap-y-riesgos.md`**: los checkboxes de la Fase 5 —cada uno marcado sólo si se verificó, con la distinción entre "el código está" y "se probó con un release real"—, el checkbox de CI de la Fase 0 que seguía sin marcar, y la tabla de riesgos con su "Revisión al cerrar la Fase 5".
- **`docs/00-guia-paso-a-paso.md`**: el cierre de la Etapa 6 con su "lo que salió distinto de lo previsto", armado con las notas de `PROGRESO.md`. Es la sección que este proyecto escribe mejor: seguí ese tono, con los hechos de verdad.
- **`docs/03-requerimientos-funcionales.md`**: el estado de cada RF coincide con lo entregado. Los parciales dicen qué falta.
- **`docs/README.md`** y **`docs/adr/README.md`**: el árbol y el índice completos. Hoy el árbol lista 6 ADRs.
- **`docs/05-modelo-de-datos.md`**: cada schema coincide con el del código.
- **`CHANGELOG.md`**: la sección de la `1.0.0` armada, sin publicar.

### T5 — El checklist de release

`docs/release-checklist.md`: todo lo que quedó "pendiente del autor" en las once etapas, **consolidado y en orden**:

1. Mergear los PRs de la pila, en orden.
2. Las verificaciones manuales: los instaladores en Windows, macOS y Linux; el auto-update de una beta a la siguiente; el emulador con un SDK real, con el checklist de las etapas 7 y 8; el lector de pantalla.
3. La decisión sobre el certificado de firma, con el ADR pendiente.
4. El GIF y las capturas que falten.
5. Subir la versión, publicar la beta, y recién después la `1.0.0`.

Cada ítem dice qué mirar y qué resultado esperar.

**No subas la versión a `1.0.0` ni empujes el tag.** Publicar es del autor.

### T6 — Cierre de los planes

- `PROGRESO.md`: la etapa 11 y un resumen final de las once —qué se entregó, qué quedó abierto y dónde está anotado—.
- La última verificación completa, y el CI de toda la pila en verde.

---

## Criterios de aceptación

1. Los cuatro comandos de verificación pasan, y el CI del PR está en verde.
2. El spec de accesibilidad corre en el CI sin hallazgos serios ni críticos, y las exclusiones están justificadas una por una.
3. RNF-04 está dentro de presupuesto, por una bajada real o por un ADR que lo parte con números. No por un techo más alto.
4. El README se puede leer de arriba abajo sin encontrar una afirmación que el código contradiga.
5. Ningún checkbox del roadmap está marcado sin haberse verificado.
6. `docs/release-checklist.md` existe y cubre todo lo pendiente del autor de las once etapas.
7. La versión no se tocó y no se empujó ningún tag.

## Trampas

- **La tentación de marcar todo.** El valor de esta etapa es que lo que dice "hecho" esté hecho. El auto-update sin un release real, el emulador sin un SDK real y los instaladores sin una máquina real **no están verificados**, y el roadmap tiene que decirlo así.
- **El motor de accesibilidad encuentra mucho la primera vez.** Arreglá lo serio y lo crítico; lo menor se lista. No bajes el umbral para llegar a verde.
- **Los `import()` diferidos cambian el arranque.** Después de mover algo a carga diferida, mirá RNF-01 además de RNF-04.
- **"Lo que salió distinto de lo previsto" se escribe con hechos.** Si las notas de una etapa no alcanzan para reconstruir qué pasó, se dice eso; no se rellena.
