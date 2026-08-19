import type { ExtensionManifest } from '@pastecode/extension-api';
import { z } from 'zod';

/** Los tres activation events del alcance de RF-908. */
const ActivationEventSchema = z.union([
  z.literal('onStartupFinished'),
  z.templateLiteral(['onCommand:', z.string().min(1)]),
  z.templateLiteral(['onLanguage:', z.string().min(1)]),
]);

/** Las capabilities declarables. Cualquier otra cosa invalida el manifest. */
const CapabilitySchema = z.enum(['statusBar', 'documentRead', 'documentWrite', 'network']);

const CommandContributionSchema = z.strictObject({
  command: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1).optional(),
});

const ThemeContributionSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  uiTheme: z.enum(['light', 'dark']),
  path: z.string().min(1),
});

const ConfigurationContributionSchema = z.strictObject({
  type: z.enum(['boolean', 'number', 'string']),
  default: z.union([z.boolean(), z.number(), z.string()]),
  description: z.string().optional(),
});

const ContributionsSchema = z.strictObject({
  commands: z.array(CommandContributionSchema).optional(),
  themes: z.array(ThemeContributionSchema).optional(),
  configuration: z.record(z.string(), ConfigurationContributionSchema).optional(),
});

/**
 * El mismo tipo, con los opcionales escritos como los escribe Zod.
 *
 * Con `exactOptionalPropertyTypes`, `main?: string` significa *ausente o
 * string*, y `z.infer` produce `main?: string | undefined`, que significa
 * *ausente, o undefined, o string*. No son el mismo tipo y ninguno es asignable
 * al otro, así que comparar los dos crudos daría un error que no dice nada
 * sobre si el schema y el contrato coinciden.
 *
 * El mapeo agrega `| undefined` **sólo** a las claves que ya eran opcionales
 * —`undefined extends T[K]` es verdadero justo para ésas—, así que un schema
 * que se olvidara de una clave obligatoria sigue fallando, que es lo que la
 * atadura tiene que atrapar. Es recursivo porque `contributes` también tiene
 * opcionales adentro, y una versión chata dejaría de mirar justo ahí.
 */
type ZodShaped<T> = T extends readonly (infer E)[]
  ? readonly ZodShaped<E>[]
  : T extends object
    ? { [K in keyof T]: undefined extends T[K] ? ZodShaped<T[K]> | undefined : ZodShaped<T[K]> }
    : T;

/**
 * El manifest de una extensión, validado.
 *
 * **No es `strictObject`.** El manifest de una extensión es su `package.json`,
 * así que trae `scripts`, `devDependencies` y todo lo que npm ponga ahí.
 * Rechazar las claves de más haría que ninguna extensión real cargara nunca;
 * lo que importa es que las claves que el IDE usa estén y sean lo que dicen
 * ser. Las contribuciones sí son estrictas: ahí una clave de más es un typo de
 * quien escribió la extensión, no ruido del ecosistema.
 *
 * El `satisfies` es la atadura que [ADR-0025](../../../docs/adr/0025-forma-de-la-api-de-extensiones.md)
 * prometió: el tipo público vive en `@pastecode/extension-api`, que no puede
 * depender de Zod, y este schema tiene que seguir produciéndolo. Si los dos se
 * separan, el error sale en `pnpm typecheck` y no en un manifest que no carga.
 */
export const ExtensionManifestSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  version: z.string().min(1),
  publisher: z.string().min(1),
  engines: z.object({ pastecode: z.string().min(1) }),
  main: z.string().min(1).optional(),
  activationEvents: z.array(ActivationEventSchema),
  capabilities: z.array(CapabilitySchema),
  contributes: ContributionsSchema.optional(),
}) satisfies z.ZodType<ZodShaped<ExtensionManifest>>;

/**
 * Un manifest que ya pasó por el schema.
 *
 * Es `ExtensionManifest` con los opcionales escritos como los escribe Zod: con
 * `exactOptionalPropertyTypes`, `main?: string` y `main?: string | undefined`
 * no son el mismo tipo. Para **leer** son indistinguibles, que es todo lo que
 * el host hace con un manifest; el tipo público sigue siendo el limpio, y el
 * `satisfies` de arriba es lo que garantiza que describan lo mismo.
 */
export type ValidatedManifest = z.infer<typeof ExtensionManifestSchema>;
