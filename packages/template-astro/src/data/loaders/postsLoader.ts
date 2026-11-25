/**
 * Chronicle — posts content loader
 *
 * Exposes `data/posts/` as the Astro `posts` collection (content.config.ts).
 * Content stays in `data/` — this is the bridge, not a migration: the renderer
 * keeps reading the data directory directly, while collections give builds a
 * typed, schema-validated view (astro sync / astro check / future features).
 *
 * Accepted shapes (see packages/shared/src/posts.ts):
 *   posts/<id>/index.md   folder shape, may carry attachments
 *   posts/<id>.md         flat shape, no attachments
 *
 * Frontmatter is parsed as real YAML (not the line-based subset the renderer
 * uses) and validated by the collection schema before it enters the store, so
 * a typo fails the build with the file path instead of rendering wrong.
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { Loader } from 'astro/loaders'
import { classifyPostEntry, hasFrontmatter } from '@chronicle/shared/src/posts'
import type { PostShape } from '@chronicle/shared/src/posts'
import { resolveDataDir } from '../dataDir'

/** `---` fence at the very start of the file (BOM handled by the caller). */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export interface PostSource {
  /** Post id (= URL slug and index key). */
  id: string
  /** Folder shape (with attachments) or flat file. */
  shape: PostShape
  /** Absolute path of the markdown file. */
  filePath: string
}

/**
 * Split a post file into parsed frontmatter and body.
 *
 * @throws when the frontmatter is not valid YAML or not a mapping — a broken
 * post must fail the build with its path, not silently load as empty data.
 */
export function parsePostFile(
  raw: string,
  filePath: string,
): { data: Record<string, unknown>; body: string } {
  const text = raw.startsWith('\uFEFF') ? raw.slice(1) : raw
  const match = text.match(FRONTMATTER_RE)
  if (!match) return { data: {}, body: text }

  let parsed: unknown
  try {
    parsed = YAML.parse(match[1])
  } catch (error) {
    throw new Error(
      `[chronicle] ${filePath}: invalid YAML frontmatter — ${(error as Error).message}`,
    )
  }
  if (parsed === null || parsed === undefined) parsed = {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[chronicle] ${filePath}: frontmatter must be a YAML mapping`)
  }

  return { data: parsed as Record<string, unknown>, body: text.slice(match[0].length) }
}

/**
 * Whether a file starts with a frontmatter fence, without reading the body.
 * A flat post without frontmatter is a stray note (README.md), not a post.
 */
function startsWithFrontmatter(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(8)
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0)
    return hasFrontmatter(buffer.subarray(0, bytes).toString('utf-8'))
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * List the post files under `postsDir`.
 *
 * Folders without `index.md` are skipped (leftover from a rename), flat files
 * without frontmatter are stray notes, and duplicate ids — a folder and a flat
 * file with the same name — are an error rather than a silent last-wins.
 */
export function discoverPostSources(postsDir: string): PostSource[] {
  const sources: PostSource[] = []
  const seen = new Map<string, string>()

  for (const entry of fs.readdirSync(postsDir, { withFileTypes: true })) {
    const ref = classifyPostEntry(entry.name, entry.isDirectory())
    if (!ref) continue

    const filePath = ref.shape === 'folder'
      ? path.join(postsDir, ref.id, ref.filename)
      : path.join(postsDir, ref.filename)
    if (!fs.existsSync(filePath)) continue
    if (ref.shape === 'flat' && !startsWithFrontmatter(filePath)) continue

    const previous = seen.get(ref.id)
    if (previous) {
      throw new Error(
        `[chronicle] duplicate post id "${ref.id}": ${previous} and ${filePath}. ` +
        'A post is either a folder (index.md) or a flat file, not both.',
      )
    }
    seen.set(ref.id, filePath)
    sources.push({ id: ref.id, shape: ref.shape, filePath })
  }

  return sources.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Loader for the `posts` collection.
 *
 * Reads the data directory on every sync/dev rebuild; the watcher picks up
 * edits so `astro dev` reflects a changed post without a restart.
 */
export function chroniclePosts(): Loader {
  return {
    name: 'chronicle-posts',
    load: async ({ store, parseData, generateDigest, logger, watcher }) => {
      const postsDir = path.join(resolveDataDir(), 'posts')
      store.clear()

      if (!fs.existsSync(postsDir)) {
        logger.warn(`posts directory not found: ${postsDir}`)
        return
      }

      const sources = discoverPostSources(postsDir)
      for (const source of sources) {
        const raw = fs.readFileSync(source.filePath, 'utf-8')
        // A flat file without frontmatter is a stray note (README.md), not a post.
        if (source.shape === 'flat' && !hasFrontmatter(raw)) continue
        const { data, body } = parsePostFile(raw, source.filePath)
        const validated = await parseData({
          id: source.id,
          data,
          filePath: source.filePath,
        })
        store.set({
          id: source.id,
          data: validated,
          body,
          filePath: source.filePath,
          digest: generateDigest({ ...validated, body }),
        })
      }

      watcher?.add(postsDir)
      logger.info(`${sources.length} post(s) loaded from ${postsDir}`)
    },
  }
}
