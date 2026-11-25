/**
 * Chronicle Gen — migrate:v4
 *
 * Normalises pre-4.0 data into the content model 1 layout:
 *
 *   1. pin `contentModel: 1` in site.yml (comments preserved);
 *   2. move the legacy about page `data/__about__/` to `data/pages/about/`
 *      (kind: about, status: published, lastModified → updatedAt), copying
 *      its attachments.
 *
 * Safety rules: dry run by default is available via `--dry-run`, every apply
 * copies the whole data directory to `.chronicle/backups/migrate-v4-<stamp>/`
 * first, and the run is idempotent — a second run skips everything. The legacy
 * directory is only removed after the new page has been written.
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const SITE_FILE = 'site.yml'
const LEGACY_DIR = '__about__'
const PAGES_DIR = 'pages'
/** Display path (forward slashes) and filesystem path are derived from these. */
const ABOUT_DIR = 'pages/about'
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * @typedef {Object} MigrateAction
 * @property {string} step
 * @property {'done'|'planned'|'skip'} status
 * @property {string} detail
 * @property {string[]} [notes]
 */

/**
 * @typedef {Object} MigrateReport
 * @property {string} dataDir
 * @property {boolean} dryRun
 * @property {string|null} backupPath
 * @property {MigrateAction[]} actions
 * @property {boolean} changed
 */

/** Timestamp for the backup directory name (filesystem-safe ISO). */
export function backupStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

/**
 * Rewrite an about page's frontmatter for the pages collection.
 *
 * @param {string} raw markdown including frontmatter
 * @returns {string} markdown with kind/status/updatedAt set
 */
export function normalizeAboutMarkdown(raw) {
  const text = raw.startsWith('\uFEFF') ? raw.slice(1) : raw
  const match = text.match(FRONTMATTER_RE)
  const source = match ? match[1] : ''
  const body = match ? text.slice(match[0].length) : text

  let data = {}
  if (source.trim()) {
    const parsed = YAML.parse(source)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed
  }

  const doc = new YAML.Document(data)
  if (!doc.has('kind')) doc.set('kind', 'about')
  if (!doc.has('status')) doc.set('status', 'published')
  if (doc.has('lastModified') && !doc.has('updatedAt')) {
    doc.set('updatedAt', doc.get('lastModified'))
    doc.delete('lastModified')
  }

  const frontmatter = doc.toString({ lineWidth: -1 }).trimEnd()
  const cleanBody = body.replace(/^\r?\n+/, '')
  return `---\n${frontmatter}\n---\n\n${cleanBody}`
}

/**
 * Migrate one data directory to content model 1.
 *
 * @param {{ dataDir: string, dryRun?: boolean, stamp?: string }} options
 * @returns {MigrateReport}
 */
export function migrateV4({ dataDir, dryRun = false, stamp = backupStamp() }) {
  const root = path.resolve(dataDir)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`data directory not found: ${root}`)
  }

  /** @type {MigrateAction[]} */
  const actions = []
  const skipped = []
  /** @type {Array<{ step: string, detail: string, apply: () => string[] }>} */
  const pending = []

  // ── 1. content model marker ──────────────────────────────
  const siteFile = path.join(root, SITE_FILE)
  if (!fs.existsSync(siteFile)) {
    skipped.push({ step: 'contentModel', status: 'skip', detail: `${SITE_FILE} not found — nothing to pin` })
  } else {
    const text = fs.readFileSync(siteFile, 'utf-8')
    const doc = YAML.parseDocument(text, { keepSourceTokens: true })
    const current = doc.get('contentModel')
    if (current === 1) {
      skipped.push({ step: 'contentModel', status: 'skip', detail: `supported model 1 in ${SITE_FILE}` })
    } else if (current === undefined || current === null) {
      pending.push({
        step: 'contentModel',
        detail: `add "contentModel: 1" to ${SITE_FILE}`,
        apply: () => {
          doc.setIn(['contentModel'], 1)
          fs.writeFileSync(siteFile, doc.toString({ lineWidth: -1 }), 'utf-8')
          return ['contentModel: 1 written']
        },
      })
    } else {
      throw new Error(
        `${SITE_FILE} declares contentModel ${String(current)}; migrate:v4 only upgrades to model 1. ` +
        'Use the migration that ships with that model instead.',
      )
    }
  }

  // ── 2. about page: data/__about__ → data/pages/about ────
  const legacyDir = path.join(root, LEGACY_DIR)
  const legacyFile = path.join(legacyDir, 'index.md')
  const aboutDir = path.join(root, ABOUT_DIR)
  const aboutFile = path.join(aboutDir, 'index.md')

  if (!fs.existsSync(legacyFile)) {
    skipped.push({ step: 'about', status: 'skip', detail: `no ${LEGACY_DIR}/index.md` })
  } else if (fs.existsSync(aboutFile)) {
    skipped.push({
      step: 'about',
      status: 'skip',
      detail: `${PAGES_DIR}/about already exists; remove ${LEGACY_DIR}/ after checking it`,
    })
  } else {
    const attachments = fs
      .readdirSync(legacyDir, { withFileTypes: true })
      .map((entry) => entry.name)
      .filter((name) => name !== 'index.md' && !name.startsWith('.'))
    pending.push({
      step: 'about',
      detail: `move ${LEGACY_DIR}/ → ${ABOUT_DIR}/ (${attachments.length} attachment(s))`,
      apply: () => {
        fs.mkdirSync(aboutDir, { recursive: true })
        const markdown = normalizeAboutMarkdown(fs.readFileSync(legacyFile, 'utf-8'))
        fs.writeFileSync(aboutFile, markdown, 'utf-8')
        for (const name of attachments) {
          fs.cpSync(path.join(legacyDir, name), path.join(aboutDir, name), { recursive: true })
        }
        // Only remove the legacy directory once the new page is on disk.
        fs.rmSync(legacyDir, { recursive: true, force: true })
        return [
          `${PAGES_DIR}/about/index.md written`,
          `${attachments.length} attachment(s) copied`,
          `${LEGACY_DIR}/ removed`,
        ]
      },
    })
  }

  // ── report / apply ──────────────────────────────────────
  const report = {
    dataDir: root,
    dryRun: Boolean(dryRun),
    backupPath: null,
    actions: [],
    changed: pending.length > 0,
  }

  if (dryRun || pending.length === 0) {
    report.actions = [
      ...skipped,
      ...pending.map((action) => ({ step: action.step, status: 'planned', detail: action.detail })),
    ]
    return report
  }

  // Backup before touching anything. `.chronicle/` is gitignored and local-only.
  const backupPath = path.join(path.dirname(root), '.chronicle', 'backups', `migrate-v4-${stamp}`)
  fs.mkdirSync(path.dirname(backupPath), { recursive: true })
  fs.cpSync(root, backupPath, { recursive: true })
  report.backupPath = backupPath
  report.actions.push(...skipped)

  for (const action of pending) {
    const notes = action.apply()
    report.actions.push({ step: action.step, status: 'done', detail: action.detail, notes })
  }

  return report
}

/**
 * Format a migration report for the console.
 *
 * @param {MigrateReport} report
 * @returns {string}
 */
export function formatMigrateReport(report) {
  const lines = [
    `[chronicle-migrate] migrate:v4 — ${report.dataDir}`,
    report.dryRun ? '[chronicle-migrate] mode: dry run (nothing written)' : '[chronicle-migrate] mode: apply',
  ]
  if (report.backupPath) lines.push(`[chronicle-migrate] backup: ${report.backupPath}`)

  for (const action of report.actions) {
    const icon = action.status === 'done' ? '✓' : action.status === 'planned' ? '→' : '-'
    lines.push(`  ${icon} ${action.step}: ${action.detail}`)
    for (const note of action.notes || []) lines.push(`      ${note}`)
  }

  if (!report.changed) {
    lines.push('[chronicle-migrate] nothing to migrate')
  } else if (report.dryRun) {
    lines.push('[chronicle-migrate] dry run — re-run without --dry-run to apply')
  } else {
    lines.push('[chronicle-migrate] done — review with: git diff data')
  }
  return lines.join('\n')
}

/**
 * CLI entry (`node packages/gen/bin/cli.mjs migrate`).
 *
 * @param {string[]} argv
 */
export function migrateCommand(argv = []) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run' || arg === '-n') args.dryRun = true
    else if ((arg === '--dataDir' || arg === '-d') && argv[i + 1]) args.dataDir = argv[++i]
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: chronicle-gen migrate [--dataDir <path>] [--dry-run] [--json]')
      return
    }
  }

  try {
    const report = migrateV4({
      dataDir: args.dataDir || 'data',
      dryRun: args.dryRun === true,
    })
    console.log(args.json ? JSON.stringify(report, null, 2) : formatMigrateReport(report))
  } catch (error) {
    console.error('[chronicle-migrate] failed:', error.message)
    process.exit(1)
  }
}
