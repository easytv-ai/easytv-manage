# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `Dockerfile` (Node server preset, runtime-configurable `NUXT_PUBLIC_*`) and multi-arch images on GHCR.
- `SUPPORT.md`, release-notes categories (`.github/release.yml`), label sync, stale bot, Conventional Commits PR-title check and OpenSSF Scorecard workflow.
- Open-source governance: AGPL-3.0 license, contributing guide, code of
  conduct, security policy, issue and pull request templates, Dependabot and
  GitHub Actions CI.
- `pnpm test` alias for the type check so CI and hooks share one command.

### Changed

- "Official site" links, review → player jumps and studio asset URLs read `NUXT_PUBLIC_STUDIO_URL` instead of a hard-coded easytv.ai domain.
- Single package manager (pnpm, `pnpm-lock.yaml`); removed `yarn.lock` and IDE project files from git. Node 22.5+ required, matching the other EasyTV front ends.
- README rewritten for operators and contributors (English + 简体中文).

[Unreleased]: https://github.com/easytv-ai/easytv-manage/commits/master
