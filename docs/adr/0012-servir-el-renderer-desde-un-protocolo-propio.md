# ADR-0012: Servir el renderer desde un protocolo propio en vez de `file://`

## Estado

`Aceptado`

**Fecha:** 2026-08-15

## Contexto

Hasta la Etapa 2, la ventana de producción cargaba con `window.loadFile(...)`, o sea que el renderer se servía por `file://`. Funcionó perfecto mientras la UI fueron tres elementos, y dejó de funcionar en cuanto entró Monaco.

Monaco levanta **web workers** para lo que no puede bloquear al hilo de la interfaz: el cálculo de diffs, la detección de links y las sugerencias por palabra. Una página servida por `file://` tiene un **origen opaco**, y Chromium se niega a construir workers desde ahí. El mismo origen opaco rompe la Content Security Policy por otro lado: `default-src 'self'` no referencia nada, porque no hay un "self" al que referirse.

El [plan de la Etapa 2](../00-guia-paso-a-paso.md) marcó esto como el riesgo alto de la etapa y pidió verificarlo antes de decidir, en vez de darlo por sentado. El spike se hizo y midió esto:

| Escenario                                    | Resultado                                                             |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Worker desde una página `file://`            | **Falla.** El origen reportado es `file://` y el worker emite `error` |
| Worker desde `pastecode://app`, vía `blob:`  | **Falla**, y la CSP lo explica: `worker-src <- blob`                  |
| Worker desde `pastecode://app`, mismo origen | **Anda.** Es lo que quedó implementado                                |

El segundo caso importa tanto como el primero: descarta la variante `?worker&inline` de Vite, que empaqueta el worker como `blob:`. La CSP la bloquea, y correctamente — permitir `blob:` en `worker-src` es habilitar la ejecución de código generado en runtime, que es exactamente lo que [RNF-13](../04-requerimientos-no-funcionales.md#seguridad) quiere evitar.

## Decisión

**El renderer de producción se sirve desde `pastecode://app`, un esquema propio registrado como estándar y seguro.**

```typescript
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pastecode',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
```

- `standard` es el que le da un **origen de verdad**, que es todo el punto: con eso los workers se pueden crear y `'self'` significa `pastecode://app`.
- `secure` lo mete en la lista de contextos seguros, sin la cual no hay workers de módulo ni `crypto.subtle`.
- `supportFetchAPI` habilita el `fetch` con el que Vite carga los chunks dinámicos, que es como entra Monaco.

`registerSchemesAsPrivileged` **tiene que llamarse antes de `app.whenReady()`**. Llamarlo tarde no tira error: el esquema queda registrado sin privilegios, la página carga igual y los workers siguen sin andar. Es un fallo silencioso, y por eso la llamada está en la primera línea de `main/index.ts` con un comentario que lo dice.

El handler sirve archivos de la carpeta del bundle y valida la contención con `isInsideRoot`, el mismo predicado que usa el guard de rutas del workspace. Un `..` en la URL ya lo colapsa el parser por tratarse de un esquema estándar, pero la verificación va igual: esto sirve archivos del disco a pedido del renderer, y el renderer no es de confianza.

**Consecuencia directa sobre la navegación:** `file://` deja de estar en la allow-list de `will-navigate`. Antes era el caso normal; ahora es exactamente lo que hay que bloquear, porque es la forma de que un link a `file:///c:/...` abra un HTML del disco con el preload ya inyectado.

En desarrollo no cambia nada: el renderer lo sigue sirviendo Vite en `http://localhost:5173`, que ya era un origen real.

## Alternativas consideradas

| Opción                                        | Pros                                                                             | Contras                                                                                                                                                     | Por qué no                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Seguir con `file://` y Monaco sin workers** | Cero cambios en el arranque; el resaltado y la edición andan igual               | Se pierden el diff, la detección de links y las sugerencias por palabra. El diff de Git de la Etapa 4 lo necesita sí o sí                                   | Es aplazar el mismo trabajo dos etapas, con la app ya construida encima de la decisión equivocada |
| **`--allow-file-access-from-files`**          | Una línea                                                                        | Baja una defensa del navegador para toda la app, y encima no arregla que `'self'` no signifique nada bajo un origen opaco                                   | Es la clase de solución que la regla 1 de `CLAUDE.md` prohíbe explícitamente                      |
| **Servidor HTTP local en `localhost`**        | Origen real, cero código de protocolo                                            | Abre un puerto TCP en la máquina del usuario: cualquier proceso local puede leer el bundle, y hay que elegir puerto, manejar colisiones y cerrarlo al salir | Mucha más superficie expuesta para el mismo resultado                                             |
| **`?worker&inline` (worker en `blob:`)**      | No haría falta tocar la carga de la ventana                                      | Requiere `worker-src blob:` en la CSP, o sea permitir ejecución de código generado en runtime. Medido en el spike: hoy lo bloquea                           | Contradice RNF-13, y encima seguiría sin resolver el origen opaco                                 |
| **Elegida: esquema propio** ✅                | Origen real, CSP con sentido, workers funcionando, sin puertos abiertos ni flags | Un archivo más en el main y una allow-list de navegación que cambia; `registerSchemesAsPrivileged` falla en silencio si se llama tarde                      | —                                                                                                 |

## Consecuencias

- ✅ Los workers de Monaco funcionan. Verificado en el E2E de la forma más directa que hay: se piden sugerencias por palabra, que las calcula el worker, y aparecen.
- ✅ `default-src 'self'` pasa a significar `pastecode://app`. La CSP dejó de ser una declaración de intenciones para pasar a restringir algo concreto.
- ✅ `file://` queda **bloqueado** para navegar, que es más estricto que antes.
- ✅ El mismo `isInsideRoot` que protege el workspace protege el bundle. Una sola implementación de contención de rutas, con una sola batería de tests.
- ⚠️ `registerSchemesAsPrivileged` tiene que correr antes de `whenReady`, y equivocarse no da error sino un bug sutil. Está en la primera línea del arranque, comentado.
- ⚠️ Las rutas de assets del renderer pasan a resolverse contra el esquema propio. Cualquier código que arme una URL a mano tiene que usar `APP_ORIGIN` y no suponer `file://`.
- ❌ Se cierra la puerta a abrir el `index.html` construido directamente en un navegador para depurar. Hay que levantar la app.
