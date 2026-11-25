import fs from 'node:fs';
import path from 'node:path';

/**
 * Chronicle — data directory resolution.
 *
 * `data/` is the single content root (see docs/content-model.md). The build
 * may run from the monorepo root (generator sets CHRONICLE_DATA_DIR), from
 * `packages/template-astro/` (bare `astro dev` / `astro build`), or from a
 * standalone checkout — all three must resolve to the same directory.
 */
export function resolveDataDir(): string {
  if (process.env.CHRONICLE_DATA_DIR) {
    return path.resolve(process.env.CHRONICLE_DATA_DIR);
  }
  // Monorepo: CWD is packages/template-astro/ during build
  const repoRoot = path.resolve(process.cwd(), '..', '..');
  const monorepoData = path.join(repoRoot, 'data');
  if (fs.existsSync(monorepoData)) return monorepoData;
  // Standalone lite checkout: CWD/data/
  const cwd = path.resolve(process.cwd(), 'data');
  if (fs.existsSync(cwd)) return cwd;
  // Direct env or fallback
  return path.resolve(process.cwd(), '..', '..', 'data');
}
