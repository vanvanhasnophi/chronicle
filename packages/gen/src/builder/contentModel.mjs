/**
 * Chronicle Gen — Content Model Preflight
 *
 * Reads `<dataDir>/site.yml` and checks its `contentModel` marker against the
 * model this build supports. Runs before the Astro build so an incompatible
 * data directory fails with one readable message instead of a render error
 * deep inside the stack.
 *
 * The rules live in packages/shared/src/contentModel.ts — the same function
 * the template's data adapter calls, so `npm run build` and a bare
 * `astro build` agree.
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import {
  checkContentModel,
  formatContentModelIssue,
} from '../../../shared/src/contentModel.ts'

/** Site config file inside a data directory. */
const SITE_FILE = 'site.yml'

/**
 * Read `<dataDir>/site.yml` as a plain object.
 *
 * @param {string} dataDir
 * @returns {{ site: Record<string, unknown> | null, filePath: string, siteFound: boolean }}
 */
export function readSiteConfig(dataDir) {
  const filePath = path.resolve(dataDir, SITE_FILE)
  const siteFound = fs.existsSync(filePath)
  if (!siteFound) return { site: null, filePath, siteFound }

  try {
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf-8'))
    const site =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : null
    return { site, filePath, siteFound }
  } catch {
    // Malformed YAML is reported by the build itself; a missing marker is
    // handled the same way as an unreadable file (notice, not a hard stop).
    return { site: null, filePath, siteFound }
  }
}

/**
 * Check a data directory's content model.
 *
 * @param {string} dataDir
 * @returns {import('../../../shared/src/contentModel.ts').ContentModelCheck & { filePath: string }}
 */
export function checkDataDirContentModel(dataDir) {
  const { site, filePath, siteFound } = readSiteConfig(dataDir)
  const check = checkContentModel(site, { siteFound })
  return { ...check, filePath }
}

/**
 * Enforce the content model at build time.
 *
 * - compatible           → returns the check
 * - missing marker       → prints a notice and continues (legacy sites)
 * - newer / malformed    → throws before Astro runs
 *
 * @param {string} dataDir
 */
export function assertContentModel(dataDir) {
  const check = checkDataDirContentModel(dataDir)
  if (check.level === 'ok') return check

  const message = formatContentModelIssue(check, check.filePath)
  if (check.level === 'error') throw new Error(message)
  console.warn(message)
  return check
}
