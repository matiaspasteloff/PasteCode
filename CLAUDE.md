# CLAUDE.md — Reglas para agentes de IA

> Este archivo lo leen automáticamente Claude Code y herramientas similares.
> La documentación completa del proyecto está en [`PROJECT.md`](./PROJECT.md) y [`docs/`](./docs/).

## Contexto del proyecto

`PasteCode` es un IDE de escritorio construido con **Electron + TypeScript + React**, distribuido como `.exe`. Es un proyecto de portfolio con ambición de producto: el código, los tests, los ADRs y el CI son parte del entregable, no accesorios.

La arquitectura tiene **tres procesos**:

- **main** (Node, privilegiado) — filesystem, procesos hijo, settings, ventanas
- **renderer** (Chromium, sandboxeado) — toda la UI, sin acceso al SO
- **extension host** (Node, aislado) — extensiones de terceros

Leé [`docs/02-arquitectura.md`](./docs/02-arquitectura.md) antes de proponer cambios estructurales.

## Reglas duras

1. **Nunca desactivar la seguridad de Electron.** Si una solución requiere `nodeIntegration: true`, `contextIsolation: false` o `sandbox: false`, es la solución equivocada. Buscá otra.
2. **Nunca acceder al filesystem desde el renderer.** Toda operación privilegiada va por IPC hacia el main.
3. **Nunca usar `any`.** Usá `unknown` con narrowing, o definí el tipo.
4. **Nunca agregar una dependencia sin justificarla** en la respuesta: qué resuelve, cuánto pesa, cuándo fue su último release.
5. **Nunca romper la regla de dependencias:** `packages/core` no importa Electron, ni React, ni nada con I/O.
6. **Nunca escribir código sin su test** cuando toca lógica en `packages/core`.
7. **Nunca inventar APIs de Electron, Monaco, LSP o DAP.** Si no estás seguro de que un método existe, decilo explícitamente en lugar de asumir.

## Cómo trabajar en este repo

- Antes de escribir código, verificá si ya existe un servicio que haga algo similar. La duplicación es el problema, no la solución.
- Cambios chicos e incrementales. Si una tarea toca más de 5 archivos, proponé partirla primero.
- Cuando agregues un canal IPC, actualizá `packages/ipc-contract` **primero**. El contrato es la fuente de verdad.
- Cuando se pida una feature que está en la [lista de fuera de alcance](./docs/01-vision-y-alcance.md#alcance--fuera-out-of-scope), decílo antes de implementarla.
- Al proponer una decisión arquitectónica, escribí el ADR en el mismo cambio, usando [la plantilla](./docs/adr/TEMPLATE.md).
- Toda tarea se cierra contra el [Definition of Done](./docs/convenciones/definition-of-done.md).

## Estilo de respuesta esperado

- Señalá los problemas del enfoque propuesto **antes** de implementarlo, no después.
- Si hay una forma más simple, decilo aunque no sea lo que se pidió.
- No expliques código obvio. Explicá las decisiones no obvias.
- Si un requerimiento de la documentación entra en conflicto con lo que se pide en el chat, mencionalo explícitamente y preguntá cuál gana.

## Comandos del proyecto

```bash
pnpm dev              # Levanta la app en modo desarrollo con HMR
pnpm build            # Compila todos los paquetes
pnpm package          # Genera los instaladores
pnpm test             # Tests unitarios y de integración
pnpm test:e2e         # Tests E2E con Playwright
pnpm lint             # ESLint sobre todo el monorepo (incluye ciclos de import)
pnpm typecheck        # tsc --noEmit en todos los paquetes
pnpm check            # lint + typecheck + test — correr antes de todo commit
```

Los que usa el CI además de los de arriba:

```bash
pnpm format:check     # prettier --check
pnpm coverage         # tests con reporte de cobertura y umbrales
pnpm knip             # código y dependencias sin usar
```

`build`, `test`, `lint` y `typecheck` delegan en **Turborepo**, que resuelve el orden entre paquetes y cachea lo que no cambió. Correr el script de un paquete suelto funciona, pero salteás el grafo de dependencias: si tocaste `packages/core`, `turbo` sabe que hay que recompilarlo antes de `apps/desktop` y correr el script directo no.

## Referencias rápidas

| Necesito... | Está en |
|---|---|
| Saber en qué etapa está el proyecto y qué sigue | [`docs/00-guia-paso-a-paso.md`](./docs/00-guia-paso-a-paso.md) |
| Saber si una feature está en alcance | [`docs/01-vision-y-alcance.md`](./docs/01-vision-y-alcance.md) |
| Entender el modelo de procesos o el IPC | [`docs/02-arquitectura.md`](./docs/02-arquitectura.md) |
| Buscar un requerimiento por ID | [`docs/03-requerimientos-funcionales.md`](./docs/03-requerimientos-funcionales.md) |
| Ver un presupuesto de performance | [`docs/04-requerimientos-no-funcionales.md`](./docs/04-requerimientos-no-funcionales.md) |
| Ver un schema o contrato | [`docs/05-modelo-de-datos.md`](./docs/05-modelo-de-datos.md) |
| Reglas de estilo de código | [`docs/convenciones/codigo.md`](./docs/convenciones/codigo.md) |
| Formato de commits y branches | [`docs/convenciones/git.md`](./docs/convenciones/git.md) |
| Cómo y qué testear | [`docs/convenciones/testing.md`](./docs/convenciones/testing.md) |
| Reglas de seguridad de Electron | [`docs/convenciones/seguridad.md`](./docs/convenciones/seguridad.md) |
