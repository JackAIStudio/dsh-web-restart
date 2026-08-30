import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import {
  RESTART_ROUTE,
  STATUS_ROUTE,
  currentRestartPlan,
  isLoopbackAddress,
} from './restart.js'

export const name = 'dsh-web-restart'
export const inject = ['webServer']

const BOOT_ID = `${process.pid}-${Date.now()}`
const HELPER = fileURLToPath(new URL('./restart.js', import.meta.url))
const BODY_LIMIT = 2048

function sendJson(res, statusCode, value) {
  const body = JSON.stringify(value)
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', String(Buffer.byteLength(body)))
  res.end(body)
}

function rejectUnlessLocal(req, res) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) {
    sendJson(res, 403, {
      ok: false,
      code: 'remote-not-supported',
      error: '重启只能在运行 dsh web 的这台机器上操作。',
    })
    return true
  }
  return false
}

async function readJsonBody(req, limit = BODY_LIMIT) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      const error = new Error('payload too large')
      error.code = 'too-large'
      throw error
    }
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (raw === '') return {}
  return JSON.parse(raw)
}

function statusPayload() {
  const plan = currentRestartPlan()
  return {
    ok: true,
    bootId: BOOT_ID,
    pid: process.pid,
    port: plan.port,
  }
}

function spawnHelper(plan) {
  if (typeof plan.binPath !== 'string' || plan.binPath === '') {
    throw new Error('cannot locate the dsh entry to respawn')
  }
  const args = [
    HELPER,
    'helper',
    '--parent-pid', String(process.pid),
    '--bin', plan.binPath,
  ]
  if (plan.cwd) args.push('--cwd', plan.cwd)
  if (plan.port) args.push('--port', String(plan.port))
  if (plan.host) args.push('--host', String(plan.host))
  args.push('--', ...plan.webArgs)

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
    cwd: plan.cwd,
  })
  child.unref()
  if (typeof child.pid !== 'number' || child.pid <= 0) {
    throw new Error('failed to spawn restart helper')
  }
  return child.pid
}

function registerExact(ctx, webServer, path, handler, label) {
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path,
    handler,
  }), label)
}

export function apply(ctx) {
  ctx.inject(['webServer'], (web) => {
    const webServer = web.get('webServer')

    registerExact(web, webServer, STATUS_ROUTE, (req, res) => {
      if (rejectUnlessLocal(req, res)) return
      if (req.method !== 'GET') {
        res.setHeader('allow', 'GET')
        sendJson(res, 405, { ok: false, code: 'method', error: 'Method not allowed.' })
        return
      }
      sendJson(res, 200, statusPayload())
    }, 'dsh-web-restart/status')

    registerExact(web, webServer, RESTART_ROUTE, async (req, res) => {
      if (rejectUnlessLocal(req, res)) return
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        sendJson(res, 405, { ok: false, code: 'method', error: 'Method not allowed.' })
        return
      }
      try {
        const body = await readJsonBody(req)
        if (body.confirm !== true) {
          sendJson(res, 400, {
            ok: false,
            code: 'confirm-required',
            error: '重启需要显式确认。',
          })
          return
        }
        const plan = currentRestartPlan()
        const helperPid = spawnHelper(plan)
        sendJson(res, 202, {
          ok: true,
          scheduled: true,
          bootId: BOOT_ID,
          helperPid,
          port: plan.port,
        })
      } catch (error) {
        if (error && error.code === 'too-large') {
          sendJson(res, 413, { ok: false, code: 'too-large', error: '请求过大。' })
          return
        }
        if (error instanceof SyntaxError) {
          sendJson(res, 400, { ok: false, code: 'malformed', error: '请求不是合法 JSON。' })
          return
        }
        sendJson(res, 500, {
          ok: false,
          code: 'internal',
          error: error instanceof Error ? error.message : '无法安排重启。',
        })
      }
    }, 'dsh-web-restart')
  })
}
