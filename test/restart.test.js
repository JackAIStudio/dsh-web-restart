import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { describe, it } from 'node:test'
import {
  anyPortOpen,
  childWebArgs,
  decideAfterParentGone,
  findLaunchdLabel,
  helperPlanFromArgv,
  isLaunchdManaged,
  isLoopbackAddress,
  kickstartLaunchd,
  launchdRestartPlan,
  parseHelperArgv,
  parseListenHost,
  parseListenPort,
  probeHosts,
  runHelper,
} from '../restart.js'

describe('isLoopbackAddress', () => {
  it('accepts IPv4, IPv6, and IPv4-mapped loopback', () => {
    assert.equal(isLoopbackAddress('127.0.0.1'), true)
    assert.equal(isLoopbackAddress('::1'), true)
    assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  })

  it('rejects LAN and missing addresses', () => {
    assert.equal(isLoopbackAddress('192.168.1.8'), false)
    assert.equal(isLoopbackAddress('10.0.0.2'), false)
    assert.equal(isLoopbackAddress(undefined), false)
  })
})

describe('parseListenPort', () => {
  it('reads --port and --port=', () => {
    assert.equal(parseListenPort(['node', 'bin.js', 'web', '--port', '3080']), '3080')
    assert.equal(parseListenPort(['node', 'bin.js', 'web', '--port=4100']), '4100')
  })

  it('falls back to DSH_WEB_URL and otherwise returns null', () => {
    assert.equal(
      parseListenPort(['node', 'bin.js', 'web'], { DSH_WEB_URL: 'http://127.0.0.1:3099/' }),
      '3099',
    )
    assert.equal(parseListenPort(['node', 'bin.js', 'web'], {}), null)
  })
})

describe('parseListenHost / childWebArgs', () => {
  it('reads --host when present', () => {
    assert.equal(parseListenHost(['web', '--host', '127.0.0.1', '--port', '3080']), '127.0.0.1')
    assert.equal(parseListenHost(['web', '--no-open']), null)
  })

  it('keeps web flags and always adds --no-open', () => {
    assert.deepEqual(
      childWebArgs(['node', 'bin.js', 'web', '--port', '3080']),
      ['web', '--port', '3080', '--no-open'],
    )
    assert.deepEqual(
      childWebArgs(['node', 'bin.js', 'web', '--port', '3080', '--no-open']),
      ['web', '--port', '3080', '--no-open'],
    )
  })
})

describe('probeHosts / decideAfterParentGone', () => {
  it('probes the listen host plus loopback', () => {
    assert.deepEqual(probeHosts('192.168.1.8'), ['192.168.1.8', '127.0.0.1', '::1'])
    assert.deepEqual(probeHosts('0.0.0.0'), ['127.0.0.1', '::1'])
    assert.deepEqual(probeHosts(null), ['127.0.0.1', '::1'])
  })

  it('prefers an already-up supervisor over spawning', () => {
    assert.equal(decideAfterParentGone({ portOpen: true, canSpawn: true }), 'already-up')
    assert.equal(decideAfterParentGone({ portOpen: false, canSpawn: true }), 'spawn')
    assert.equal(decideAfterParentGone({ portOpen: false, canSpawn: false }), 'give-up')
  })
})

describe('parseHelperArgv', () => {
  it('reads flags and web args after --', () => {
    const parsed = parseHelperArgv([
      'helper',
      '--parent-pid', '99',
      '--port', '3080',
      '--bin', '/opt/dsh/bin.js',
      '--cwd', '/tmp',
      '--',
      'web', '--port', '3080', '--no-open',
    ])
    assert.equal(parsed.parentPid, 99)
    assert.equal(parsed.port, '3080')
    assert.equal(parsed.bin, '/opt/dsh/bin.js')
    assert.deepEqual(parsed.webArgs, ['web', '--port', '3080', '--no-open'])
  })

  it('builds a helper plan from argv', () => {
    const plan = helperPlanFromArgv(['helper', '--parent-pid', '3', '--bin', '/dsh.js', '--', 'web'], '/usr/bin/node')
    assert.equal(plan.execPath, '/usr/bin/node')
    assert.equal(plan.parentPid, 3)
    assert.deepEqual(plan.webArgs, ['web'])
  })
})

describe('anyPortOpen', () => {
  it('detects a bound loopback port', async () => {
    const server = createServer()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    try {
      assert.equal(await anyPortOpen(port, ['127.0.0.1']), true)
      assert.equal(await anyPortOpen(port + 1, ['127.0.0.1']), false)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})

describe('runHelper', () => {
  function fakeIo(state) {
    return {
      now: () => state.now,
      sleep: async (ms) => { state.now += ms },
      isAlive: (pid) => state.alive.has(pid),
      kill: (pid, signal) => {
        state.signals.push([pid, signal])
        if (signal === 'SIGKILL' || state.dieOnTerm) state.alive.delete(pid)
        return true
      },
      isPortOpen: async () => state.portOpen,
      spawn: (execPath, args) => {
        state.spawned.push({ execPath, args })
        return 7
      },
      log: () => {},
    }
  }

  it('SIGTERMs the parent and skips spawn when a supervisor already rebound the port', async () => {
    const state = {
      now: 0,
      alive: new Set([11]),
      signals: [],
      spawned: [],
      portOpen: true,
      dieOnTerm: true,
    }
    const action = await runHelper({
      parentPid: 11,
      port: '3080',
      execPath: '/usr/bin/node',
      binPath: '/opt/dsh.js',
      webArgs: ['web', '--no-open'],
      graceMs: 10,
      afterDeathMs: 10,
      supervisorMs: 0,
      waitParentMs: 1000,
      killAfterMs: 800,
    }, fakeIo(state))
    assert.equal(action, 'already-up')
    assert.deepEqual(state.signals, [[11, 'SIGTERM']])
    assert.equal(state.spawned.length, 0)
  })

  it('spawns the original web argv when the port stays down', async () => {
    const state = {
      now: 0,
      alive: new Set([11]),
      signals: [],
      spawned: [],
      portOpen: false,
      dieOnTerm: true,
    }
    const action = await runHelper({
      parentPid: 11,
      port: '4100',
      execPath: '/usr/bin/node',
      binPath: '/opt/dsh.js',
      cwd: '/tmp',
      webArgs: ['web', '--port', '4100', '--no-open'],
      graceMs: 10,
      afterDeathMs: 10,
      supervisorMs: 0,
    }, fakeIo(state))
    assert.equal(action, 'spawn')
    assert.equal(state.spawned.length, 1)
    assert.deepEqual(state.spawned[0].args, ['/opt/dsh.js', 'web', '--port', '4100', '--no-open'])
  })

  it('escalates to SIGKILL if the parent ignores SIGTERM', async () => {
    const state = {
      now: 0,
      alive: new Set([11]),
      signals: [],
      spawned: [],
      portOpen: false,
      dieOnTerm: false,
    }
    await runHelper({
      parentPid: 11,
      port: '3080',
      execPath: '/usr/bin/node',
      binPath: '/opt/dsh.js',
      webArgs: ['web', '--no-open'],
      graceMs: 0,
      afterDeathMs: 0,
      waitParentMs: 300,
      killAfterMs: 150,
      supervisorMs: 0,
    }, fakeIo(state))
    assert.ok(state.signals.some((row) => row[1] === 'SIGKILL'))
  })
})

describe('launchd 感知', () => {
  // 背景：本机用 LaunchAgent（KeepAlive=true）托管 `dsh web`。
  // 如果插件还自己 spawn 一个新进程，两者会抢同一个端口 →
  // EADDRINUSE → launchd 再拉起 → 无限重启（实测日志里出现过两万多次）。
  // 所以「发现 launchd 托管就必须让路」是这套逻辑的核心不变量。

  it('认得出托管 dsh web 的那个 LaunchAgent', () => {
    const label = findLaunchdLabel(['node', '/usr/local/bin/dsh', 'web', '--port', '3080', '--no-open'])
    // 这台机器上确实装了这个 LaunchAgent；没装则跳过（其他机器上可能没有）
    if (label === null) return
    assert.equal(typeof label, 'string')
    assert.ok(label.length > 0, 'label 不能是空串')
  })

  it('端口对不上就不认（避免误判成别的服务）', () => {
    const label = findLaunchdLabel(['node', '/usr/local/bin/dsh', 'web', '--port', '59999', '--no-open'])
    assert.equal(label, null, '端口不匹配时必须返回 null')
  })

  it('命令对不上就不认', () => {
    const label = findLaunchdLabel(['node', '/somewhere/else/tool', 'web', '--port', '3080', '--no-open'])
    assert.equal(label, null, '不是 dsh 时必须返回 null')
  })

  it('isLaunchdManaged 对空 label 一律返回 false', () => {
    assert.equal(isLaunchdManaged(null), false)
    assert.equal(isLaunchdManaged(''), false)
    assert.equal(isLaunchdManaged(undefined), false)
  })

  it('isLaunchdManaged 对不存在的 label 返回 false（不能抛错）', () => {
    assert.equal(isLaunchdManaged('com.jkw.definitely-not-a-real-service-xyz'), false)
  })

  it('kickstartLaunchd 对空 label 返回失败而不是抛错', () => {
    const r = kickstartLaunchd(null)
    assert.equal(r.ok, false)
    assert.ok(typeof r.error === 'string' && r.error.length > 0)
  })

  it('launchdRestartPlan 在没有 launchd 时返回 null（回落到 helper）', () => {
    const plan = launchdRestartPlan(['node', '/usr/local/bin/dsh', 'web', '--port', '59999', '--no-open'])
    assert.equal(plan, null)
  })

  it('有 launchd 时给出的 target 形如 gui/<uid>/<label>', () => {
    const plan = launchdRestartPlan(['node', '/usr/local/bin/dsh', 'web', '--port', '3080', '--no-open'])
    if (plan === null) return
    assert.match(plan.target, /^gui\/\d+\/.+$/)
    assert.equal(plan.label, plan.target.split('/').slice(2).join('/'))
  })
})
