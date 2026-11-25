# Roadmap

Chronicle is developed in generations. The current line is **4.x, codename “Next Tale”**.

## 4.0 — Next Tale

Theme: one content model for posts, pages, collections and tags.

- [ ] `content.config.ts`: schema validation for post frontmatter, contents stay in `data/`
- [ ] Two post shapes: `posts/<id>/index.md` (with attachments) and `posts/<id>.md` (flat)
- [ ] Translations as sibling files: `index.<lang>.md` / `<id>.<lang>.md`
- [ ] `pages` collection for about and legal pages (`/legal/<id>/`)
- [ ] Collections: many-to-many membership, `primary`, `completed`, `appendMode`
- [ ] `tags.yml` metadata (aliases, descriptions) — no tag pages, search only
- [ ] `featured: boolean` replaces the magic `featured` / `精选` tags
- [ ] `contentModel` marker + `npm run migrate:v4`
- [ ] Remove leftovers: `__about__` special case, `/server/data/settings.json`, duplicated taxonomy rules

Not in 4.0: independent collection URLs, plugin split, incremental builds, performance work.

## 4.1

- [ ] `create-chronicle-blog` scaffolder (`npm create chronicle-blog my-site`)
- [ ] Per-collection URLs: `/collection/<slug>/` (requires nested routes in the plugin page shell)
- [ ] Collections become a data-only plugin; the magazine-style UI moves to its own opt-in plugin
- [ ] Image `srcset` with multiple widths (today only format switching is emitted)
- [ ] Revisit incremental builds (each build currently clears `dist/` and `.astro/`)

## Won't do

- **Move content into `src/content`.** Content is data, not source: it has an independent lifecycle (CMS, imports, translations, backups) and the CMS lives in a separate workspace package. Collections are exposed through `content.config.ts` instead. See `docs/content-model.md` when it lands.
- **Rename `collections` to anything else.** UI, code and data keep one name.

## Versioning

- Application versions follow SemVer. Breaking changes (data layout, URLs, frontmatter semantics, CLI flags, config keys) require a major release.
- The content model has its own integer in `site.yml` (`contentModel`), independent of the app version.
