/**
 * Chronicle Gen — content model tests (node:test, no extra dependencies)
 *
 * `site.yml`'s `contentModel` marker is the contract between an app build and
 * its data directory. These assertions pin the four outcomes (ok / missing /
 * newer / invalid) and the generator preflight that acts on them.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  CONTENT_MODEL_KEY,
  SUPPORTED_CONTENT_MODEL,
  checkContentModel,
  formatContentModelIssue,
} from '../../shared/src/contentModel.ts'
import { assertContentModel, checkDataDirContentModel } from '../src/builder/contentModel.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
const roots = []

function makeDataDir(siteYml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-model-'))
  roots.push(dir)
  if (siteYml !== undefined) fs.writeFileSync(path.join(dir, 'site.yml'), siteYml, 'utf-8')
  return dir
}

after(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true })
})

test('accepts the content model this build supports', () => {
  const check = checkContentModel({ [CONTENT_MODEL_KEY]: SUPPORTED_CONTENT_MODEL })
  assert.equal(check.status, 'ok')
  assert.equal(check.level, 'ok')
  assert.equal(check.expected, SUPPORTED_CONTENT_MODEL)
  assert.equal(check.value, SUPPORTED_CONTENT_MODEL)
})

test('a missing marker is a warning, not a failure', () => {
  const found = checkContentModel({ rss: true })
  assert.equal(found.status, 'missing')
  assert.equal(found.level, 'warn')
  assert.match(found.summary, /assuming content model 1/)
  assert.match(found.hint, /contentModel: 1/)

  const noFile = checkContentModel(null, { siteFound: false })
  assert.equal(noFile.status, 'missing')
  assert.equal(noFile.level, 'warn')
  assert.match(noFile.hint, /Create site\.yml/)

  // Non-object site.yml (empty file, list, scalar) is the same as no marker.
  for (const site of [null, undefined, [], 'contentModel: 1']) {
    assert.equal(checkContentModel(site).level, 'warn', `site: ${JSON.stringify(site)}`)
  }
})

test('refuses data written for a newer model', () => {
  const check = checkContentModel({ [CONTENT_MODEL_KEY]: SUPPORTED_CONTENT_MODEL + 1 })
  assert.equal(check.status, 'newer')
  assert.equal(check.level, 'error')
  assert.match(check.summary, new RegExp(`content model ${SUPPORTED_CONTENT_MODEL + 1}`))
  assert.match(check.hint, /npm run update/)
})

test('refuses data older than the build and asks for a migration', () => {
  // Describes the next bump before the constant moves: a build on model 2
  // must not treat model-1 data as readable.
  const older = checkContentModel(
    { [CONTENT_MODEL_KEY]: 1 },
    { expected: 2 },
  )
  assert.equal(older.status, 'older')
  assert.equal(older.level, 'error')
  assert.equal(older.expected, 2)
  assert.match(older.hint, /migration/)

  const current = checkContentModel({ [CONTENT_MODEL_KEY]: 2 }, { expected: 2 })
  assert.equal(current.status, 'ok')
})

test('refuses malformed markers', () => {
  const malformed = ['1', 1.5, 0, -1, null, true, [1], { major: 1 }]
  for (const value of malformed) {
    const check = checkContentModel({ [CONTENT_MODEL_KEY]: value })
    assert.equal(check.level, 'error', `contentModel: ${JSON.stringify(value)} must be rejected`)
    assert.equal(check.status, 'invalid', `contentModel: ${JSON.stringify(value)} must be invalid`)
  }

  const quoted = checkContentModel({ [CONTENT_MODEL_KEY]: '1' })
  assert.match(quoted.summary, /the string "1"/)
  assert.match(quoted.hint, /unquoted/)
})

test('formats issues with a prefix, the summary and the hint', () => {
  const error = formatContentModelIssue(
    checkContentModel({ [CONTENT_MODEL_KEY]: SUPPORTED_CONTENT_MODEL + 1 }),
    'data/site.yml',
  )
  assert.match(error, /^\[chronicle\] error: content model \(data\/site\.yml\)/)
  assert.match(error, /→ /)

  const notice = formatContentModelIssue(checkContentModel({}), 'data/site.yml')
  assert.match(notice, /^\[chronicle\] notice: content model/)
})

test('preflight reads site.yml from the data directory', () => {
  const okDir = makeDataDir('contentModel: 1\nrss: true\n')
  const ok = checkDataDirContentModel(okDir)
  assert.equal(ok.level, 'ok')
  assert.equal(ok.filePath, path.join(okDir, 'site.yml'))

  assert.equal(checkDataDirContentModel(makeDataDir('rss: true\n')).status, 'missing')
  assert.equal(checkDataDirContentModel(makeDataDir(undefined)).status, 'missing')
  assert.equal(checkDataDirContentModel(makeDataDir('contentModel: 2\n')).level, 'error')
  assert.equal(
    checkDataDirContentModel(makeDataDir('contentModel: "1"\n')).status,
    'invalid',
    'a quoted marker parses as a string and must be rejected',
  )
})

test('assertContentModel throws on incompatible data and warns on a missing marker', () => {
  assert.throws(
    () => assertContentModel(makeDataDir('contentModel: 2\n')),
    /content model 2/,
  )

  const originalWarn = console.warn
  let warned = ''
  console.warn = (message) => {
    warned += String(message)
  }
  try {
    const result = assertContentModel(makeDataDir('rss: true\n'))
    assert.equal(result.status, 'missing')
    assert.equal(assertContentModel(makeDataDir('contentModel: 1\n')).level, 'ok')
  } finally {
    console.warn = originalWarn
  }
  assert.match(warned, /content model \(.*site\.yml\)/)
})

test('the shipped data directory declares the supported content model', () => {
  const check = checkDataDirContentModel(path.join(repoRoot, 'data'))
  assert.equal(check.level, 'ok', `${check.filePath}: ${check.summary}`)
})
