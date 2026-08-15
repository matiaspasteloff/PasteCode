# Documentación de PasteCode

Índice de la carpeta `docs/`. El punto de entrada general del proyecto es [`../PROJECT.md`](../PROJECT.md).

## Estructura

```
docs/
├── README.md                          ← estás acá
├── 00-guia-paso-a-paso.md             Orden de trabajo, etapa por etapa
├── 01-vision-y-alcance.md             Objetivos, usuarios, alcance, éxito
├── 02-arquitectura.md                 Procesos, monorepo, IPC
├── 03-requerimientos-funcionales.md   RF-001 a RF-911
├── 04-requerimientos-no-funcionales.md RNF-01 a RNF-29
├── 05-modelo-de-datos.md              Contratos y schemas
├── 06-roadmap-y-riesgos.md            Fases y riesgos
├── 07-glosario.md                     Terminología
├── adr/                               Architecture Decision Records
│   ├── README.md                      Índice de ADRs
│   ├── TEMPLATE.md                    Plantilla obligatoria
│   ├── 0001-electron-typescript.md
│   ├── 0002-monaco-editor.md
│   └── 0003-extension-host-aislado.md
└── convenciones/                      Cómo se trabaja en este repo
    ├── codigo.md
    ├── git.md
    ├── testing.md
    ├── seguridad.md
    ├── build-y-release.md
    └── definition-of-done.md
```

## Orden de lectura sugerido

**Si venís a evaluar el proyecto** (revisor técnico, reclutador):
1. [Visión y alcance](./01-vision-y-alcance.md) — qué es y por qué
2. [ADRs](./adr/) — las decisiones difíciles y su justificación
3. [Arquitectura](./02-arquitectura.md) — cómo está construido
4. [Requerimientos no funcionales](./04-requerimientos-no-funcionales.md) — los presupuestos medibles

**Si venís a escribir código:**
1. [Guía paso a paso](./00-guia-paso-a-paso.md) — qué hacer y en qué orden
2. [Arquitectura](./02-arquitectura.md) — el modelo de procesos y la regla de dependencias
3. [Reglas de código](./convenciones/codigo.md)
4. [Git](./convenciones/git.md) y [Testing](./convenciones/testing.md)
5. [Definition of Done](./convenciones/definition-of-done.md)

## Convenciones de estos documentos

- Los requerimientos llevan ID estable (`RF-###`, `RNF-##`). Los IDs no se reciclan: si un requerimiento se elimina, su ID queda retirado.
- Las prioridades usan MoSCoW: `M` Must / `S` Should / `C` Could / `W` Won't.
- Todo criterio de aceptación debe ser verificable. Si no se puede escribir un test o un procedimiento manual para comprobarlo, está mal redactado.
