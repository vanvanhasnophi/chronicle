/**
 * Chronicle — content collections
 *
 * The content root is `data/` (never `src/content`). Collections are a typed
 * view over that directory: `data/posts/` is exposed as `posts` through the
 * custom loader in `src/data/loaders/postsLoader.ts`.
 *
 * `astro sync` validates every entry against this schema, so a malformed
 * frontmatter field fails the build with the offending file path. Rendering
 * still reads `data/` directly (src/data/adapters/localFs.ts) — adopting
 * collections is incremental, not a content migration.
 */

import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { chroniclePosts } from './data/loaders/postsLoader'

/** Accepts a YAML date or an ISO string, normalised to an ISO string. */
const isoDate = z
  .union([z.string(), z.date()])
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'must be a valid date (YYYY-MM-DD or an ISO timestamp)',
  })
  .transform((value) => new Date(value).toISOString())

/** `tags: a, b` and `tags: [a, b]` are both accepted, like the renderer. */
const tagList = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value.split(',').map((tag) => tag.trim()).filter(Boolean)
      : value,
  z.array(z.string()).default([]),
)

const posts = defineCollection({
  loader: chroniclePosts(),
  schema: z.looseObject({
    /** Missing title falls back to the post id (renderer behaviour). */
    title: z.string().optional(),
    date: isoDate.optional(),
    updatedAt: isoDate.optional(),
    status: z.enum(['draft', 'published']).default('draft'),
    tags: tagList,
    summary: z.string().optional(),
    image: z.string().optional(),
    /** Single name, comma-separated list, or YAML list. */
    author: z.union([z.string(), z.array(z.string())]).optional(),
    font: z.string().optional(),
    type: z.enum(['article', 'slides']).optional(),
    /** Slides opt-in (Marp); the renderer treats `marp: true` as type=slides. */
    marp: z.boolean().optional(),
    aiGenerated: z.boolean().optional(),
  }),
})

export const collections = { posts }
