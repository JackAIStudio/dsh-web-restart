import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STATUS_ROUTE = '/dsh-web-restart/status'
export const RESTART_ROUTE = '/dsh-web-restart'

export function isLoopbackAddress(address) {
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
}

export function parseFlag(argv, name) {
  const key = `--${name}`
  const prefix = `${key}=`
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === key) {
      const value = argv[i + 1]
      if (typeof value === 'string' && value !== '' && !value.startsWith('-')) return value
      return null
    }
    if (typeof item === 'string' && item.startsWith(prefix)) {
      const value = item.slice(prefix.length)
      return value === '' ? null : value
    }
  }
  return null
}

export function parseListenPort(argv, env = {}) {
  const flag = parseFlag(argv, 'port')
  if (flag !== null && /^[0-9]+$/.test(flag)) return flag
  const url = typeof env.DSH_WEB_URL === 'string' ? env.DSH_WEB_URL.trim() : ''
  if (url !== '') {
    try {
      const parsed = new URL(url)
      if (parsed.port !== '') return parsed.port
    } catch {
      /* ignore malformed runtime URL */
    }
  }
  return null
}

export function parseListenHost(argv) {
  const flag = parseFlag(argv, 'host')
  return flag === null || flag === '' ? null : flag
}

export function childWebArgs(argv) {
  const idx = argv.findIndex((item, index) => index >= 2 && item === 'web')
  const rest = idx === -1 ? ['web'] : argv.slice(idx)
  const args = rest.slice()
  if (!args.includes('--no-open')) args.push('--no-open')
  return args
}

export function probeHosts(listenHost) {
  const hosts = []
  if (typeof listenHost === 'string' && listenHost !== '' && listenHost !== '0.0.0.0' && listenHost !== '::') {
    hosts.push(listenHost)
  }
  if (!hosts.includes('127.0.0.1')) hosts.push('127.0.0.1')
  if (!hosts.includes('::1')) hosts.push('::1')
  return hosts
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Boolean(error && error.code === 'EPERM')
  }
}

export function isPortOpen(port, host, timeoutMs = 400) {
  const n = Number(port)
  if (!Number.isInteger(n) || n <= 0 || n > 65535) return Promise.resolve(false)
  return new Promise((resolveOpen) => {
    const socket = net.connect({ port: n, host })
    const timer = setTimeout(() => {
      socket.destroy()
      resolveOpen(false)
    }, timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.end()
      resolveOpen(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      resolveOpen(false)
    })
  })
}

export async function anyPortOpen(port, hosts, probe = isPortOpen) {
  for (const host of hosts) {
    if (await probe(port, host)) return true
  }
  return false
}

export function dshHome(env = process.env) {
  const raw = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return raw === '' ? join(homedir(), '.dsh') : raw
}

export function helperLogPath(env = process.env) {
  return join(dshHome(env), 'dsh-web-restart.log')
}

export function parseHelperArgv(argv) {
  const out = {
    parentPid: null,
    port: null,
    host: null,
    bin: null,
    cwd: null,
    webArgs: [],
  }
  let i = 0
  if (argv[0] === 'helper') i = 1
  for (; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--') {
      out.webArgs = argv.slice(i + 1)
      break
    }
    const take = () => {
      i += 1
      return argv[i]
    }
    if (item === '--parent-pid') out.parentPid = Number(take())
    else if (typeof item === 'string' && item.startsWith('--parent-pid=')) out.parentPid = Number(item.slice(13))
    else if (item === '--port') out.port = take() || null
    else if (typeof item === 'string' && item.startsWith('--port=')) out.port = item.slice(7) || null
    else if (item === '--host') out.host = take() || null
    else if (typeof item === 'string' && item.startsWith('--host=')) out.host = item.slice(7) || null
    else if (item === '--bin') out.bin = take() || null
    else if (typeof item === 'string' && item.startsWith('--bin=')) out.bin = item.slice(6) || null
    else if (item === '--cwd') out.cwd = take() || null
    else if (typeof item === 'string' && item.startsWith('--cwd=')) out.cwd = item.slice(6) || null
  }
  if (typeof out.parentPid === 'number' && !Number.isInteger(out.parentPid)) out.parentPid = null
  if (out.port === '') out.port = null
  if (out.host === '') out.host = null
  if (out.bin === '') out.bin = null
  if (out.cwd === '') out.cwd = null
  return out
}

export function decideAfterParentGone({ portOpen, canSpawn }) {
  if (portOpen) return 'already-up'
  if (canSpawn) return 'spawn'
  return 'give-up'
}

function defaultLog(event, detail) {
  const line = `${new Date().toISOString()} ${event}${detail ? ` ${JSON.stringify(detail)}` : ''}\n`
  try {
    const path = helperLogPath()
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, line)
  } catch {
    /* logging must never block restart */
  }
}

function defaultSpawn(execPath, args, options) {
  const child = spawn(execPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
    cwd: options && options.cwd ? options.cwd : homedir(),
  })
  child.unref()
  return child.pid
}

export function defaultIo() {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
    isAlive: isProcessAlive,
    kill: (pid, signal) => {
      try {
        process.kill(pid, signal)
        return true
      } catch {
        return false
      }
    },
    isPortOpen,
    spawn: defaultSpawn,
    log: defaultLog,
  }
}

export async function runHelper(plan, io = defaultIo()) {
  const parentPid = plan.parentPid
  const port = plan.port
  const hosts = probeHosts(plan.host)
  const graceMs = plan.graceMs ?? 200
  const waitParentMs = plan.waitParentMs ?? 10000
  const killAfterMs = plan.killAfterMs ?? 8000
  const afterDeathMs = plan.afterDeathMs ?? 400
  const supervisorMs = plan.supervisorMs ?? 1600
  const canSpawn = Boolean(plan.execPath && plan.binPath && Array.isArray(plan.webArgs) && plan.webArgs[0] === 'web')

  io.log('helper-start', {
    parentPid,
    port,
    host: plan.host,
    bin: plan.binPath,
    canSpawn,
  })

  await io.sleep(graceMs)

  const started = io.now()
  if (parentPid && io.isAlive(parentPid)) io.kill(parentPid, 'SIGTERM')

  while (parentPid && io.isAlive(parentPid) && io.now() - started < waitParentMs) {
    if (io.now() - started >= killAfterMs) io.kill(parentPid, 'SIGKILL')
    await io.sleep(100)
  }

  await io.sleep(afterDeathMs)

  const probeUntil = io.now() + supervisorMs
  let portOpen = false
  while (true) {
    portOpen = port ? await anyPortOpen(port, hosts, io.isPortOpen) : false
    if (portOpen || io.now() >= probeUntil) break
    await io.sleep(150)
  }
  const action = decideAfterParentGone({ portOpen, canSpawn })
  io.log('helper-decide', { action, portOpen, parentAlive: parentPid ? io.isAlive(parentPid) : false })

  if (action === 'spawn') {
    const pid = io.spawn(plan.execPath, [plan.binPath, ...plan.webArgs], { cwd: plan.cwd })
    io.log('helper-spawn', { pid })
  }
  return action
}

export function helperPlanFromArgv(argv, execPath = process.execPath) {
  const parsed = parseHelperArgv(argv)
  return {
    parentPid: parsed.parentPid,
    port: parsed.port,
    host: parsed.host,
    execPath,
    binPath: parsed.bin,
    cwd: parsed.cwd,
    webArgs: parsed.webArgs.length > 0 ? parsed.webArgs : ['web', '--no-open'],
  }
}

export function currentRestartPlan(argv = process.argv, env = process.env) {
  return {
    parentPid: process.pid,
    port: parseListenPort(argv, env),
    host: parseListenHost(argv),
    execPath: process.execPath,
    binPath: argv[1],
    cwd: process.cwd(),
    webArgs: childWebArgs(argv),
  }
}

function isMain() {
  const entry = process.argv[1]
  if (typeof entry !== 'string' || entry === '') return false
  try {
    return fileURLToPath(import.meta.url) === resolve(entry)
  } catch {
    return false
  }
}

if (isMain() && process.argv[2] === 'helper') {
  runHelper(helperPlanFromArgv(process.argv.slice(2))).catch((error) => {
    defaultLog('helper-error', { error: error instanceof Error ? error.message : String(error) })
    process.exitCode = 1
  })
}
