import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { describe, it } from 'node:test'
import {
  anyPortOpen,
  childWebArgs,
  decideAfterParentGone,
  helperPlanFromArgv,
  isLoopbackAddress,
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
