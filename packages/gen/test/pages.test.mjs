/**
 * Chronicle — page model tests (node:test, no extra dependencies)
 *
 * `data/pages/` holds the about singleton (`/about/`) and legal pages
 * (`/legal/<id>/`). The id/kind/status rules are shared by the content loader
 * and the renderer, so both must agree on these outcomes.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildPageMeta,
  defaultPageStatus,
  normalizePageDate,
  resolvePageKind,
  validatePageId,
} from '../../shared/src/pages.ts'

test('page ids are URL-safe lowercase slugs', () => {
  for (const id of ['about', 'privacy-policy', 'terms2']) {
    assert.equal(validatePageId(id), null, `valid: ${id}`)
  }
  for (const id of ['', 'About', 'has space', '-leading', 'under_score', 'x'.repeat(81)]) {
    assert.notEqual(validatePageId(id), null, `invalid: ${JSON.stringify(id)}`)
  }
})

test('kind defaults from the id and about is a singleton', () => {
  assert.equal(resolvePageKind('about', undefined), 'about')
  assert.equal(resolvePageKind('privacy', undefined), 'legal')
  assert.equal(resolvePageKind('about', 'about'), 'about')
  assert.equal(resolvePageKind('privacy', 'legal'), 'legal')
  assert.equal(resolvePageKind('about', 'legal'), null, 'about cannot be legal')
  assert.equal(resolvePageKind('privacy', 'about'), null, 'about kind requires the about id')
  assert.equal(resolvePageKind('privacy', 'faq'), null, 'unknown kinds are rejected')
})

test('about publishes by default, legal pages start as drafts', () => {
  assert.equal(defaultPageStatus('about'), 'published')
  assert.equal(defaultPageStatus('legal'), 'draft')
})

test('buildPageMeta normalises the about page', () => {
  const about = buildPageMeta('about', {})
  assert.equal(about.kind, 'about')
  assert.equal(about.status, 'published')
  assert.equal(about.title, 'About')

  const overridden = buildPageMeta('about', { title: 'About me', status: 'draft', lastModified: '2026-05-06' })
  assert.equal(overridden.title, 'About me')
  assert.equal(overridden.status, 'draft')
  assert.equal(overridden.updatedAt, '2026-05-06')
})

test('buildPageMeta normalises legal pages', () => {
  const draft = buildPageMeta('privacy-policy', {})
  assert.equal(draft.kind, 'legal')
  assert.equal(draft.status, 'draft')
  assert.equal(draft.title, 'privacy-policy', 'title falls back to the id')

  const published = buildPageMeta('terms', {
    title: 'Terms',
    status: 'published',
    effectiveDate: '2026-11-01',
    updatedAt: '2026-10-20',
    summary: 'The rules.',
  })
  assert.deepEqual(published, {
    id: 'terms',
    kind: 'legal',
    status: 'published',
    title: 'Terms',
    summary: 'The rules.',
    effectiveDate: '2026-11-01',
    updatedAt: '2026-10-20',
  })
})

test('dates accept YAML dates and ISO strings, reject garbage', () => {
  assert.equal(normalizePageDate(new Date('2026-03-04T12:00:00Z')), '2026-03-04')
  assert.equal(normalizePageDate('2026-03-04T23:59:00Z'), '2026-03-04')
  assert.equal(normalizePageDate(''), undefined)
  assert.equal(normalizePageDate('not-a-date'), undefined)

  assert.throws(
    () => buildPageMeta('terms', { effectiveDate: 'not-a-date' }),
    /effectiveDate is not a valid date/,
  )
})

test('malformed pages are rejected with a useful message', () => {
  assert.throws(() => buildPageMeta('About', {}), /must use lowercase/)
  assert.throws(() => buildPageMeta('privacy', { kind: 'about' }), /conflicts with the id/)
  assert.throws(() => buildPageMeta('privacy', { status: 'scheduled' }), /status must be/)
})
