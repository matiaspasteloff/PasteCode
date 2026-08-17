# ADR-0024: Sacar la capa que ata Monaco de la cobertura unitaria

## Estado

`Aceptado`

**Fecha:** 2026-08-17

## Contexto

Los umbrales de cobertura de [`testing.md`](../convenciones/testing.md) están partidos por carpeta: 70% para `src/main/**` y 50% para `src/renderer/**`. La razón de partirlos está en el `vitest.config.ts` y sigue valiendo: un umbral global dejaría que la cobertura alta del main tape un renderer sin testear.

La configuración ya excluye código por un criterio explícito: **lo que no se puede ejercer sin el programa vivo lo cubre el E2E, no el test unitario**. Con eso afuera están `src/main/index.ts`, `src/main/windows/**` —arranque y creación de ventanas— y `src/renderer/main.tsx`.

Hay un cuarto grupo que cumple el mismo criterio y que quedó adentro por inercia: los módulos cuyo trabajo es **hablarle a la API de Monaco**. `use-monaco-editor.ts`, `monaco-instance.ts`, `model-registry.ts`, `monaco-setup.ts`, `navigation.ts`, `use-cursor-position.ts` y `MonacoEditor.tsx` suman 194 statements y están al 0%. No están al 0% porque nadie se ocupó: están al 0% porque testearlos unitariamente es escribir un doble de `monaco.editor` —modelos, decoraciones, view zones, el ciclo de vida del `IStandaloneCodeEditor`— y después verificar que se llamó a los métodos de ese doble. Ese test pasa cuando el doble miente y falla cuando Monaco cambia de API sin que la aplicación se rompa: mide la fidelidad del mock, no el comportamiento del editor.

Lo que esos módulos hacen sí está verificado, pero en el E2E, que corre contra el build de producción con Monaco de verdad: abrir un archivo, escribir, ver el gutter decorado, mover el cursor y leer la posición en la barra de estado.

El disparador fue concreto: el trabajo de las etapas 4 y 5 —LSP, git, terminal, dos grupos de edición— agregó bastante renderer, y la cobertura del paquete quedó en 36% contra el umbral de 50%, con el CI en rojo en los tres sistemas operativos.

## Decisión

Los módulos cuya responsabilidad es adaptar la API de Monaco se excluyen de la cobertura unitaria, con la misma justificación con la que ya se excluye `src/main/windows/**`, y su verificación queda en el E2E. **El umbral de 50% no se mueve**, y el resto del renderer —stores, paneles, comandos, hooks de estado— lo cumple con tests de verdad.

## Alternativas consideradas

| Opción                                      | Pros                                                                                                     | Contras                                                                                                                                                                | Por qué no                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Bajar el umbral a 36%**                   | Una línea y el CI se pone verde                                                                          | El número deja de significar algo: se lo mueve hasta donde esté el código en vez de mover el código hasta el número                                                    | Es exactamente lo que un umbral existe para impedir                                           |
| **Mockear `monaco.editor` y testear igual** | No se toca la configuración; el porcentaje sube                                                          | El test verifica que se llamó a un doble que escribimos nosotros; se rompe cuando Monaco cambia de API sin que la app se rompa, y pasa cuando el doble se desactualiza | Compra porcentaje, no confianza. Y el costo de mantenimiento cae sobre cada cambio del editor |
| **Elegida** ✅                              | El umbral sigue valiendo para el código que un test unitario puede ejercer de verdad; sin mocks frágiles | La capa de Monaco depende del E2E, que es más lento y corre en un solo sistema operativo                                                                               | —                                                                                             |

## Consecuencias

- ✅ El 50% pasa a medir el renderer que un test unitario puede ejercer sin mentir: stores, paneles, comandos y hooks de estado.
- ✅ Se evita una familia de tests que se rompen por cambios de API de Monaco sin que haya ninguna regresión de producto.
- ⚠️ Una regresión adentro de la capa de Monaco sólo la agarra el E2E, que corre en Windows nada más (RNF-26) y tarda minutos en vez de segundos.
- ⚠️ La lista de exclusiones hay que mantenerla: un módulo nuevo que ate Monaco tiene que entrar ahí a propósito, y uno que deje de hacerlo tiene que salir.
- ❌ Se cierra la puerta a medir la cobertura del editor con el número del paquete: para esa capa, la pregunta "¿está testeado?" se le hace al E2E.
