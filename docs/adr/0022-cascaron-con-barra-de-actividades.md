# ADR-0022: Cascarón con barra de actividades y panel inferior con pestañas, sin `packages/ui`

## Estado

`Aceptado`

**Fecha:** 2026-08-16

## Contexto

La Etapa 4 produce tres superficies de UI que hoy no tienen dónde vivir: el panel de Git, el panel de problemas y el segundo grupo de editor. El cascarón actual no las puede alojar:

- La barra lateral alterna entre dos vistas con un `isSearchOpen ? <SearchPanel/> : <FileTree/>` escrito a mano, y **el booleano vive adentro de `search-store`**. Es ruteo de vistas alojado en el store de una feature: anda con dos vistas y no sobrevive a una tercera, porque con Git abierto no está claro de quién es el booleano que gana. Además obliga a que el contenedor de la barra lateral importe el store de la búsqueda para saber qué dibujar.
- El panel de la terminal es un componente sin abstracción de pestañas, que se muestra u oculta con otro booleano en otro store de feature. El panel de problemas necesita compartir ese espacio.
- No hay ningún lugar donde poner el nombre de la rama, ni el conteo de errores, ni el botón de comandos.

Es decir: **el cascarón de hoy no tiene dónde alojar lo que la Etapa 4 produce**, y por eso el rediseño va antes y no después.

Al mismo tiempo, [`02-arquitectura.md`](../02-arquitectura.md#estructura-del-monorepo) lista `packages/ui` como destino del monorepo, y este es el momento en el que uno naturalmente lo crearía: "hay muchos componentes compartidos, van a un paquete".

## Decisión

**Un cascarón con rail de actividades, contenedor de vistas por registro y panel inferior con pestañas — y `packages/ui` no se crea.**

El ruteo sale de las features y va a `stores/view-store.ts`, con las vistas declaradas como arrays `as const` (`SIDE_VIEWS`, `PANEL_VIEWS`) y no como enums. `components/view-registry.tsx` tiene los descriptores —id, icono, clave de i18n, comando— y el contenedor **no conoce ninguna vista**: busca el descriptor por id y dibuja lo que diga. Agregar una vista es agregar una entrada.

El rail **dispara comandos, no acciones del store**. Podría llamar a `toggleSide` directo y sería una línea menos, pero entonces habría dos caminos para mostrar la búsqueda —el botón y `Ctrl+Shift+F`— que pueden divergir. El paso 17 refactorizó todo lo demás para que pasara por el registro de comandos; esto es lo mismo.

La geometría es una grilla de tres columnas (`activity` / `side` / `main`) y tres filas (`toolbar` / contenido / `status`). **El panel inferior vive adentro de `main` como columna flex, no como fila de la grilla**: no debe extenderse por debajo de la barra lateral, y así conserva intacta la geometría actual de `TerminalPanel`.

La barra de título nativa de Windows **queda intacta**: la barra superior del diseño se adapta a una toolbar propia debajo del marco, sin `frame: false`. Un marco propio obliga a reimplementar arrastre, snap, doble click para maximizar y los botones de ventana, y a mantenerlos en tres plataformas.

## Alternativas consideradas

| Opción                                                         | Pros                                                                                                                        | Contras                                                                                                                                                                                                                                                | Por qué no                                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Extraer los componentes a `packages/ui`**                    | Es lo que la arquitectura lista como destino, y suena a la decisión "prolija"                                               | Un paquete con **un solo consumidor** es una carpeta con build, `package.json`, tsconfig y nodo de turbo, y cero beneficio de caché porque el renderer se recompila igual. Peor: los componentes necesitan `../i18n` (RNF-29) y leen stores de Zustand | Extraerlos obliga a mudar i18n y los stores también, o a que el paquete importe internals de la app — que es justo lo que `import-x/no-cycle` caza |
| **Dejar el ruteo en los stores de feature y sumar un tercero** | Cero refactor                                                                                                               | Con tres booleanos en tres stores, "mostrar Git" tiene que apagar los otros dos, y eso es una regla que vive en ningún lado y se olvida                                                                                                                | Es el bug que la tercera vista traería el primer día                                                                                               |
| **`frame: false` y barra de título propia**                    | La barra superior del diseño se puede reproducir tal cual                                                                   | Hay que reimplementar arrastre, snap a los bordes, doble click para maximizar, los botones de ventana y su comportamiento en tres plataformas. Y romperlo se nota en el primer segundo de uso                                                          | Es una cantidad de trabajo desproporcionada para una franja de 30px, y el marco nativo no es un problema que alguien tenga                         |
| **Elegida: cascarón por registro, sin `packages/ui`** ✅       | Agregar una vista es una entrada. `renderer/components/` sigue siendo la carpeta de UI compartida, sin ceremonia de paquete | Es una ola de renombres que toca todos los componentes a la vez, y no se puede partir sin dejar la app sin compilar a mitad de camino                                                                                                                  | —                                                                                                                                                  |

## Consecuencias

- ✅ Agregar el panel de Git es **una entrada en el registro**, y esa entrada es la única prueba que este diseño necesita.
- ✅ El ruteo de vistas deja de estar en los stores de las features, así que `search-store` vuelve a ser sólo sobre buscar.
- ✅ Los 12 specs E2E existentes siguen pasando **sin cambios de selector**. Es lo único que cubre un cambio que toca todos los componentes a la vez, así que la regla dura del rediseño fue no renombrar ni borrar un solo `data-testid`. Por eso el bloque de CSS de la barra lateral sigue llamándose `sidebar` aunque el componente ahora se llame `SideView`: sigue siendo la barra lateral, y renombrar la clase sólo rompería el spec que mide su fondo.
- ⚠️ `packages/ui` **queda listado en la arquitectura como destino y sigue sin existir a propósito**. Está anotado ahí para que la próxima persona que abra el repo no lo cree por prolijidad. El argumento de la Etapa 5 tampoco lo obliga: RF-904 es _contribuir ítems a la status bar_, y una extensión contribuye **datos**, no componentes.
- ⚠️ Los PRs del rediseño pasan de cinco archivos, contra la guía de la propia convención. Diez componentes hoja de quince líneas no tienen radio de explosión, y el PR del contenedor de vistas es una ola de renombres que no se puede partir sin dejar la app sin compilar a mitad de camino — que es la regla que el límite de cinco archivos realmente protege.
- ❌ Se cierra la puerta a una barra de título propia con pestañas adentro, como la de algunos editores. Reabrirla es `frame: false` y reimplementar el manejo de ventana en tres plataformas.
