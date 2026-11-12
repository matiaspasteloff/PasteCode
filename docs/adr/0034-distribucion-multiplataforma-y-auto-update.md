# ADR-0034: Distribuir en las tres plataformas con runners nativos y actualizar sólo con consentimiento

## Estado

`Aceptado`

**Fecha:** 2026-11-12

## Contexto

Hasta la etapa 2 del plan de mejora, PasteCode tenía un solo destino de distribución —NSIS para Windows x64, con asistente—, salía sin ícono y sin las extensiones de ejemplo, no había workflow de release ni forma de actualizar, y los binarios no tenían ni firma ni procedencia verificable (hallazgos S7 y D1 a D6 de la [auditoría de noviembre de 2026](../informes/2026-11-auditoria.md)). El autor decidió distribuir para todas las plataformas: Windows x64 y arm64, macOS y Linux, con auto-update.

Las fuerzas en juego:

- **Los binarios nativos.** node-pty y ripgrep llegan como paquetes precompilados por plataforma y arquitectura (`optionalDependencies`), y pnpm instala sólo los de la máquina en la que corre. Construir un instalador para otra arquitectura arrastra, sin avisar, los binarios equivocados.
- **No hay certificado de firma.** Ni Authenticode en Windows ni Developer ID en macOS. Squirrel.Mac —el mecanismo de actualización de macOS— exige una app firmada con certificado, y Apple Silicon no ejecuta código nativo sin al menos una firma ad-hoc.
- **En un release de GitHub hay lugar para un `latest*.yml` por sistema**, y electron-updater elige el archivo de su arquitectura dentro de ese único archivo.
- **La regla del proyecto: nada se descarga ni se instala sin que la persona lo pida.** electron-updater, por omisión, hace las dos cosas solo.

## Decisión

Construir cada instalador en un runner nativo de su arquitectura, con un workflow reutilizable que corre igual en cada PR y en cada tag; publicar releases en borrador con checksums y attestation de procedencia en lugar de firma; y usar electron-updater con la descarga y la instalación automáticas apagadas, ofreciendo instalar desde la app sólo donde se puede (Windows x64 con NSIS y AppImage) y abrir la página del release en el resto.

## Alternativas consideradas

| Opción                                                   | Pros                                                                      | Contras                                                                                                                                                                  | Por qué no                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Compilación cruzada** desde un solo runner por sistema | Menos jobs y menos minutos de macOS                                       | Hay que forzar a pnpm a instalar los binarios de otra arquitectura (`supportedArchitectures`) y verificar que no se mezclen; un error no se ve hasta que alguien instala | Los runners arm64 de Windows y los Intel de macOS existen y son gratuitos para un repositorio público              |
| **Un `.dmg` universal** (arm64 + x64 en un binario)      | Un solo archivo para macOS                                                | Pesa casi el doble, y fusionar los `.node` de node-pty exige los dos juegos de binarios en la misma máquina: vuelve la compilación cruzada                               | Dos `.dmg` cuestan un archivo más en el release y nada más                                                         |
| **NSIS con asistente**                                   | La persona elige el directorio                                            | Cinco pantallas sin ninguna decisión que valga la pena, encima de la advertencia de SmartScreen                                                                          | Un click, per-user y sin elevación es lo que `build-y-release.md` pide y lo que electron-updater actualiza sin UAC |
| **Auto-update en todas las plataformas**                 | Paridad                                                                   | macOS sin certificado no instala (Squirrel.Mac), Windows arm64 no tiene su `latest.yml` en el release, el portable no tiene instalación y el `.deb` pide `sudo`          | En esos casos la app avisa y abre la página del release, que es honesto y funciona                                 |
| **Comprar un certificado**                               | SmartScreen y Gatekeeper sin advertencias; auto-update en macOS           | USD 200–600 al año para un proyecto de portfolio                                                                                                                         | Es decisión del autor, y queda abierta                                                                             |
| **Elegida** ✅                                           | Sin compilación cruzada, sin costo, verificable, sin descargas no pedidas | Advertencias de SmartScreen y Gatekeeper; tres variantes sólo avisan                                                                                                     | —                                                                                                                  |

### Por qué attestation y no firma

La attestation de procedencia (`actions/attest-build-provenance`) firma con el OIDC del workflow y Sigstore una declaración de que cada archivo salió de **ese** workflow, en **ese** repositorio y en **ese** commit, y se verifica con `gh attestation verify`. No le quita la advertencia a SmartScreen ni a Gatekeeper —eso sólo lo hace un certificado—, pero le da a quien desconfíe una forma de comprobar que el `.exe` que bajó es el que construyó el CI público, sin costo: el repositorio es público. `SHA256SUMS.txt` cubre la integridad de la descarga.

### Por qué macOS y Windows arm64 sólo avisan

- **macOS:** Squirrel.Mac valida la firma de la versión nueva contra la de la instalada, y con firma ad-hoc no hay identidad que comparar. Instalar desde la app fallaría en el último paso.
- **Windows arm64:** el release publica el `latest.yml` de x64. Si el de arm64 lo pisara, los x64 se actualizarían a un binario arm64. electron-updater no tiene una convención estable para dos `latest.yml` de NSIS en el mismo release, así que arm64 lee el de x64 para saber **que** hay una versión nueva, y ofrece la página del release.

## Consecuencias

- ✅ `verify-package.mjs` lee la cabecera de cada binario del paquete y falla si alguno es de otra arquitectura: el error de la compilación cruzada no puede colarse.
- ✅ `package.yml` corre en cada PR, así que el release usa exactamente lo que ya pasó el CI.
- ✅ Ningún camino de código descarga ni instala sin una acción explícita: `autoDownload` y `autoInstallOnAppQuit` apagados, y dos canales de IPC que sólo llaman dos comandos.
- ✅ electron-updater se carga con un `import()` diferido, en el primer chequeo, diez segundos después de mostrar la ventana: no pesa en el arranque (RNF-01) ni en la memoria del main si nadie busca nada.
- ⚠️ Cinco runners por PR, dos de ellos de macOS. Cada corrida tarda minutos.
- ⚠️ SmartScreen y Gatekeeper siguen avisando; el README explica cómo abrir la app igual.
- ⚠️ `release.yml` no se ejecutó nunca antes del primer tag real: la parte verificable en un PR es `package.yml`.
- ❌ Sin certificado no hay auto-update en macOS. Comprarlo reabre esta decisión.
