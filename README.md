# EasyTV 管理后台

EasyTV AI 视频创作平台的运营后台，基于 Nuxt 4 + Nuxt UI。

覆盖用户、作品、社区审核、计费、模型定价和系统设置，页面直连 `/admin/*`。

## 技术栈

- Nuxt 4（SPA，`ssr: false`）
- Vue 3 + TypeScript
- @nuxt/ui + Tailwind CSS 4
- @nuxtjs/i18n（简体 / 繁体 / 英文）
- Cloudflare Workers 部署

## 开发

```bash
yarn install
yarn dev
```

本地默认端口：`3006`。

演示账号（接口不可用时可用）：`admin@easytv.demo` / `123456`。

## 页面

| 路由 | 说明 |
|------|------|
| `/login` | 登录 |
| `/user` | 用户列表、批量查询、身份管理、封禁 |
| `/team` | 团队额度与成员月度上限 |
| `/subject` | 主体库查看与违规删除 |
| `/work` | 作品列表、语种筛选、上下架和删除 |
| `/showcase` | 精选成片、分类和上下架 |
| `/skill` | Agent Skill 模板 |
| `/banner` | 创作台首页轮播 |
| `/community-audit` | 评论、举报和动态审核 |
| `/project` | 视频 / 画布项目与回收站 |
| `/asset` | 素材资产与回收站 |
| `/canvas` | 画布草稿和公开状态 |
| `/order` | 会员订单 |
| `/recharge` | 支付渠道充值记录 |
| `/withdraw` | 提现审核与打款 |
| `/bill` | 全站资金流水 |
| `/category` | 成片 / Skill 分类 |
| `/notice` | 站内公告 |
| `/system` | 站点、支付、网关、增长与发票（仅超级管理员） |

侧栏里的其余页面（数据看板、创作指标、渠道伙伴、任务、套餐、积分、模型定价、提示词、风格、通知、活动、使用日志）与上表同一套列表交互。

## 构建与部署

```bash
yarn build
yarn deploy
```
