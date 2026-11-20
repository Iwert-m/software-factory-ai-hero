# Packages

Every folder in `app/packages/` is a **deep module**: a lot of behaviour behind a small interface. [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) enforces the boundary (`.dependency-cruiser.cjs`).

```
app/packages/
  <name>/
    service.server.ts   ← an entry point (public). Import this from outside.
    config.ts           ← another entry point. A package may expose several.
    lib/                ← implementation: private. Files in it import each other freely.
    tests/              ← tests and fixtures: private.
```

`instructor-analytics/` is the working example. Copy its shape.

**Expose small entry points, not a barrel.** The public surface is every file at the package root. Add a root file for each thing outsiders need (`service.server.ts`, `config.ts`). Don't add an `index.ts` that re-exports a whole subtree. Name an entry point `*.server.ts` if it must never reach the client bundle.

## Rules

Run them with `npm run lint:boundaries`. Every rule is an error.

**Entry-point boundary.** Code outside a package, whether app code or another package, imports only that package's root files. It never imports anything in the package's subfolders.

**Intra-package freedom.** A package's own files import each other freely.

**Tests through the entry points.** Files in `<pkg>/tests/` import any package's root files and their own `tests/` fixtures. They never import package internals, not even their own package's `lib/`.

**No cycles.** No dependency cycles anywhere in `app/`.

**Database is injected** (`packages-get-db-injected`). No package may reach the app's shared connection `app/db/index.ts`, directly or through another module. Take the database as an argument so tests can pass in an in-memory one (`~/test/setup`). Importing `~/db/schema` is fine.
