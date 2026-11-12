# ADR-0033: Negar por omisión los permisos, grabar los fuses y sacar el menú de la app empaquetada

## Estado

`Aceptado`

**Fecha:** 2026-11-12

## Contexto

El [informe de auditoría de noviembre de 2026](../informes/2026-11-auditoria.md) encontró que la app distribuida tenía tres puertas abiertas que no dependen del código del renderer, sino de valores por omisión de Electron que nadie había cambiado:

- **Permisos (S3).** Sin `setPermissionRequestHandler` ni `setPermissionCheckHandler`, Electron **concede** cámara, micrófono, geolocalización y notificaciones a cualquier página que los pida. Verificado: sin handlers, `navigator.permissions.query` devuelve `granted` para los tres.
- **Fuses (S4).** El binario instalado obedecía `NODE_OPTIONS` y `--inspect` —cualquiera que pudiera lanzarlo podía inyectar código o adjuntar un depurador al proceso main— y no validaba la integridad del asar.
- **Menú (S5).** Nunca se quitaba el menú por omisión, que trae recargar, forzar recarga y DevTools con sus aceleradores.

Las tres son la misma clase de decisión: qué política lleva la app empaquetada, independiente de lo que haga el renderer. Por eso van juntas.

La complicación está en los fuses. El servidor de TypeScript empaquetado se lanza con el propio binario de Electron y `ELECTRON_RUN_AS_NODE=1`, hablando LSP por stdio (ver [seguridad.md](../convenciones/seguridad.md#lspserverpaths-va-contra-la-misma-allow-list)). Apagar el fuse `runAsNode` apaga el LSP de TypeScript.

## Decisión

**La app empaquetada niega todo permiso de Chromium que no esté en una allow-list y no venga de su propio origen, graba los fuses de Electron con `runAsNode` como única excepción, y no lleva el menú por omisión.**

- **Permisos.** Allow-list: `clipboard-read` y `clipboard-sanitized-write`, sólo para el origen de la app. Los dispositivos (HID, USB, serial) se niegan siempre. Los tres handlers están en `apps/desktop/src/main/security/permissions.ts`.
- **Fuses**, en `apps/desktop/electron-builder.yml`: `runAsNode` encendido; `enableCookieEncryption`, `enableEmbeddedAsarIntegrityValidation` y `onlyLoadAppFromAsar` encendidos; `enableNodeOptionsEnvironmentVariable`, `enableNodeCliInspectArguments` y `grantFileProtocolExtraPrivileges` apagados.
- **Menú.** En producción, ninguno en Windows y Linux, y uno mínimo por roles en macOS (`appMenu`, `editMenu`, `windowMenu`). En desarrollo, el de Electron.

## Alternativas consideradas

Para la excepción de `runAsNode`, que es la parte discutible:

| Opción                                                      | Pros                                                        | Contras                                                                                                                                                                     | Por qué no                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Apagar `runAsNode` y lanzar el LSP con `utilityProcess`** | Cierra el fuse entero                                       | `utilityProcess` no da stdin. El LSP habla por stdio; habría que reescribir el transporte del cliente y el del servidor                                                     | El servidor no es nuestro: no se le puede cambiar el transporte    |
| **Empaquetar un Node aparte para el LSP**                   | Cierra el fuse, el LSP sigue por stdio                      | Decenas de MB más contra el techo de 120MB de RNF-05, y un segundo runtime que actualizar por seguridad                                                                     | Cambia un fuse por un binario más que mantener, con el mismo poder |
| **Usar el Node del sistema**                                | Cero MB                                                     | No todos tienen Node, y el que hay lo eligió el `PATH`: es exactamente lo que [seguridad.md](../convenciones/seguridad.md#el-ejecutable-nunca-se-resuelve-por-path) prohíbe | Viola la regla de no resolver ejecutables por `PATH`               |
| **`runAsNode` encendido, documentado** ✅                   | El LSP sigue andando; todos los demás fuses quedan grabados | Quien lance el `.exe` con `ELECTRON_RUN_AS_NODE=1` tiene un Node                                                                                                            | —                                                                  |

El costo de la elegida es acotado: lanzar el binario con esa variable requiere poder ejecutar programas en la máquina, y con eso ya se tiene un Node —o cualquier otro intérprete— sin pasar por PasteCode. Lo que `runAsNode` no abre es lo que sí cerraban los otros fuses: inyectar código **en la app que la persona ya está usando**, con sus archivos abiertos y su clave del asistente.

Para la allow-list de permisos se consideró dejarla vacía. Se descartó porque el _Pegar_ del menú contextual de Monaco lee con `navigator.clipboard.readText()`, y ningún E2E abre ese menú: que la suite pasara con la lista vacía no probaba que sobrara.

## Consecuencias

- ✅ Una página que llegue a correr en el renderer no puede encender la cámara, el micrófono ni la geolocalización. Se verifica desde el renderer en `e2e/tests/security.spec.ts`.
- ✅ `NODE_OPTIONS=--require=…` y `--inspect` dejan de servir contra la app instalada, y un asar modificado no carga.
- ✅ `Ctrl+Shift+I` y `Ctrl+R` dejan de ser aceleradores del menú en la app distribuida.
- ⚠️ `runAsNode` queda encendido y escrito como excepción en el YAML, en [seguridad.md](../convenciones/seguridad.md#fuses-de-electron) y en RNF-31. Se revisa el día que el LSP de TypeScript no dependa de stdio.
- ⚠️ `enableNodeOptionsEnvironmentVariable` apaga también `NODE_EXTRA_CA_CERTS`. Detrás de un proxy corporativo que reemplaza certificados, el CA tiene que estar en el almacén del sistema.
- ⚠️ Playwright se adjunta al main con `--inspect`, así que no puede lanzar el paquete distribuido. El E2E que corre contra el binario empaquetado usa `pnpm --filter @pastecode/desktop package:unfused`, que sale a `release-unfused/` con ese único fuse encendido y no se distribuye.
- ⚠️ Sin el menú se fue el zoom nativo. Volvió como los comandos `view.zoomIn`, `view.zoomOut` y `view.zoomReset`, que escriben `window.zoomLevel`.
- ❌ Ninguna extensión ni página puede pedir un permiso de Chromium fuera de la allow-list. Si algún día hace falta uno, entra a la lista con su motivo.
