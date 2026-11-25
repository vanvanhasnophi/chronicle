/**
 * Chronicle — pages content loader
 *
 * Exposes `data/pages/` as the Astro `pages` collection: the about page
 * (`about`) and legal pages (`/legal/<id>/`). Same two shapes as posts:
 *
 *   data/pages/<id>/index.md   folder shape (attachments allowed)
 *   data/pages/<id>.md         flat shape
 *
 * Pre-4.0 sites keep their about content in `data/__about__/index.md`. When
 * `data/pages/about` does not exist yet, that file is exposed as the `about`
 * page so upgrading does not blank the page; `npm run migrate:v4` moves it.
 *
 * Ids, kind and status rules live in packages/shared/src/pages.ts so the
 * renderer resolves the same data the same way.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Loader } from 'astro/loaders'
import { classifyPostEntry, hasFrontmatter } from '@chronicle/shared/src/posts'
import { buildPageMeta } from '@chronicle/shared/src/pages'
import type { PageKind } from '@chronicle/shared/src/pages'
import { resolveDataDir } from '../dataDir'
import { parsePostFile } from './postsLoader'

export interface PageSource {
  id: string
  shape: 'folder' | 'flat'
  filePath: string
  /** Served from `data/__about__/index.md` until the v4 migration runs. */
  legacy?: boolean
}

/** Path of the pre-4.0 about page, if it exists. */
export function legacyAboutPath(dataDir: string): string {
  return path.join(dataDir, '__about__', 'index.md')
}

/**
 * List the page files: `data/pages/` entries plus the legacy about fallback.
 *
 * A pages/about file wins over `__about__`; the loader warns when both exist.
 */
export function discoverPageSources(dataDir: string): PageSource[] {
  const pagesDir = path.join(dataDir, 'pages')
  const sources: PageSource[] = []
  const seen = new Map<string, string>()

  if (fs.existsSync(pagesDir)) {
    for (const entry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
      const ref = classifyPostEntry(entry.name, entry.isDirectory())
      if (!ref) continue
      const filePath = ref.shape === 'folder'
        ? path.join(pagesDir, ref.id, ref.filename)
        : path.join(pagesDir, ref.filename)
      if (!fs.existsSync(filePath)) continue
      if (ref.shape === 'flat' && !hasFrontmatter(fs.readFileSync(filePath, 'utf-8'))) continue

      const duplicate = seen.get(ref.id)
      if (duplicate) {
        throw new Error(
          `[chronicle] duplicate page id "${ref.id}": ${duplicate} and ${filePath}. ` +
          'A page is either a folder (index.md) or a flat file, not both.',
        )
      }
      seen.set(ref.id, filePath)
      sources.push({ id: ref.id, shape: ref.shape, filePath })
    }
  }

  const legacy = legacyAboutPath(dataDir)
  if (!seen.has('about') && fs.existsSync(legacy)) {
    sources.push({ id: 'about', shape: 'folder', filePath: legacy, legacy: true })
  }

  return sources.sort((a, b) => a.id.localeCompare(b.id))
}

/** Loader for the `pages` collection. */
export function chroniclePages(): Loader {
  return {
    name: 'chronicle-pages',
    load: async ({ store, parseData, generateDigest, logger, watcher }) => {
      const dataDir = resolveDataDir()
      store.clear()

      const sources = discoverPageSources(dataDir)
      const legacy = legacyAboutPath(dataDir)
      if (sources.some((source) => source.id === 'about' && !source.legacy) && fs.existsSync(legacy)) {
        logger.warn(
          'both data/pages/about and data/__about__ exist; using data/pages/about. ' +
          'Run `npm run migrate:v4` to move the legacy content.',
        )
      }

      let loaded = 0
      for (const source of sources) {
        const raw = fs.readFileSync(source.filePath, 'utf-8')
        const { data, body } = parsePostFile(raw, source.filePath)

        let meta
        try {
          meta = buildPageMeta(source.id, data)
        } catch (error) {
          throw new Error(`${(error as Error).message} (${source.filePath})`)
        }

        // Zod validates the raw frontmatter types; the normalised meta wins on
        // the fields it owns (kind/status/title/dates).
        const validated = await parseData({
          id: source.id,
          data: { ...data, ...meta },
          filePath: source.filePath,
        })
        const entry = { ...validated, ...meta }
        store.set({
          id: source.id,
          data: entry,
          body,
          filePath: source.filePath,
          digest: generateDigest({ ...entry, body }),
        })
        loaded += 1
      }

      if (fs.existsSync(path.join(dataDir, 'pages'))) {
        watcher?.add(path.join(dataDir, 'pages'))
      }
      logger.info(`${loaded} page(s) loaded from ${dataDir}`)
    },
  }
}

/** Re-exported for callers that need the page kind type. */
export type { PageKind }
