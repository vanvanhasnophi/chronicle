# Versioning

Chronicle tracks two numbers that answer two different questions, and they
move independently.

| | App version | Content model |
|---|---|---|
| Question | *Which code am I running?* | *Which data layout is my site written in?* |
| Lives in | root `package.json` (plus git tag `v<version>`) | `data/site.yml` → `contentModel` |
| Range | SemVer, e.g. `4.0.0-beta.1` | whole number, currently `1` |
| Changed by | a release (`npm run release -- <version>`) | a migration, from the app |
| Checked by | npm / GitHub releases | the build, before rendering |

## App version

The repository is one release: the root `package.json` version is the version
users see. `npm run release -- <version>` synchronises the workspace
`package.json` files, `package-lock.json`, the README version badges and a new
CHANGELOG section; `--tag` also creates `v<version>`.

SemVer applies, and breaking changes require a major release. Breaking here
means what downstream sites feel: data layout, URLs, frontmatter semantics,
CLI flags, config keys. Chronicle's current line is **4.x, codename "Next
Tale"**. Everything originally planned for 4.0 and 4.1 ships as one 4.0
release, built up through betas (`4.0.0-beta.N`, see `docs/roadmap.md`); a
pre-release suffix means the interface may still move before 4.0.0.

## Content model

`data/` is the site. It survives every framework update — `npm run update`
merges upstream code and restores `data/` and `.chronicle/` from a backup — so
the data needs its own version, independent of the code that reads it.

`site.yml` states it once:

```yaml
contentModel: 1
```

The model covers the contract between the app and the data directory:

- directory layout under `data/` and the file names inside it
- frontmatter keys and what each value means
- the shapes of `site.yml`, `collections.yml`, `profile.yml`, `friends.yml`
- the shape of generated artifacts the app writes back (`posts/index.json`)

It does not cover the app's internals, the theme id (`themes/aurora`), package
names or plugin ids — those may change without moving either number.

The value the build supports is a single constant:
`SUPPORTED_CONTENT_MODEL` in `packages/shared/src/contentModel.ts`.

### Version history

| `contentModel` | Layout | Introduced |
|---|---|---|
| `1` | The 4.0 layout: `data/` as content root, posts as `posts/<id>/index.md` directories (or flat `posts/<id>.md` files), collections and tags as the two taxonomy axes, `pages` for about/legal | 4.0.0-beta.1 (marker + build check); the rest of the layout lands across the 4.0 betas |

A site created before 4.0 has no marker and keeps its about page in
`data/__about__/index.md`. The build assumes model `1`, prints a notice, and
still renders that legacy about page; `npm run migrate:v4` pins the marker,
moves the page to `data/pages/about/` and copies its attachments. The
migration is safe to re-run: `--dry-run` prints the plan, a real run copies
`data/` to `.chronicle/backups/migrate-v4-<timestamp>/` first, and a second run
is a no-op. The CMS keeps the marker when it rewrites `site.yml` (its YAML
writer only touches the paths it saves), so it survives normal editing.

### What the build does

| `site.yml` says | Build | What to do |
|---|---|---|
| `contentModel: 1` | builds | — |
| no marker, or no `site.yml` | builds with a notice, treated as `1` | add `contentModel: 1` |
| `contentModel: 2` (newer than the build) | stops before rendering | update Chronicle (`npm run update`) |
| `contentModel: 1` while the build expects `2` | stops before rendering | run the migration shipped with that release |
| `0`, `1.5`, `"1"`, `null`, anything not a whole number ≥ 1 | stops before rendering | write `contentModel: 1` unquoted |

The check is one function, used twice:

- **generator preflight** — `assertContentModel()` in
  `packages/gen/src/builder/astro.mjs` runs before Astro, so
  `npm run build` / `npm run build:astro` and CI fail early with a readable
  message;
- **template guard** — the `chronicle-content-model` integration in
  `packages/template-astro/astro.config.mjs` checks the same thing when
  `astro build` or `astro dev` is invoked directly, before any page renders.
  A build stops; dev only warns, so editing stays possible.

`packages/gen/test/content-model.test.mjs` pins every row of the table.

### Why this split

A forked site updates its code but keeps its data. That means the risky
direction is *new code, old data*, which must keep working (notice and
migrate), and the unsafe direction is *old code, new data*, which must be
refused rather than misread. A single app version cannot express that: the
same release can read many data generations, and one data directory outlives
many releases.

## Changing the content model

Only bump when the previous layout can no longer be read correctly — renaming
or removing a key, changing a value's meaning, moving files, changing what
`posts/index.json` contains. Adding optional keys, new optional files or new
UI features does not need a bump: older data stays readable, so the model stays
`1`.

When a release must bump it:

1. Change `SUPPORTED_CONTENT_MODEL` and add a row to the history table.
2. Ship the migration with that release. It must back up `data/`, support a
   dry run, be idempotent, print a report of what moved, and set the new
   `contentModel` only after everything else succeeded.
3. Update the layout reference (`docs/content-model.md`, landing with the
   layout) in the same commit.
4. Keep the `newer` / `older` hints truthful — they are the only guidance a
   blocked user sees.
5. Cover the new transition in `packages/gen/test/content-model.test.mjs`, for
   both directions (data older than the build, data newer than the build).
6. Note it in the CHANGELOG under the version that ships it.

Until that happens there is exactly one supported model, and `npm run
migrate:v4` is the only migration: it normalises pre-4.0 data into model 1
rather than changing the number.
