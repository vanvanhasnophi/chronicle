/**
 * Chronicle Shared — Content Model Version
 *
 * `site.yml` declares which shape of `data/` a site is written in:
 *
 *     contentModel: 1
 *
 * The number is independent of the app version (see docs/versioning.md). It
 * moves only when a release cannot read the previous data layout, so a build
 * can refuse data it would silently misread instead of rendering it wrong.
 *
 * Pure functions with zero dependencies — the same check runs in the generator
 * preflight and in the template's data adapter.
 */

/** The content model this build reads and writes. Bump together with a migration. */
export const SUPPORTED_CONTENT_MODEL = 1

/** Key in site.yml that carries the content model version. */
export const CONTENT_MODEL_KEY = 'contentModel'

/** Outcome of checking a site's content model marker. */
export type ContentModelStatus = 'ok' | 'missing' | 'newer' | 'older' | 'invalid'

/** What the caller should do: continue, continue with a notice, or stop. */
export type ContentModelLevel = 'ok' | 'warn' | 'error'

export interface ContentModelCheck {
  status: ContentModelStatus
  level: ContentModelLevel
  /** The raw `contentModel` value from site.yml (undefined when absent). */
  value: unknown
  /** The content model this build supports. */
  expected: number
  /** One sentence describing the state; safe to print as-is. */
  summary: string
  /** Actionable next step, when there is one. */
  hint?: string
}

export interface ContentModelOptions {
  /**
   * Whether `site.yml` exists at all. A missing file gets a different hint
   * ("create site.yml") than an existing file without the marker ("add the
   * key"). Defaults to true.
   */
  siteFound?: boolean
  /**
   * The model to check against. Defaults to {@link SUPPORTED_CONTENT_MODEL};
   * migration tooling and tests pass another value to describe a bump before
   * the constant moves.
   */
  expected?: number
}

/** Describe an unexpected `contentModel` value for an error message. */
function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return `the string ${JSON.stringify(value)}`
  if (typeof value === 'number') return `the number ${value}`
  if (typeof value === 'boolean') return `the boolean ${value}`
  if (Array.isArray(value)) return 'a list'
  return `a value of type ${typeof value}`
}

/**
 * Check a parsed `site.yml` against the content model this build supports.
 *
 * Rules:
 *  - marker equals the supported model        → ok, build
 *  - marker absent (or no site.yml at all)    → warn, assume model 1 and build
 *  - marker newer than supported              → error, do not touch the data
 *  - marker older than supported (≥ 1)        → error, migrate first
 *  - marker not a whole number ≥ 1            → error, the file is malformed
 *
 * A missing marker is a warning, not an error: sites created before 4.0 have
 * no marker, and refusing them would turn a routine update into a migration.
 *
 * @param site parsed site.yml (any value; non-objects count as no marker)
 */
export function checkContentModel(
  site: unknown,
  options: ContentModelOptions = {},
): ContentModelCheck {
  const expected = options.expected ?? SUPPORTED_CONTENT_MODEL
  const record =
    site && typeof site === 'object' && !Array.isArray(site)
      ? (site as Record<string, unknown>)
      : null
  const hasKey = record !== null && Object.prototype.hasOwnProperty.call(record, CONTENT_MODEL_KEY)
  const value = hasKey ? record![CONTENT_MODEL_KEY] : undefined

  if (!hasKey) {
    const siteFound = options.siteFound !== false
    return {
      status: 'missing',
      level: 'warn',
      value,
      expected,
      summary: `site.yml has no usable "${CONTENT_MODEL_KEY}" marker; assuming content model ${expected}.`,
      hint: siteFound
        ? `Add "${CONTENT_MODEL_KEY}: ${expected}" to site.yml to pin the data layout.`
        : `Create site.yml with "${CONTENT_MODEL_KEY}: ${expected}" (see docs/versioning.md).`,
    }
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value === expected) {
      return {
        status: 'ok',
        level: 'ok',
        value,
        expected,
        summary: `Content model ${value}.`,
      }
    }
    if (value > expected) {
      return {
        status: 'newer',
        level: 'error',
        value,
        expected,
        summary: `The site declares content model ${value}, but this build of Chronicle reads content model ${expected}.`,
        hint: 'Update Chronicle to a release that supports it (npm run update), then build again.',
      }
    }
    if (value >= 1) {
      return {
        status: 'older',
        level: 'error',
        value,
        expected,
        summary: `The site declares content model ${value}, but this build reads content model ${expected}.`,
        hint: 'Run the migration command shipped with this release (see docs/versioning.md), then build again.',
      }
    }
    return {
      status: 'invalid',
      level: 'error',
      value,
      expected,
      summary: `Content model ${value} is not a supported version; supported versions start at 1.`,
      hint: `Use "${CONTENT_MODEL_KEY}: ${expected}" unless a migration says otherwise.`,
    }
  }

  return {
    status: 'invalid',
    level: 'error',
    value,
    expected,
    summary: `"${CONTENT_MODEL_KEY}" must be a whole number, got ${describeValue(value)}.`,
    hint: `Write "${CONTENT_MODEL_KEY}: ${expected}" unquoted — YAML reads a quoted value as a string.`,
  }
}

/**
 * Render a check as a prefixed, multi-line console message.
 *
 * @param check result of {@link checkContentModel}
 * @param source file the marker was read from (default `site.yml`)
 */
export function formatContentModelIssue(
  check: ContentModelCheck,
  source = 'site.yml',
): string {
  const tag = check.level === 'error' ? 'error' : 'notice'
  const lines = [`[chronicle] ${tag}: content model (${source})`, `  ${check.summary}`]
  if (check.hint) lines.push(`  → ${check.hint}`)
  return lines.join('\n')
}
