/**
 * Chronicle Shared — Post File Shapes
 *
 * A post lives in `data/posts/` in one of two shapes:
 *
 *   posts/<id>/index.md   folder shape — the folder may hold attachments
 *   posts/<id>.md         flat shape   — no attachments
 *
 * Both expose the same id, so every reader (generator index, content loader,
 * CMS) has to classify entries identically. This is pure string logic; callers
 * do the directory walk and the `index.md` existence check.
 */

export type PostShape = 'folder' | 'flat'

export interface PostEntryRef {
  /** Post id (= URL slug and index key). */
  id: string
  shape: PostShape
  /** `index.md` for a folder, the flat file name otherwise. */
  filename: string
}

/** Entries starting with `.` or `_` are reserved (hidden / internal). */
const RESERVED_PREFIX = /^[._]/

/** Dots are reserved for translations (`<id>.<lang>.md`, beta.3). */
const FLAT_FILE = /^(.+)\.md$/

/**
 * Whether a markdown file starts with a `---` frontmatter block.
 *
 * Flat files (`posts/<id>.md`) only count as posts when they carry
 * frontmatter — that keeps a stray `README.md` or notes file out of the
 * collection. Folder posts (`<id>/index.md`) keep the old behaviour and are
 * accepted without one (the title falls back to the id).
 */
export function hasFrontmatter(raw: string): boolean {
  return /^\uFEFF?---\r?\n/.test(raw)
}

/**
 * Classify one entry of `data/posts/`.
 *
 * Folders are returned optimistically — the caller must verify that
 * `<id>/index.md` exists before treating the folder as a post, because a
 * folder can also be left over from a renamed post.
 *
 * @param entryName directory or file name inside `data/posts/`
 * @param isDirectory directory entry from `readdir(..., { withFileTypes: true })`
 * @returns the post reference, or null for entries that are not posts
 */
export function classifyPostEntry(
  entryName: string,
  isDirectory: boolean,
): PostEntryRef | null {
  if (!entryName || RESERVED_PREFIX.test(entryName)) return null

  if (isDirectory) {
    return { id: entryName, shape: 'folder', filename: 'index.md' }
  }

  const match = entryName.match(FLAT_FILE)
  if (!match) return null
  const id = match[1]
  // `<id>.<lang>.md` is a translation of `<id>` (beta.3), not a post of its own.
  if (!id || id.includes('.')) return null

  return { id, shape: 'flat', filename: entryName }
}
