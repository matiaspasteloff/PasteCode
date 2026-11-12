/**
 * Une dos `latest*.yml` de electron-builder en uno, sumando la lista `files`.
 *
 *     node scripts/merge-update-info.mjs <principal.yml> <secundario.yml> <salida.yml>
 *
 * Existe por macOS: arm64 e Intel se construyen en runners distintos
 * (`package.yml`), y cada job escribe su propio `latest-mac.yml` con sólo sus
 * archivos. En el release hay lugar para uno. electron-updater elige el
 * archivo de su arquitectura dentro de `files` —los de arm64 llevan `arm64` en
 * el nombre—, así que el `latest-mac.yml` publicado tiene que listar los de
 * las dos.
 *
 * Del principal se conservan `version`, `path`, `sha512` y `releaseDate`; del
 * secundario sólo se toman las entradas de `files`. Falla si las versiones no
 * coinciden: dos jobs de versiones distintas en el mismo release es un error
 * de construcción, no algo que se arregle uniendo.
 *
 * No es un parser de YAML. Entiende el formato fijo que escribe
 * electron-builder —`version`, `files` con entradas `- url:` indentadas, y
 * después las claves sueltas— y falla si no lo encuentra. Una dependencia de
 * YAML para esto sería más código que el script.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Parte el archivo en lo de antes de `files:`, las entradas y lo de después. */
function split(text, path) {
  const start = text.indexOf('\nfiles:\n');
  const end = text.indexOf('\npath:', start);
  if (start === -1 || end === -1)
    throw new Error(`${path} no tiene el formato de electron-builder`);

  return {
    before: text.slice(0, start + '\nfiles:\n'.length),
    entries: text.slice(start + '\nfiles:\n'.length, end + 1),
    after: text.slice(end + 1),
  };
}

/** El valor de `version:` de la primera línea. */
function version(text, path) {
  const match = /^version: (.+)$/mu.exec(text);
  if (match === null) throw new Error(`${path} no declara version`);
  return match[1];
}

function main([primaryPath, secondaryPath, outputPath]) {
  if (primaryPath === undefined || secondaryPath === undefined || outputPath === undefined) {
    console.error(
      'Uso: node scripts/merge-update-info.mjs <principal.yml> <secundario.yml> <salida.yml>'
    );
    return 2;
  }

  const primary = readFileSync(primaryPath, 'utf8');
  const secondary = readFileSync(secondaryPath, 'utf8');
  if (version(primary, primaryPath) !== version(secondary, secondaryPath)) {
    console.error(`${primaryPath} y ${secondaryPath} son de versiones distintas`);
    return 1;
  }

  const head = split(primary, primaryPath);
  const extra = split(secondary, secondaryPath);
  writeFileSync(outputPath, `${head.before}${head.entries}${extra.entries}${head.after}`);
  console.log(`${outputPath}: ${primaryPath} + los archivos de ${secondaryPath}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
