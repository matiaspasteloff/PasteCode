# ADR-0030: Barra de título propia con `frame: false`

## Estado

`Aceptado`

**Fecha:** 2026-08-20

Deroga la parte de [ADR-0022](./0022-cascaron-con-barra-de-actividades.md) que decidió conservar el marco nativo de Windows. El resto de aquel ADR —el rail de actividades, el registro de vistas, el panel inferior con pestañas, y no crear `packages/ui`— sigue vigente sin cambios.

## Contexto

ADR-0022 evaluó `frame: false` y lo descartó con un argumento que sigue siendo correcto en sus términos:

> Un marco propio obliga a reimplementar arrastre, snap, doble click para maximizar y los botones de ventana, y a mantenerlos en tres plataformas.

Lo que cambió no es el costo sino lo que hay del otro lado de la balanza. Con el marco nativo, la barra superior de PasteCode es una franja de 36px **debajo** de la barra de título del sistema, y eso deja tres problemas concretos:

- **Dos franjas horizontales de cromo antes de llegar al código.** En una pantalla de portátil son ~66px que no muestran nada.
- **No hay dónde poner una barra de menús.** Archivo, Editar, Ver, Ejecutar, Terminal y Ayuda son la superficie que hace descubrible lo que hoy sólo existe en la paleta de comandos. Meterlos en la franja propia sumaría una tercera fila.
- **La caja de comandos queda descentrada respecto de la ventana**, porque la ventana empieza más arriba de donde empieza la barra.

Y el argumento del costo se achicó de verdad en dos puntos: `-webkit-app-region` resuelve el arrastre, el snap y el doble click para maximizar **sin una línea de JavaScript**, y el proyecto empaqueta sólo para Windows ([build-y-release.md](../convenciones/build-y-release.md)), así que "mantenerlo en tres plataformas" es un costo hipotético y no uno real.

Lo que **no** cambió, y es lo que este ADR tiene que dejar escrito: nada de esto toca `webPreferences`.

## Decisión

**`frame: false` en la ventana principal, con una barra de título propia que replica la de VS Code: menús, caja de comandos centrada y los tres botones de ventana.**

Cuatro cosas que van juntas:

**`frame: false` y nada más.** `sandbox`, `contextIsolation` y `nodeIntegration` quedan exactamente como están. La regla 1 de `CLAUDE.md` no se negocia y este cambio no la roza: el marco es decoración de la ventana, no un permiso del renderer.

**Los controles de ventana van por IPC, como todo lo demás.** Canales nuevos `window:minimize`, `window:toggleMaximize`, `window:close` y `window:isMaximized`, más el evento `window:maximizedChanged`. El evento hace falta porque el glifo de maximizar cambia también cuando se arrastra la ventana al borde de la pantalla, que es un hecho que el renderer no puede preguntar.

**Los menús se resuelven contra el registro de comandos.** `MenuBar` recibe ids de comando y saca el título y el atajo del registro y del resolver de keybindings. **No hay una segunda tabla de títulos ni de atajos que mantener**: es el mismo argumento con el que el rail de actividades dispara comandos en vez de acciones del store (ADR-0022).

**`-webkit-app-region: drag` en la barra, y `no-drag` en cada hijo interactivo, como regla de CSS y no caso por caso.** Es el error clásico de esta feature: un botón sin `no-drag` no recibe clicks, y el síntoma —"el botón no anda"— no se parece en nada a la causa. En `global.css` va como un selector que cubre a todos los descendientes interactivos de la barra, así que agregar un control nuevo no incluye acordarse de esto.

## Alternativas consideradas

| Opción                                              | Pros                                                                                                            | Contras                                                                                                                                                                                                        | Por qué no                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Dejar el marco nativo (statu quo de ADR-0022)**   | Cero trabajo, cero riesgo, comportamiento de ventana perfecto por definición                                    | Dos franjas de cromo, ningún lugar para los menús, y la caja de comandos descentrada respecto de la ventana                                                                                                    | Es exactamente lo que se pidió cambiar, y el costo que lo justificaba se achicó              |
| **`titleBarStyle: 'hidden'` con `titleBarOverlay`** | Windows sigue dibujando los botones de ventana: cero riesgo de romper minimizar, maximizar o cerrar             | Los botones quedan con el estilo del sistema y no con el del tema activo, y hay que reservarles el ancho con `titleBarOverlay.width`. Un tema oscuro con botones claros se ve mal, y es lo primero que se mira | Media medida: se paga casi todo el costo de la barra propia y no se consigue la barra propia |
| **Menús en un `<select>` o en la paleta**           | Sin componente de menú que escribir, sin navegación por teclado que implementar                                 | Un `<select>` no anida, no muestra atajos y no se navega con `Alt`. Y la paleta ya existe: no resuelve el problema de descubrimiento, que es justamente para quien no sabe qué buscar                          | El valor de la barra de menús es ser una lista que se puede recorrer sin saber qué se busca  |
| **Elegida: `frame: false` con barra propia** ✅     | Una sola franja de cromo, menús descubribles, caja de comandos centrada de verdad, y los botones siguen al tema | Hay que replicar arrastre, doble click, snap y el estado de maximizado; los E2E que asumían marco nativo hay que actualizarlos                                                                                 | —                                                                                            |

## Consecuencias

- ✅ Una sola franja de cromo entre el borde de la pantalla y el código.
- ✅ La barra de menús existe y sale del registro de comandos: agregar un comando al menú es agregar su id a una lista, no duplicar su título ni su atajo.
- ✅ Los botones de ventana siguen al tema activo, incluidos los nueve nuevos de [ADR-0031](./0031-temas-incorporados-como-datos.md).
- ✅ `webPreferences` no cambia: `sandbox`, `contextIsolation` y `nodeIntegration` siguen como estaban desde el primer commit.
- ⚠️ El arrastre, el doble click para maximizar y el snap a los bordes son ahora responsabilidad nuestra. Salen de `-webkit-app-region`, pero un hijo interactivo sin `no-drag` deja de recibir clicks y el síntoma no se parece a la causa.
- ⚠️ El glifo de maximizar necesita un evento (`window:maximizedChanged`) porque el estado cambia también sin que nadie apriete un botón.
- ⚠️ Los E2E que asumían el marco nativo o que apuntaban a la barra vieja hay que actualizarlos.
- ❌ Se cierra la puerta a que el sistema operativo dibuje el menú contextual del marco (el que aparece con `Alt+Espacio`). Recuperarlo obligaría a manejarlo a mano.
