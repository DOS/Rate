// typescript-eslint (and ts-api-utils) need the TypeScript 6 JS API. TypeScript 7
// ships no such API, and @typescript-eslint/eslint-plugin throws "typescript-eslint
// does not support TS 7.0" on load. These packages take `typescript` as a peer
// dependency, which pnpm satisfies from the workspace packages (typescript@^7), and
// neither pnpm.overrides nor packageExtensions can change a peer the parent already
// provides. So, for these packages only, turn that peer into a regular dependency
// pinned to TypeScript 6. `tsc` everywhere else keeps using TypeScript 7.
// Remove this hook once typescript-eslint supports TypeScript 7
// (https://github.com/typescript-eslint/typescript-eslint/issues/10940).
// Any edit to this file changes `pnpmfileChecksum` in pnpm-lock.yaml: run
// `pnpm install` and commit the lockfile, or CI's --frozen-lockfile install fails.
const TYPESCRIPT_6 = '6.0.3';

const needsTypeScript6 = (name) =>
  name.startsWith('@typescript-eslint/') ||
  name === 'typescript-eslint' ||
  name === 'ts-api-utils';

function readPackage(pkg) {
  if (needsTypeScript6(pkg.name) && pkg.peerDependencies?.typescript) {
    delete pkg.peerDependencies.typescript;
    if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: TYPESCRIPT_6 };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
