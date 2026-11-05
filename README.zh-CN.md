<div align="center">

# EasyTV Manage

**[EasyTV](https://easytv.ai) 运营后台 —— 开源的 AI 短剧创作平台。**

[![CI](https://github.com/easytv-ai/easytv-manage/actions/workflows/ci.yml/badge.svg)](https://github.com/easytv-ai/easytv-manage/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![License: Commercial](https://img.shields.io/badge/License-Commercial-orange.svg)](COMMERCIAL-LICENSE.zh-CN.md)
[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt.js&logoColor=white)](https://nuxt.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[English](README.md) · [简体中文](README.zh-CN.md) · [后端](https://github.com/easytv-ai/easytv-api) · [创作台](https://github.com/easytv-ai/easytv-web)

</div>

EasyTV Manage 是自托管 EasyTV 的运营后台：用户与团队、作品与审核、计费与模型定价、增长活动，以及后端的全部运行期设置。它是一个 Nuxt 4 单页应用，对接 [`easytv-api`](https://github.com/easytv-ai/easytv-api) 的 `/admin/*` 接口。

## 能管什么

| 领域 | 页面 |
| --- | --- |
| **人** | 用户（查询、身份、封禁）、团队与成员额度、渠道伙伴 |
| **内容** | 作品、精选成片、分类、轮播、技能、提示词、风格、主体、项目、资产、画布 |
| **社区** | 评论 / 举报 / 动态审核队列、公告、通知 |
| **钱** | 订单、充值、提现、流水、会员计划、积分包、模型定价、发票 |
| **增长** | 活动、邀请与签到规则、使用日志、数据看板 |
| **系统** | 站点、支付、模型网关、增长与发票设置（仅超级管理员） |

这里改的设置都存在后端 `setting` 表，无需重启即生效。

## 快速开始

需要 Node.js 22.5+ 与 [pnpm](https://pnpm.io) 10+（`corepack enable` 会安装 `package.json` 里锁定的版本）。

```bash
git clone https://github.com/easytv-ai/easytv-manage.git
cd easytv-manage
pnpm install
cp .env.example .env.development   # 把 NUXT_PUBLIC_API_BASE_URL 指向你的后端
pnpm dev                        # http://localhost:3006
```

用 `easytv-api` 首次启动创建的 `admin` 账号登录（`ROOT_USERNAME` / `ROOT_PASSWORD`）。没有后端时可用登录页上的演示账号浏览界面。

### 首次上线清单

1. **系统 → 网关**：填入兼容 New API 的网关地址与 Key，拉取模型清单并导入定价。
2. **系统 → 站点**：设置创作台公开地址，邀请链接与回调都用它。
3. **系统 → 支付**：如需售卖套餐或积分，开启微信支付 / 支付宝。
4. **模型定价**：按模型调整积分单价，创作台的成本预估读这里。

## 配置

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NUXT_PUBLIC_API_BASE_URL` | 是 | `easytv-api` 地址 |
| `NUXT_PUBLIC_STUDIO_URL` | 是 | 创作台（`easytv-web`）地址：顶栏「官网」、审核跳播放页、静态资源拼接 |
| `NUXT_PUBLIC_SITE_NAME` | 否 | 后台显示的站点名（默认 `EasyTV`） |

开发读 `.env.development`，生产构建读 `.env.production`，两者都不入库，以 `.env.example` 为准。

## 常用脚本

```bash
pnpm dev          # 开发服务器 :3006
pnpm build        # 生产构建（Cloudflare 预设）
pnpm typecheck    # vue-tsc（simple-git-hooks 推送前也会跑）
pnpm preview      # 构建 + wrangler dev
pnpm deploy       # node scripts/deploy.mjs [--env .env.production]
```

## 目录

```
app/
  api/           /admin/* 接口封装
  components/    页面共用的表格、抽屉、表单
  layouts/       控制台骨架（侧栏、顶栏）
  pages/         每个运营领域一个目录
  utils/         设置映射、媒体地址、格式化
i18n/locales/    zh、zh-TW、en
scripts/         deploy.mjs
```

## 部署

Nitro 预设是 `cloudflare_module`（`wrangler.jsonc`）：

```bash
cp .env.example .env.production
pnpm deploy
```

跑在 Node 主机时用 `NITRO_PRESET=node-server pnpm build` 构建，再 `node .output/server/index.mjs` 启动。

### Docker

每次推送 `master` 与每个版本标签都会向 GHCR 发布多架构镜像，所有 `NUXT_PUBLIC_*` 变量都可以在运行时设置：

```bash
docker run -d -p 3006:3006 \
  -e NUXT_PUBLIC_API_BASE_URL=https://api.example.com \
  -e NUXT_PUBLIC_STUDIO_URL=https://studio.example.com \
  ghcr.io/easytv-ai/easytv-manage:latest
```

[`easytv-api`](https://github.com/easytv-ai/easytv-api) 里的 `docker-compose.yml` 用 `docker compose --profile full up -d` 可以一次拉起整套服务。

## 参与贡献

欢迎用中文或英文提 Issue 和 PR。见 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md) 与 [CHANGELOG.md](CHANGELOG.md)。

## 相关项目

| 仓库 | 说明 |
| --- | --- |
| [easytv-api](https://github.com/easytv-ai/easytv-api) | Go 后端 |
| [easytv-web](https://github.com/easytv-ai/easytv-web) | 创作台 |
| [easytv-website](https://github.com/easytv-ai/easytv-website) | 项目官网 |

## 开源协议

EasyTV Manage 采用 **AGPL + 商业** 双许可：

| 你想… | 用这份 |
| --- | --- |
| 学习、修改或自建部署，并遵守 AGPL-3.0（把修改版作为网络服务提供给他人时，须公开对应源代码） | [GNU Affero GPL v3.0](LICENSE) |
| 做闭源产品，或以 SaaS / 白标托管修改版，且**不想**承担上述 AGPL 义务 | [商业许可协议](COMMERCIAL-LICENSE.zh-CN.md) |

仓库里的商业条款是模板，双方签署订单后才生效。写信到
[leida@easyapi.com](mailto:leida@easyapi.com)，主题加 `[LICENSE] easytv-manage`。
[English terms](COMMERCIAL-LICENSE.md) 是准据文本。
