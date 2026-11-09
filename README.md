<div align="center">

# EasyTV Manage

**Admin console of [EasyTV](https://easytv.ai) — the open-source AI short-drama platform.**

[![CI](https://github.com/easytv-ai/easytv-manage/actions/workflows/ci.yml/badge.svg)](https://github.com/easytv-ai/easytv-manage/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![License: Commercial](https://img.shields.io/badge/License-Commercial-orange.svg)](COMMERCIAL-LICENSE.md)
[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt.js&logoColor=white)](https://nuxt.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[English](README.md) · [简体中文](README.zh-CN.md) · [Backend](https://github.com/easytv-ai/easytv-api) · [Studio](https://github.com/easytv-ai/easytv-web)

</div>

EasyTV Manage is the operations console for a self-hosted EasyTV: users and
teams, works and moderation, billing and model pricing, growth campaigns and
every runtime setting of the backend. It is a Nuxt 4 single-page app that
talks to the `/admin/*` routes of
[`easytv-api`](https://github.com/easytv-ai/easytv-api).

## What you can manage

| Area | Pages |
| --- | --- |
| **People** | Users (search, identities, bans), teams and member quotas, partners |
| **Content** | Works, featured showcase, categories, banners, skills, prompts, styles, subjects, projects, assets, canvases |
| **Community** | Comment / report / activity moderation queues, notices, notifications |
| **Money** | Orders, recharges, withdrawals, bills, membership plans, point packs, model pricing, invoices |
| **Growth** | Campaigns, invite and check-in rules, usage logs, dashboards |
| **System** | Site, payment, model gateway, growth and invoice settings (super admin only) |

Settings edited here are stored in the backend's `setting` table and take
effect without a restart.

## Quick Start

Requires Node.js 22.5+ and [pnpm](https://pnpm.io) 10+ (`corepack enable` installs the pinned version).

```bash
git clone https://github.com/easytv-ai/easytv-manage.git
cd easytv-manage
pnpm install
cp .env.example .env.development
pnpm dev                        # http://localhost:3006
```

The example already points at the hosted API `https://tv-api.easyapi.com`,
the creator studio `https://www.easytv.ai` and the partner console
`https://partner.easytv.ai`, the same targets as
[`easytv-web`](https://github.com/easytv-ai/easytv-web). `pnpm dev` works
without copying an env file. For a local stack, set the API to
`http://localhost:8383`, the studio to `http://localhost:3005` and the
partner console to `http://localhost:3010`.

Sign in with the `admin` account created by `easytv-api` on first start
(`ROOT_USERNAME` / `ROOT_PASSWORD`). Without a backend you can still browse
the UI with the demo account shown on the login page.

### First-run checklist

1. **System → Gateway**: enter the URL and key of your New API-compatible
   gateway, fetch the model list and import pricing.
2. **System → Site**: set the public studio URL used in invite links and
   callbacks.
3. **System → Payment**: enable WeChat Pay / Alipay if you sell plans or
   points.
4. **Model pricing**: adjust point prices per model; the studio shows them in
   cost estimates.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `NUXT_PUBLIC_API_BASE_URL` | yes | Base URL of `easytv-api` (default `https://tv-api.easyapi.com`) |
| `NUXT_PUBLIC_STUDIO_URL` | yes | URL of the creator studio (`easytv-web`): "open site" link, review → player jumps, static asset URLs (default `https://www.easytv.ai`) |
| `NUXT_PUBLIC_PARTNER_URL` | yes | URL of the partner console (`easytv-partner`): "open partner console" on the Partners page (default `https://partner.easytv.ai`) |
| `NUXT_PUBLIC_SITE_NAME` | no | Name shown in the console (default `EasyTV`) |

Development reads `.env.development`, production builds read
`.env.production`. Missing files fall back to the defaults in
`nuxt.config.ts`. Neither file is committed; `.env.example` is the reference.

## Scripts

```bash
pnpm dev          # dev server on :3006
pnpm build        # production build (Cloudflare preset)
pnpm typecheck    # vue-tsc (also runs on pre-push via simple-git-hooks)
pnpm preview      # build + wrangler dev
pnpm deploy       # build + wrangler deploy
```

## Project Layout

```
app/
  api/           typed wrappers around /admin/* endpoints
  components/    tables, drawers, forms shared across pages
  layouts/       console shell (sidebar, top bar)
  pages/         one folder per admin area
  utils/         settings mappers, media URL helpers, formatting
i18n/locales/    zh, zh-TW, en
```

## Deployment

The Nitro preset is `cloudflare_module` (`wrangler.jsonc`):

```bash
pnpm deploy
```

For a Node host build with `NITRO_PRESET=node-server pnpm build` and start
`node .output/server/index.mjs`.

### Docker

A multi-arch image is published to GHCR on every push to `master` and every
release tag. All `NUXT_PUBLIC_*` variables can be set at run time:

```bash
docker run -d -p 3006:3006 \
  -e NUXT_PUBLIC_API_BASE_URL=https://api.example.com \
  -e NUXT_PUBLIC_STUDIO_URL=https://studio.example.com \
  ghcr.io/easytv-ai/easytv-manage:latest
```

The `docker-compose.yml` in [`easytv-api`](https://github.com/easytv-ai/easytv-api)
starts the whole stack with `docker compose --profile full up -d`.

## Contributing

Issues and pull requests are welcome, in English or Chinese. See
[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and
[CHANGELOG.md](CHANGELOG.md).

## Related Projects

| Repository | Description |
| --- | --- |
| [easytv-api](https://github.com/easytv-ai/easytv-api) | Go backend |
| [easytv-web](https://github.com/easytv-ai/easytv-web) | Creator studio |
| [easytv-website](https://github.com/easytv-ai/easytv-website) | Project website |

## License

EasyTV Manage is **dual-licensed**:

| You want to… | Use |
| --- | --- |
| Study, modify, or self-host and you will follow AGPL-3.0 (including publishing corresponding source if you offer a modified version as a network service) | [GNU Affero GPL v3.0](LICENSE) |
| Ship a closed-source product, or host a modified version as SaaS / white-label **without** those AGPL obligations | [Commercial License](COMMERCIAL-LICENSE.md) |

The commercial terms in the repo are a template. They apply only after you and
the EasyTV copyright holders sign an Order. Write to
[leida@easyapi.com](mailto:leida@easyapi.com) with `[LICENSE] easytv-manage` in
the subject. [简体中文译本](COMMERCIAL-LICENSE.zh-CN.md) is provided for
convenience; the English text governs.
