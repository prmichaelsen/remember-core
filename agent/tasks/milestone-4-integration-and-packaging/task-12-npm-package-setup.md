# Task 12: NPM Package Setup

**Milestone**: [M4 - Integration & Packaging](../../milestones/milestone-4-integration-and-packaging.md)
**Estimated Time**: 3-4 hours
**Dependencies**: All M1-M3 tasks
**Status**: Not Started

---

## Objective
Configure remember-core as a publishable NPM package (@prmichaelsen/remember-core) with proper build pipeline, TypeScript declarations, and exports map.

---

## Context
Scaffolded configuration already exists from the core-sdk package setup (config/package.json.template, config/tsconfig.json, config/esbuild.build.js). These need to be finalized and validated to produce a clean, publishable package that both remember-mcp and remember-rest-server can consume as a dependency.

---

## Steps

### 1. Create package.json
Define the final package.json with:
- `name`: `@prmichaelsen/remember-core`
- `version`: `0.1.0`
- `main`: `dist/index.js`
- `types`: `dist/index.d.ts`
- `exports` map for root and subpath imports
- `dependencies`: `weaviate-client`, `@prmichaelsen/firebase-admin-sdk-v8`, `dotenv`
- `devDependencies`: `typescript`, `jest`, `ts-jest`, `esbuild`

### 2. Finalize tsconfig.json
Configure TypeScript compilation with:
- `strict: true`
- `declaration: true`
- `outDir: dist/`
- Appropriate `include`/`exclude` patterns to avoid compiling tests or agent files

### 3. Configure esbuild
Finalize the esbuild build script for producing optimized bundles. Ensure external dependencies (weaviate-client, firebase-admin-sdk-v8) are not bundled.

### 4. Add npm Scripts
Add the following scripts to package.json:
- `build` — compile TypeScript and/or run esbuild
- `test` — run unit tests via Jest
- `lint` — run linter
- `typecheck` — run `tsc --noEmit`
- `clean` — remove dist/ directory
- `prepublishOnly` — run clean, build, and typecheck before publish

### 5. Create .npmignore
Exclude non-essential files from the published package:
- `src/` (source TypeScript files)
- `tests/`
- `agent/`
- `config/`
- `*.config.js`
- `.github/`

### 6. Test npm pack
Run `npm pack` and inspect the resulting tarball to verify:
- dist/ directory with .js and .d.ts files is included
- Source files, tests, and agent directory are excluded
- Package size is reasonable

### 7. Verify Install
Install the packed tarball in a scratch project and confirm that imports resolve correctly and TypeScript types are available.

---

## Verification
- [ ] `npm run build` succeeds without errors
- [ ] `npm pack` produces a clean package tarball
- [ ] Package includes `dist/` with `.js` and `.d.ts` files
- [ ] Package excludes source files, tests, and agent directory
- [ ] Imports resolve correctly when installed as a dependency

---

## Expected Output

**Key Files Created**:
- `package.json`: Final publishable package configuration
- `tsconfig.json`: Finalized TypeScript configuration with declarations
- `.npmignore`: File exclusion rules for published package

---

## Notes
- The exports map in package.json will be expanded in Task 13 when subpath exports are designed
- Version starts at 0.1.0 to indicate pre-stable API
- Consider adding `files` field in package.json as an alternative or complement to .npmignore
- Ensure peer dependency strategy is documented if any deps should be peer deps

---

**Next Task**: [Task 13: Public API Design and Barrel Exports](task-13-public-api-exports.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
