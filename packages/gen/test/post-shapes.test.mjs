/**
 * Chronicle — post shape tests (node:test, no extra dependencies)
 *
 * `data/posts/` accepts two shapes — a folder with `index.md` (attachments
 * allowed) and a flat `<id>.md` file (no attachments). The classifier is the
 * single source of truth: the generator index, the Astro content loader and the
 * CMS all use these rules, so they must be pinned.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { classifyPostEntry, hasFrontmatter } from '../../shared/src/posts.ts'
import { buildPostIndex } from '../src/builder/indexer.mjs'

const roots = []

function makeData(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-shapes-'))
  roots.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf-8')
  }
  return dir
}

after(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true })
})

test('a folder is a post candidate with index.md', () => {
  assert.deepEqual(classifyPostEntry('hello', true), {
    id: 'hello',
    shape: 'folder',
    filename: 'index.md',
  })
})

test('a flat markdown file is a post candidate', () => {
  assert.deepEqual(classifyPostEntry('hello.md', false), {
    id: 'hello',
    shape: 'flat',
    filename: 'hello.md',
  })
})

test('reserved entries and non-post files are ignored', () => {
  for (const name of ['.draft', '_hidden', '.DS_Store', '_notes.md']) {
    assert.equal(classifyPostEntry(name, true), null, `folder: ${name}`)
    assert.equal(classifyPostEntry(name, false), null, `file: ${name}`)
  }
  for (const name of ['cover.png', 'index.json', 'notes.txt', '.md', '.hidden.md']) {
    assert.equal(classifyPostEntry(name, false), null, `file: ${name}`)
  }
})

test('translation files are not posts of their own', () => {
  // `<id>.<lang>.md` is a translation of `<id>` (beta.3), not a separate post.
  assert.equal(classifyPostEntry('hello.zh.md', false), null)
  assert.equal(classifyPostEntry('hello.zh-CN.md', false), null)
})

test('flat files need frontmatter, folder files do not', () => {
  assert.equal(hasFrontmatter('---\ntitle: Hi\n---\n\nBody'), true)
  assert.equal(hasFrontmatter('\uFEFF---\ntitle: Hi\n---\n'), true)
  assert.equal(hasFrontmatter('just a note\n'), false)
  assert.equal(hasFrontmatter('---'), false, 'a fence needs a closing newline')
})

test('the index includes flat posts and skips stray markdown', () => {
  const dataDir = makeData({
    'posts/folder-post/index.md': '---\ntitle: Folder\nstatus: published\n---\n\nFolder body.',
    'posts/flat-post.md': '---\ntitle: Flat\ndate: 2026-03-04\n---\n\nFlat body.',
    'posts/README.md': 'No frontmatter here — not a post.',
    'posts/_notes.md': '---\ntitle: Reserved\n---\n\nNo.',
    'posts/.draft.md': '---\ntitle: Hidden\n---\n\nNo.',
    'posts/empty-folder/readme.md': 'Folder without index.md.',
  })

  const index = buildPostIndex(dataDir)
  assert.deepEqual(Object.keys(index).sort(), ['flat-post', 'folder-post'])
  assert.equal(index['flat-post'].title, 'Flat')
  assert.equal(index['flat-post'].status, 'draft', 'missing status defaults to draft')
  assert.equal(index['folder-post'].status, 'published')
})

test('a folder and a flat file with the same id are rejected', () => {
  const dataDir = makeData({
    'posts/dup/index.md': '---\ntitle: Folder\n---\n\nBody.',
    'posts/dup.md': '---\ntitle: Flat\n---\n\nBody.',
  })
  assert.throws(() => buildPostIndex(dataDir), /Duplicate post id "dup"/)
})
