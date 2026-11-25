/**
 * Chronicle Shared — Pages (about / legal)
 *
 * `data/pages/` holds standalone pages. Each page is one markdown file in one
 * of the two post shapes:
 *
 *   data/pages/<id>/index.md   folder shape (attachments allowed)
 *   data/pages/<id>.md         flat shape
 *
 * `about` is the singleton page (`/about/`); every other id is a legal page
 * (`/legal/<id>/`). The rules below are shared by the content loader, the
 * renderer and (later) the CMS, so the same data always resolves the same way.
 */

export type PageKind = 'about' | 'legal'
export type PageStatus = 'draft' | 'published'

export interface PageMeta {
  id: string
  title: string
  kind: PageKind
  status: PageStatus
  /** Legal pages: the date the text takes effect (YYYY-MM-DD). */
  effectiveDate?: string
  /** Last edit (YYYY-MM-DD), from `updatedAt` or the legacy `lastModified`. */
  updatedAt?: string
  summary?: string
}

/** Ids are URL segments: lowercase, digits and dashes. */
export const PAGE_ID_RE = /^[a-z0-9][a-z0-9-]*$/

/** Why a page id is unusable, or null when it is fine. */
export function validatePageId(id: string): string | null {
  if (!id) return 'page id is empty'
  if (id.length > 80) return `page id "${id}" is longer than 80 characters`
  if (!PAGE_ID_RE.test(id)) {
    return `page id "${id}" must use lowercase letters, digits and dashes`
  }
  return null
}

/**
 * Resolve a page's kind, defaulting from its id.
 *
 * `about` is reserved: only the page with id `about` can be the about page,
 * and the about page cannot declare any other kind.
 */
export function resolvePageKind(id: string, declared: unknown): PageKind | null {
  const isAboutId = id === 'about'
  if (declared === undefined || declared === null || declared === '') {
    return isAboutId ? 'about' : 'legal'
  }
  if (declared === 'about') return isAboutId ? 'about' : null
  if (declared === 'legal') return isAboutId ? null : 'legal'
  return null
}

/** About keeps rendering by default (it always did); legal pages start as drafts. */
export function defaultPageStatus(kind: PageKind): PageStatus {
  return kind === 'about' ? 'published' : 'draft'
}

/** Normalise a YAML date or ISO string to `YYYY-MM-DD`. */
export function normalizePageDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10)
  }
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
}

function pageDate(
  id: string,
  field: string,
  value: unknown,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = normalizePageDate(value)
  if (!normalized) {
    throw new Error(`[chronicle] data/pages/${id}: ${field} is not a valid date`)
  }
  return normalized
}

/**
 * Build the normalised metadata of a page from its frontmatter.
 *
 * Throws on an unusable id, a kind that contradicts the id, an unknown status
 * or a malformed date — the caller adds the file path to the message.
 */
export function buildPageMeta(
  id: string,
  data: Record<string, unknown> = {},
): PageMeta {
  const idError = validatePageId(id)
  if (idError) throw new Error(`[chronicle] data/pages: ${idError}`)

  const kind = resolvePageKind(id, data.kind)
  if (!kind) {
    throw new Error(
      `[chronicle] data/pages/${id}: kind "${String(data.kind)}" conflicts with the id ` +
      "(the about page must be id \"about\"; every other page is \"legal\")",
    )
  }

  const declaredStatus = data.status
  if (
    declaredStatus !== undefined &&
    declaredStatus !== null &&
    declaredStatus !== '' &&
    declaredStatus !== 'draft' &&
    declaredStatus !== 'published'
  ) {
    throw new Error(
      `[chronicle] data/pages/${id}: status must be "draft" or "published"`,
    )
  }
  const status: PageStatus =
    declaredStatus === 'draft' || declaredStatus === 'published'
      ? declaredStatus
      : defaultPageStatus(kind)

  const effectiveDate = pageDate(id, 'effectiveDate', data.effectiveDate)
  const updatedAt = pageDate(id, 'updatedAt', data.updatedAt ?? data.lastModified)
  const summary = data.summary ? String(data.summary) : undefined

  return {
    id,
    kind,
    status,
    title: String(data.title ?? '').trim() || (kind === 'about' ? 'About' : id),
    ...(summary ? { summary } : {}),
    ...(effectiveDate ? { effectiveDate } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}
