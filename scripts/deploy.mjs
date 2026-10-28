#!/usr/bin/env node
// 构建站点并部署到 Cloudflare Workers
// 用法: node scripts/deploy.mjs [--env <file>] | [-e <file>]
// 默认使用 .env.production

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)

function pickEnvFile() {
  const eq = args.find(a => a.startsWith('--env='))
  if (eq) return eq.slice('--env='.length)
  const i = args.findIndex(a => a === '--env' || a === '-e')
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('-')) return args[i + 1]
  return '.env.production'
}

const envFile = pickEnvFile()
if (!existsSync(resolve(envFile))) {
  console.error(`[deploy] 找不到环境文件: ${envFile}`)
  process.exit(1)
}

// shell: true 以便在 Windows 上正确解析 .cmd 命令(nuxt/wrangler 均来自 PATH)
function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: true, ...opts })
  if (result.error) {
    console.error(`[deploy] 执行失败: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`[deploy] 使用环境文件: ${envFile}`)

run('nuxt', ['build', '--dotenv', envFile], {
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=8192'].filter(Boolean).join(' '),
  },
})

run('wrangler', ['deploy'])
