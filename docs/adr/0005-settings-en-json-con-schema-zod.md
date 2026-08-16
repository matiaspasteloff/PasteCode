# ADR-0005: Persistir las settings en JSON validado con Zod, en dos capas

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

[RF-704](../03-requerimientos-funcionales.md#comandos-atajos-y-configuración) pide settings en un archivo con schema y validación, editable **dentro del propio IDE**. [RF-705](../03-requerimientos-funcionales.md#comandos-atajos-y-configuración) agrega dos capas: usuario y workspace, con precedencia del segundo. Y [git.md](../convenciones/git.md#versionado) declara al formato como **contrato público**: un cambio incompatible es un MAJOR.

Eso último es lo que hace que la elección del formato no sea una preferencia estética. Lo que se elija acá va a estar en el disco de cada persona que use PasteCode, y migrarlo después cuesta código de migración y una versión mayor.

Tres fuerzas concretas:

- **El archivo lo edita una persona, a mano, adentro del IDE.** Tiene que poder autocompletarse y marcar errores mientras se escribe. Eso no depende del formato sino de que exista un schema publicable.
- **El archivo lo escribe también la aplicación**, cuando alguien cambia algo desde la UI. Un formato que la app no pueda reescribir sin destruir lo que la persona escribió a mano es un problema.
- **Un archivo roto no puede tumbar el IDE.** [RNF-25](../04-requerimientos-no-funcionales.md#usabilidad-y-accesibilidad) obliga a explicar qué pasó y qué hacer, no a morirse.

## Decisión

**JSON, validado con Zod, en dos capas, con un campo `version` desde el día uno.**

Y una decisión de diseño que el schema documentado en [05-modelo-de-datos.md](../05-modelo-de-datos.md#schema-de-settings) no tenía y sin la cual nada de esto funciona: **son dos schemas, no uno.**

```typescript
/** Lo que se lee del disco: todo opcional, hasta los grupos. */
export const SettingsFileSchema = z.strictObject({
  version: z.literal(SETTINGS_VERSION).optional(),
  editor: z.strictObject(editorFields).partial().optional(),
  // ...
});

/** Lo que ve el resto de la aplicación: todo presente. */
export const SettingsSchema = z.strictObject({
  editor: z.strictObject(editorFields),
  // ...
});
```

El schema original tenía `.default()` en cada campo pero no en los grupos, así que `SettingsSchema.parse({})` fallaba: **un archivo parcial —que es el único archivo que alguien escribe de verdad— no se podía leer**. Un `settings.json` con una sola clave es el caso normal, no el borde.

Los defaults salen de los campos y pasan a ser una constante, `DEFAULT_SETTINGS`. No es cosmético: la precedencia de RF-705 necesita a los defaults como **una capa más** del merge, y una capa tiene que ser un objeto que se pueda pasar por parámetro, no un comportamiento escondido adentro de un parser.

**Semántica del merge**, que se fija acá porque después se discute: los objetos se combinan por grupo y **los arrays se reemplazan enteros**. La razón es `files.exclude`: si se concatenaran, un workspace no tendría ninguna forma de dejar de excluir algo que el usuario excluyó globalmente. Reemplazar deja las dos operaciones disponibles; concatenar deja una sola.

**`terminal.shell` no se puede setear desde el workspace.** Es la única clave del schema con precedencia invertida, y la razón está en [seguridad.md](../convenciones/seguridad.md#terminalshell-va-contra-una-allow-list): un `.pastecode/settings.json` viaja adentro de cualquier repositorio que se clone, y clonar no puede ser lo mismo que aceptar ejecutar lo que el repositorio diga.

## Alternativas consideradas

| Opción                                | Pros                                                                                                                                                         | Contras                                                                                                                                                                                                                        | Por qué no                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **TOML**                              | Más cómodo de escribir a mano: comentarios de verdad, sin comas colgantes, sin llaves                                                                        | Una dependencia de parseo **y** una de serialización. Y Monaco no tiene soporte de schemas para TOML, así que RF-704 —autocompletado y validación al editarlo adentro del IDE— habría que escribirlo entero                    | El requerimiento pide editarlo dentro del IDE con validación. Para JSON eso ya existe; para TOML es un proyecto aparte            |
| **JSONC (JSON con comentarios)**      | Es lo que usa VS Code, y resuelve la queja principal contra JSON                                                                                             | Reescribir el archivo desde la app conservando los comentarios exige un parser que preserve el árbol sintáctico. Un `JSON.parse` + `stringify` los borra todos, en silencio, la primera vez que se toca algo                   | Se puede agregar después sin romper nada: todo JSON es JSONC válido. Meterlo ahora es resolver un problema que todavía no tenemos |
| **Un solo schema con `.default()`**   | Es lo que estaba documentado, y una definición en vez de dos                                                                                                 | No puede parsear un archivo parcial, que es el único que existe. Y deja los defaults adentro del parser, donde el merge no los puede usar como capa                                                                            | No funciona. Es el bug que este ADR corrige                                                                                       |
| **Base de datos embebida (SQLite)**   | Escrituras atómicas gratis, consultas                                                                                                                        | Las settings dejan de ser editables con un editor de texto, versionables en Git y copiables entre máquinas. Y agrega un módulo nativo, con todo lo que eso implica ([ADR-0014](./0014-node-pty-con-binarios-precompilados.md)) | Un archivo de configuración que no se puede leer sin la aplicación es un archivo peor                                             |
| **Elegida: JSON + Zod, dos capas** ✅ | Cero dependencias nuevas —Zod ya valida todo el IPC—. El schema se puede publicar como JSON Schema para el autocompletado de RF-704. Diffeable y versionable | Sin comentarios. Una coma de más rompe el archivo entero, y por eso hace falta la recuperación de RNF-25                                                                                                                       | —                                                                                                                                 |

## Consecuencias

- ✅ Un archivo parcial —una sola clave— es válido, que es lo que la gente escribe.
- ✅ Los defaults son un objeto exportado, así que la precedencia se testea como una función pura sin tocar el disco.
- ✅ Una clave desconocida o un tipo equivocado **se rechazan**: `"fontsize": 14` en minúscula da un error visible en vez de ignorarse hasta que alguien note que no pasó nada.
- ✅ Un archivo roto no rompe nada: se sigue con los últimos valores buenos, se muestra qué pasó, y en cuanto se arregla el watcher lo detecta y todo vuelve solo.
- ✅ El campo `version` está desde el primer archivo escrito. Agregarlo el día que haga falta significaría que ninguno de los archivos anteriores lo tiene.
- ⚠️ **Sin comentarios.** Es la queja legítima contra JSON y no tiene respuesta buena hoy. La salida es JSONC más adelante, que es compatible hacia atrás.
- ⚠️ Escribir desde la app reserializa el archivo entero, así que se pierde el formato manual —el orden de las claves y la indentación—. El contenido no.
- ❌ Se cierra la puerta a settings que no sean serializables a JSON. No se ve qué setting podría necesitar eso.
