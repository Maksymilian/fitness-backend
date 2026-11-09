// Architecture check: context, aggregate and layer boundaries (docs/architecture.md, section 11.1).
// Paths: apps/<service>/src/<context>/<module>/<layer>/...  Every rule is an error.
// Never weaken a rule to let an import through; change the design instead.

const MODULE = '^apps/([^/]+)/src/([^/]+)/([^/]+)/';
const ANY_DOMAIN = '^apps/[^/]+/src/[^/]+/[^/]+/domain/';
const ANY_VALUES = '^apps/[^/]+/src/[^/]+/[^/]+/domain/values/';

// Pure libraries the domain may use (generic subdomains), besides libs/ddd.
// decimal.js: Billing's Money, exact amounts without floats (ADR 2).
const PURE_LIBRARIES = ['date-fns', '@date-fns/utc', 'decimal.js'];

// The only domain-to-domain imports of another module's root: a factory method on one aggregate
// that creates another (architecture section 3). Each one needs the user's approval.
const FACTORIES = [
  {
    from: 'apps/workout-tracking/src/workout-tracking/equipment/',
    to: 'apps/workout-tracking/src/workout-tracking/workouts/domain/workout\\.ts$',
    why: 'equipment.recordWorkout() creates a Workout',
  },
];

const nodeModule = (name) => `(^|/)node_modules/${name.replace('/', '\\/').replace('.', '\\.')}/`;

const forbidden = [
  // Bounded contexts
  {
    name: 'no-import-from-another-service',
    comment: 'Each core or supporting context is its own service.',
    from: { path: '^apps/([^/]+)/' },
    to: { path: '^apps/', pathNot: '^apps/$1/' },
  },
  {
    name: 'context-sees-other-contexts-only-through-published-language',
    comment: 'Notifications sees only Training Progress\' published language. platform/ and the composition root may import every context.',
    from: { path: '^apps/([^/]+)/src/([^/]+)/', pathNot: '^apps/[^/]+/src/platform/' },
    to: {
      path: '^apps/$1/src/[^/]+/',
      pathNot: ['^apps/$1/src/$2/', '^apps/$1/src/platform/', '^apps/$1/src/[^/]+/published-language/'],
    },
  },
  {
    name: 'contracts-only-in-published-language-or-acl',
    comment: 'Contract classes never reach a domain model.',
    from: {
      pathNot: [
        '^libs/workout-tracking-contracts/',
        '^apps/workout-tracking/src/workout-tracking/published-language/',
        '^apps/training-progress/src/training-progress/workout-tracking-acl/',
        '^apps/[^/]+/test/',
      ],
    },
    to: { path: '^libs/workout-tracking-contracts/' },
  },
  {
    name: 'contracts-only-in-published-language-or-acl',
    comment: "Billing's contract classes never reach a domain model.",
    from: {
      pathNot: [
        '^libs/billing-contracts/',
        '^apps/billing/src/billing/published-language/',
        '^apps/billing/src/platform/outbox/routes\\.ts$',
        '^apps/training-progress/src/training-progress/billing-acl/',
        '^apps/[^/]+/test/',
      ],
    },
    to: { path: '^libs/billing-contracts/' },
  },
  {
    name: 'libs-only-through-their-entry-point',
    comment: 'Import @app/<lib>, never a deep path.',
    from: { path: '^apps/' },
    to: { path: '^libs/[^/]+/src/', pathNot: '^libs/[^/]+/src/index\\.ts$' },
  },
  {
    name: 'libs-import-no-app-and-no-other-lib',
    comment: 'No domain classes in libs/.',
    from: { path: '^libs/([^/]+)/' },
    to: { path: '^(apps/|libs/)', pathNot: '^libs/$1/' },
  },

  // Layers
  {
    name: 'domain-depends-only-on-domain-libs-ddd-and-pure-libraries',
    comment: 'The domain is framework-free: no NestJS, Drizzle, outbox, contracts or outer layers.',
    from: { path: ANY_DOMAIN },
    to: { pathNot: [ANY_DOMAIN, '^libs/ddd/', ...PURE_LIBRARIES.map(nodeModule)] },
  },
  {
    name: 'application-imports-no-infrastructure-or-interface',
    from: { path: `${MODULE}application/` },
    to: { path: '^apps/[^/]+/src/[^/]+/[^/]+/(infrastructure|interface)/' },
  },
  {
    name: 'infrastructure-imports-no-interface',
    from: { path: `${MODULE}infrastructure/` },
    to: { path: '^apps/[^/]+/src/[^/]+/[^/]+/interface/' },
  },

  // Aggregates
  {
    name: 'domain-sees-other-modules-only-through-values',
    comment: 'Strict aggregate isolation: ids and value objects live in domain/values/.',
    from: { path: `${MODULE}domain/`, pathNot: FACTORIES.map((f) => `^${f.from}`) },
    to: {
      path: '^apps/$1/src/$2/[^/]+/domain/',
      pathNot: ['^apps/$1/src/$2/$3/', ANY_VALUES],
    },
  },
  ...FACTORIES.map((f) => ({
    name: 'domain-sees-other-modules-only-through-values',
    comment: `Declared factory: ${f.why}`,
    from: { path: `^${f.from}domain/` },
    to: { path: ANY_DOMAIN, pathNot: [`^${f.from}`, ANY_VALUES, `^${f.to}`] },
  })),
  {
    name: 'values-import-only-values-and-errors',
    comment: 'A value object cannot leak an aggregate root to the modules that import it.',
    from: { path: ANY_VALUES },
    to: { path: '^apps/', pathNot: '^apps/[^/]+/src/[^/]+/[^/]+/domain/(values|errors)/' },
  },

  { name: 'no-circular', from: {}, to: { circular: true } },
  { name: 'not-to-unresolvable', from: {}, to: { couldNotResolve: true } },
].map((rule) => ({ severity: 'error', ...rule }));

module.exports = {
  forbidden,
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules|\\.node_modules-root)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'] },
  },
};
