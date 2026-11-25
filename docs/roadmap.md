# Roadmap

Chronicle is developed in generations. The current line is **4.x, codename “Next Tale”**.

Everything planned originally for 4.0 and 4.1 ships as **one 4.0 release**, built up through betas so each capability can be tested on its own. There is no separate 4.1.

## 4.0 — Next Tale

### beta.1 — content model foundation

- [ ] `contentModel: 1` marker + build-time check in `site.yml`
- [ ] `content.config.ts`: schema validation for post frontmatter; content stays in `data/`
- [ ] Two post shapes: `posts/<id>/index.md` (with attachments) and `posts/<id>.md` (flat)
- [ ] `pages` collection: about, legal (`/legal/<id>/`), `effectiveDate`, footer links
- [ ] `npm run migrate:v4` skeleton (`__about__` → `pages/about`, dry-run, backup, report)

### beta.2 — taxonomy

- [ ] Collections: many-to-many membership, `primary`, `completed`, `appendMode`
- [ ] `extensions.collections` and `index.json` become arrays (+ `indexVersion`)
- [ ] `tags.yml` metadata (aliases, descriptions) — no tag pages, search only
- [ ] `featured: boolean` replaces the magic `featured` / `精选` values
- [ ] CMS: pages tab, collection toggles, multi-collection display

### beta.3 — translations and AI

- [ ] Translations as sibling files: `index.<lang>.md` / `<id>.<lang>.md`
- [ ] Missing-translation fallback + “untranslated” marking (`hreflang` stays correct)
- [ ] AI fields (`lang`, `aiTranslated`, `sourceHash`) merged into the `ai-enhance` plugin
- [ ] Stale-translation detection (source hash mismatch)

### beta.4 — URLs and plugins

- [ ] Per-collection URLs: `/collection/<slug>/` (nested routes in the plugin page shell)
- [ ] Collections become a data-only plugin; the magazine-style UI moves to its own opt-in plugin
- [ ] 2×2 isolation matrix (collections × magazine) in `verify:isolation`
- [ ] Duplicate-route assertion in the plugin registry

### beta.5 — tooling and performance

- [ ] `create-chronicle-blog` scaffolder (`npm create chronicle-blog my-site`)
- [ ] Image `srcset` with multiple widths (today only format switching is emitted)
- [ ] Revisit incremental builds (each build currently clears `dist/` and `.astro/`)

### 4.0.0

- [ ] Migration report signed off on the `demo` branch (URLs and page count unchanged)
- [ ] README, CHANGELOG and screenshots for the public release

## Won't do

- **Move content into `src/content`.** Content is data, not source: it has an independent lifecycle (CMS, imports, translations, backups) and the CMS lives in a separate workspace package. Collections are exposed through `content.config.ts` instead. See `docs/content-model.md` when it lands.
- **Rename `collections` to anything else.** UI, code and data keep one name.

## Versioning

- Application versions follow SemVer. Breaking changes (data layout, URLs, frontmatter semantics, CLI flags, config keys) require a major release.
- The content model has its own integer in `site.yml` (`contentModel`), independent of the app version.
