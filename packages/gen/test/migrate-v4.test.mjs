/**
 * Chronicle Gen — migrate:v4 tests (node:test, no extra dependencies)
 *
 * The migration is the only code that rewrites a user's data directory, so the
 * safety properties matter as much as the result: dry runs write nothing, an
 * apply backs the whole directory up first, and a second run is a no-op.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  backupStamp,
  formatMigrateReport,
  migrateV4,
  normalizeAboutMarkdown,
} from '../src/commands/migrate.mjs'

const roots = []

function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-migrate-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf-8')
  }
  return root
}

const LEGACY_SITE = {
  'data/site.yml': '# hand-written header\nhomepage:\n  siteName: Test\n',
  'data/__about__/index.md': [
    '---',
    'title: Old About',
    'lastModified: 2026-01-05',
    '---',
    '',
    'Old about body.',
  ].join('\n'),
  'data/__about__/photo.png': 'not really a png',
}

function backupDir(root) {
  return path.join(root, '.chronicle', 'backups')
}

after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
})

test('dry run reports the plan and writes nothing', () => {
  const root = makeRoot(LEGACY_SITE)
  const report = migrateV4({ dataDir: path.join(root, 'data'), dryRun: true, stamp: 'test' })

  assert.equal(report.dryRun, true)
  assert.equal(report.changed, true)
  assert.equal(report.backupPath, null)
  assert.deepEqual(
    report.actions.map((action) => `${action.step}:${action.status}`).sort(),
    ['about:planned', 'contentModel:planned'],
  )

  assert.equal(fs.existsSync(path.join(root, 'data/__about__')), true, 'legacy dir kept')
  assert.equal(fs.existsSync(path.join(root, 'data/pages')), false, 'no pages dir yet')
  assert.equal(fs.existsSync(backupDir(root)), false, 'no backup in dry run')
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'data/site.yml'), 'utf-8'), /contentModel/)
})

test('apply backs up, moves the about page and removes the legacy directory', () => {
  const root = makeRoot(LEGACY_SITE)
  const report = migrateV4({ dataDir: path.join(root, 'data'), stamp: 'fixed' })

  assert.equal(report.changed, true)
  assert.equal(report.backupPath, path.join(root, '.chronicle', 'backups', 'migrate-v4-fixed'))
  assert.equal(fs.existsSync(path.join(report.backupPath, '__about__/index.md')), true, 'backup holds the legacy page')
  assert.equal(fs.existsSync(path.join(root, 'data/__about__')), false, 'legacy dir removed')

  const site = fs.readFileSync(path.join(root, 'data/site.yml'), 'utf-8')
  assert.match(site, /^contentModel: 1$/m, 'marker added')
  assert.match(site, /# hand-written header/, 'comments preserved')
  assert.match(site, /homepage:/, 'existing keys preserved')

  const about = fs.readFileSync(path.join(root, 'data/pages/about/index.md'), 'utf-8')
  assert.match(about, /^kind: about$/m)
  assert.match(about, /^status: published$/m)
  assert.match(about, /^updatedAt: '?2026-01-05'?$/m)
  assert.doesNotMatch(about, /lastModified/)
  assert.match(about, /Old about body\./, 'body preserved')
  assert.equal(fs.readFileSync(path.join(root, 'data/pages/about/photo.png'), 'utf-8'), 'not really a png')

  assert.ok(report.actions.every((action) => action.status !== 'planned'))
  assert.ok(report.actions.some((action) => action.step === 'about' && action.status === 'done'))
})

test('a second run is a no-op', () => {
  const root = makeRoot(LEGACY_SITE)
  migrateV4({ dataDir: path.join(root, 'data'), stamp: 'first' })
  const second = migrateV4({ dataDir: path.join(root, 'data'), stamp: 'second' })

  assert.equal(second.changed, false)
  assert.equal(second.backupPath, null)
  assert.ok(second.actions.every((action) => action.status === 'skip'))
  assert.equal(fs.existsSync(path.join(root, '.chronicle', 'backups', 'migrate-v4-second')), false)
})

test('an existing pages/about wins over the legacy directory', () => {
  const root = makeRoot({
    ...LEGACY_SITE,
    'data/pages/about/index.md': '---\nkind: about\nstatus: published\n---\n\nNew about.\n',
  })
  const report = migrateV4({ dataDir: path.join(root, 'data') })

  const aboutAction = report.actions.find((action) => action.step === 'about')
  assert.equal(aboutAction.status, 'skip')
  assert.match(aboutAction.detail, /pages\/about already exists/)
  assert.equal(fs.existsSync(path.join(root, 'data/__about__/index.md')), true, 'legacy kept for the author')
  assert.match(fs.readFileSync(path.join(root, 'data/pages/about/index.md'), 'utf-8'), /New about\./)
})

test('data for another content model is refused', () => {
  const root = makeRoot({ 'data/site.yml': 'contentModel: 2\n' })
  assert.throws(
    () => migrateV4({ dataDir: path.join(root, 'data') }),
    /declares contentModel 2/,
  )
})

test('a data directory without site.yml or __about__ needs no migration', () => {
  const root = makeRoot({ 'data/posts/index.json': '{}\n' })
  const report = migrateV4({ dataDir: path.join(root, 'data') })

  assert.equal(report.changed, false)
  assert.equal(report.backupPath, null)
  assert.equal(report.actions.length, 2)
  assert.ok(report.actions.every((action) => action.status === 'skip'))
})

test('normalizeAboutMarkdown keeps a page without frontmatter usable', () => {
  const markdown = normalizeAboutMarkdown('Just an about body.\n')
  assert.match(markdown, /^---\nkind: about\nstatus: published\n---\n\nJust an about body\.\n$/)
})

test('the console report is readable', () => {
  const root = makeRoot(LEGACY_SITE)
  const report = migrateV4({ dataDir: path.join(root, 'data'), dryRun: true })
  const text = formatMigrateReport(report)
  assert.match(text, /migrate:v4/)
  assert.match(text, /dry run/)
  assert.match(text, /contentModel: add "contentModel: 1"/)
  assert.match(text, /about: move __about__\/ → pages\/about\//)
  assert.match(backupStamp(new Date('2026-11-25T18:00:00Z')), /^2026-11-25T18-00-00-000Z$/)
})
