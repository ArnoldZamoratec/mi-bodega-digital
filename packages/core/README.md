# @bodegon/core

Reglas de negocio de Bodegón Digital compartidas por la web (`web/`) y la app móvil (`mobile/`).
Antes vivían en `mobile/src/domain` (historial conservado con `git mv`; ver D-27 en
`mobile/DECISIONS.md`).

- TypeScript puro: **no** importa React, React Native, Firebase ni APIs del navegador.
- Se consume como código fuente (`main`/`types` → `src/index.ts`); cada app lo transpila con su
  bundler (Vite en la web, Metro en móvil). No hay paso de build.
- Móvil lo importa con las rutas de siempre (`@/domain/...`, alias a `packages/core/src`); la web
  usa `@bodegon/core`.

```bash
npm test -w @bodegon/core            # Jest (babel-jest)
npm run test:coverage -w @bodegon/core   # umbral ≥ 70 %
npm run typecheck -w @bodegon/core   # tsc --noEmit
```
