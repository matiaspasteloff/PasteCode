# Changelog

Todos los cambios que le importan a quien usa PasteCode. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones,
[Semantic Versioning](https://semver.org/lang/es/). Cómo se publica una versión
está en [build-y-release.md](./docs/convenciones/build-y-release.md#proceso-de-release).

## Sin publicar

### Agregado

- Instaladores para todas las plataformas: Windows x64 (un click y portable) y
  arm64, macOS Apple Silicon e Intel (`.dmg`), y Linux (AppImage y `.deb`).
- Ícono propio de la app y de los instaladores.
- Releases con `SHA256SUMS.txt` y attestation de procedencia, verificable con
  `gh attestation verify`.
- Actualizaciones con consentimiento: la app avisa cuando hay una versión nueva
  y nunca descarga ni instala sin que lo pidas. Se instalan desde la app en
  Windows x64 y en el AppImage; en el resto se abre la página del release.
  Settings nuevas `update.checkOnStartup` y `update.channel`, sólo de usuario.
- La app arranca y se usa en macOS y Linux: botones de ventana dibujados sin
  fuentes de Windows, el semáforo nativo de macOS y `Cmd` como tecla de los
  atajos (`⌘S`, `⇧⌘P`).
- Zoom de la interfaz (`Ctrl+=`, `Ctrl+-`, `Ctrl+0`), que se guarda en
  `window.zoomLevel`.
- Política de seguridad: `SECURITY.md` con el canal privado para reportar
  vulnerabilidades.

### Cambiado

- El instalador de Windows es de un click, per-user y sin pedir permisos de
  administrador, en vez del asistente.
- El menú de la app empaquetada ya no ofrece recargar ni abrir las DevTools.
- Sólo puede correr una instancia de PasteCode a la vez; abrir otra trae al
  frente la que ya está abierta.
- Sin `terminal.shell`, la terminal usa `$SHELL` sólo si es una ruta absoluta
  que existe, y si no `/bin/sh`.

### Corregido

- El instalador no traía las extensiones de ejemplo (`theme-nord` y
  `word-count`).

### Seguridad

- La app empaquetada graba los fuses de Electron: ignora `NODE_OPTIONS` y
  `--inspect`, y valida la integridad del asar.
- Los permisos del navegador (cámara, micrófono, geolocalización,
  notificaciones) se niegan por omisión.
- Ninguna ventana navega ni abre ventanas fuera de la app; los enlaces externos
  van al navegador del sistema, y sólo si son `https:`.
- La CSP suma `form-action 'none'` y `frame-ancestors 'none'`.
- Dependencias actualizadas para cerrar los avisos altos y críticos de
  `pnpm audit`.

## 0.3.1

Versión anterior a este changelog, sin tag ni release publicado. Su historia
está en el historial de commits y en
[la guía paso a paso](./docs/00-guia-paso-a-paso.md).
