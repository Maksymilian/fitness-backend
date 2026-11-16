---
name: google-typescript-style
description: Write and change TypeScript in this project in the style of the Google TypeScript Style Guide (https://google.github.io/styleguide/tsguide.html), adapted to this NestJS monorepo. Use before writing, changing or reviewing any .ts file.
---

# Google TypeScript style for this project

Source: the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html). The rules below are its rules in this project's words; anchors point to the guide. *Must* is a rule; *prefer* or *avoid* is a strong default that needs a reason to break.

## Precedence

1. `CLAUDE.md` and the architecture docs (`docs/architecture.md`, `docs/ubiquitous-language.md`) win over this skill.
2. NestJS and its CLI win where the guide assumes another framework (see "Project exceptions").
3. Then this skill. For anything it doesn't settle, follow the same file, then the same directory (#consistency).

## Formatting

The guide sets no formatter or line length. Here **Prettier** formats every `.ts` file (`.prettierrc`: single quotes, trailing commas, `printWidth` 160). A Claude Code hook runs it after each Write or Edit of a `.ts` file; `pnpm format` formats everything. Don't hand-format against it. Prettier doesn't fix the rules below.

## Source files and modules

- UTF-8; only ASCII space as whitespace; named escapes (`\n`), no octal escapes.
- Order: optional `@fileoverview` JSDoc, imports, implementation, one blank line between them.
- **Named exports only, never `export default`** (#exports). No `export let` (#mutable-exports). Export only what other modules use.
- No classes made only of static members (#container-classes): export functions and constants.
- Imports: named (`import { X }`) by default, namespace (`import * as x`) for large APIs with common names. Relative paths inside an app or library; `@app/<lib>` across libraries (CLAUDE.md), never a deep path.
- `import type` for symbols used only as types; `export type { X } from` when re-exporting a type.
- No `namespace`, `module Foo {}`, `require`, `/// <reference>`, no `import()` in type positions.

## Variables and literals

- `const` by default, `let` only when reassigned, never `var`; one variable per declaration.
- No `Array()` / `new Array()`: use `[]` or `Array.from({ length: n }, () => value)`. No `new Object()`.
- Single quotes; template literals over complex concatenation; no `\` line continuations.
- Numbers: `Number(x)` and check for `NaN`; no unary `+`, no `parseFloat`; `parseInt` only for a non-decimal radix.
- `===` / `!==` (only `== null` may cover null and undefined). No `!!` inside `if`/`while` conditions.

## Classes

- **No `#private` fields: use `private`** (#no-private-fields). A field beside an accessor or method of the same name gets a whole-word suffix or prefix: `private pricesLoading` next to `prices()`, `private wrappedBar` next to `get bar()`.
- `readonly` on every property never reassigned after the constructor.
- Prefer parameter properties (`constructor(private readonly x: X) {}`) over a field plus assignment; initialise other fields where declared, not from parameter properties.
- No `public` modifier (only on a non-readonly public parameter property). Keep visibility as small as possible; prefer a module-local function to a private static method.
- No `this` in static methods; call statics on their own class.
- No semicolons after class declarations or between methods; one blank line between members.
- Accessors: getters are pure; no pass-through accessor pairs (make the field public or `readonly`); never `Object.defineProperty`.
- No arrow-function class properties, except an event handler that must be removed later (#event-handlers).
- `new Foo()` always with parentheses; drop empty constructors unless they carry parameter properties, decorators or visibility.

## Functions

- **Named functions are `function` declarations**, not `const f = () => …` (#prefer-function-declarations-for-named-functions), unless the `const` needs a type annotation (a provider, a typed handler).
- No function expressions (`function () {}`); use arrows. Exception: a wrapper that must forward a dynamic `this` (a method decorator).
- A concise arrow body only when its value is used; otherwise a block body (`() => { void doIt(); }` or `() => { doIt(); }`).
- Pass arrows that forward explicitly (`.map((x) => toId(x))`) rather than a named function reference whose extra parameters could receive indices.
- No `this` outside classes; no `bind`, no `const self = this`.
- Rest parameters, not `arguments`; spread, not `apply`. Defaults without side effects.
- No blank line at the start or end of a body. Keep functions short (split past ~40 lines when it helps).

## Control flow and errors

- Braces on every `if`/`for`/`while` body, except a whole `if` on one line.
- Every `switch` has a `default` (last); no fall-through from a non-empty case.
- Prefer `for…of`; `for…in` only on dict-style objects, filtered; never on arrays.
- Throw only `Error`s (`new Error(…)`, or a domain error class); reject promises with `Error`s. Catch as `unknown` and narrow; assume it is an `Error`.
- An empty `catch` or `.catch(() => undefined)` needs a comment saying why ignoring is right. Keep `try` blocks to what can throw.

## Types

- **Never `any`** (CLAUDE.md is stricter than the guide: no suppression either). Use a precise type or `unknown` and narrow.
- **`interface` for object types**; `type` for unions, primitives, tuples, mapped and function types.
- Arrays: `T[]` / `readonly T[]` for simple element types (names, dots); `Array<T>` / `ReadonlyArray<T>` for anything else (`Array<{ id: string }>`, `Array<string | number>`).
- Don't annotate what is trivially inferred (`const count = 0`, `= new Set<string>()`); do annotate exports that need it. Decorated class properties (DTOs, GraphQL args, `Environment`) keep their type even with a default (`limit: number = 20`): `class-transformer`, `class-validator` and `@nestjs/graphql` read it from the decorator metadata.
- Type aliases never include `| null` or `| undefined`; add them at the use site. Label index-signature keys (`[memberId: string]`); prefer `Map`.
- **Assertions**: `as` syntax only. Avoid `as` and `!`; prefer a runtime check. When one stays, add a comment saying why it is safe; a double assertion goes through `unknown` (`x as unknown as T`) with that comment. Type an object literal with an annotation (`const x: Foo = { … }`), not `{ … } as Foo`. In test doubles a partial mock cast is obvious and needs no comment.
- No `String`/`Number`/`Boolean`/`Object` as types; no `{}` type; no `const enum`; no `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`.
- Avoid generics that appear only in the return type; when calling one, pass the type argument explicitly.

## Naming

- `UpperCamelCase` for classes, interfaces, types, enums, decorators, type parameters; `lowerCamelCase` for variables, functions, methods, properties; `CONSTANT_CASE` only for module-level constants and enum values.
- Acronyms are words: `memberId`, `loadHttpUrl`, `RabbitMqHealthIndicator` (platform names such as `toISOString` stay as they are).
- No `I` prefix, no leading or trailing underscores (a leading `_` only for a required but unused parameter; omit trailing unused ones), no Hungarian notation, no unclear abbreviations (familiar ones such as `id`, `tx`, `db`, `url` are fine).
- Names come from `docs/ubiquitous-language.md` (CLAUDE.md).

## Comments and JSDoc

- `/** … */` for documentation, `//` for implementation notes; multi-line notes are several `//` lines, never `/* */` blocks.
- **Every top-level export has a JSDoc** that says what it is for, in the ubiquitous language, without restating its name. Exempt: Nest `@Module` classes (exported only for the framework, like `@NgModule`).
- Document non-obvious properties and methods; a method description starts with a third-person verb ("Returns…", "Records…").
- Parameter properties are documented with `@param` on the constructor. No types in JSDoc (`@param {string}`), no `@private`/`@override`/`@implements`.
- JSDoc goes **before** decorators. Decorators sit directly above the declaration, no blank line.
- `@deprecated` says what to use instead.

## Project exceptions (where the guide yields)

- **Decorators**: the guide allows only framework decorators. NestJS custom decorators generated with `nest generate decorator` (CLAUDE.md), and `@OnTracedOutboxMessage()`, are framework decorators here.
- **Mixins**: the guide forbids them; `TracedTransport()` (`libs/telemetry`) is required by CLAUDE.md for broker transports. Don't add other mixins.
- **File names**: kebab-case with Nest suffixes (`*.controller.ts`, `*.module.ts`), as the Nest CLI generates them.
- **Default exports**: only where a tool requires one: k6 scripts in `load-tests/` (the VU function) and tool config files (`rspack.config.js`, `vitest.config*.ts`).
- **`@app/<lib>` imports** across libraries (CLAUDE.md), relative within one.

## Checklist before finishing a TypeScript change

1. No `any`, `#private`, `export default` (outside the exceptions), `var`, `Array()`, function expressions, `@ts-` comments.
2. Object types are interfaces; arrays follow the `T[]` / `Array<T>` rule; no trivially inferred annotations.
3. Every `as` and `!` has a reason (a runtime check or a comment).
4. New or changed exports have JSDoc in the ubiquitous language.
5. `pnpm lint` passes; Prettier has formatted the file (the hook, or `pnpm format`).
