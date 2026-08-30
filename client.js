window.__ModuleLoader__.load({
  id: 'dsh-web-restart',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const STATUS_ROUTE = '/dsh-web-restart/status'
    const RESTART_ROUTE = '/dsh-web-restart'
    const POLL_MS = 400
    const TIMEOUT_MS = 45000

    const css = [
      '.dwr{position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center}',
      '[class*="_footArea"]:has(.dwr-wide){flex-direction:row;align-items:center;gap:4px}',
      '[class*="_footArea"]:has(.dwr-wide) [class*="_settingsArea"]{flex:1 1 auto;width:auto;min-width:0}',
      '[class*="_footArea"]:has(.dwr-wide) [class*="_footerActions"]{order:2;flex:none;width:auto;align-items:center;justify-content:flex-end}',
      '.dwr-btn{appearance:none;position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:none;border-radius:50%;padding:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color 120ms ease,color 120ms ease,box-shadow 120ms ease}',
      '.dwr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-warn-primary)}',
      '.dwr-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}',
      '.dwr-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-2),0 0 0 4px var(--dsw-alias-brand-primary)}',
      '.dwr-btn:disabled{opacity:.55;cursor:default}',
      '.dwr-btn.is-open,.dwr-btn.is-busy{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-warn-primary)}',
      '.dwr-btn svg{display:block;flex:none}',
      '.dwr-overlay{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center}',
      '.dwr-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}',
      '.dwr-panel{position:relative;z-index:1;display:flex;flex-direction:column;gap:12px;width:min(440px,calc(100vw - 32px));box-sizing:border-box;padding:22px 22px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:20px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary)}',
      '.dwr-kicker{margin:0;color:var(--dsw-alias-state-warn-primary);font-size:12px;font-weight:600;letter-spacing:.04em;line-height:18px;text-transform:uppercase}',
      '.dwr-title{margin:0;font-size:18px;font-weight:600;line-height:26px}',
      '.dwr-body{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}',
      '.dwr-busy{margin:8px 0 0;color:var(--dsw-alias-state-warn-primary);font-size:13px;line-height:20px}',
      '.dwr-error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}',
      '.dwr-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}',
      '.dwr-action{appearance:none;display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}',
      '.dwr-action:hover:not(:disabled){background:var(--dsw-alias-button-floating-hover)}',
      '.dwr-action:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-2),0 0 0 4px var(--dsw-alias-brand-primary)}',
      '.dwr-action:disabled{opacity:.55;cursor:default}',
      '.dwr-action-danger{border-color:transparent;background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-on-error, #fff)}',
      '.dwr-action-danger:hover:not(:disabled){filter:brightness(1.05)}',
      '.dwr-wait{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 32px;border-radius:20px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);text-align:center}',
      '.dwr-wait-title{margin:0;font-size:16px;font-weight:600;line-height:24px}',
      '.dwr-wait-sub{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}',
      '@media (prefers-reduced-motion: reduce){.dwr-btn,.dwr-action{transition:none}}',
    ].join('')

    if (typeof document !== 'undefined') {
      const id = 'dsh-web-restart/ui.css'
      let tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(id) + ']')
      if (tag === null) {
        tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-web-restart'
        tag.dataset.pluginCss = id
        document.head.appendChild(tag)
      }
      tag.textContent = css
    }

    const copy = {
      zh: {
        trigger: '重启 Harness Web',
        kicker: '高危操作',
        title: '重启 DeepSeek Harness？',
        body: '这会关掉正在跑的 Web 宿主再拉起来。同一进程上的所有会话和任务都会中断，页面会暂时断开。无论现在有没有任务在跑，重启都是高危操作。',
        busy: (n) => n === 1 ? '当前至少有 1 个会话正在生成。' : `当前至少有 ${n} 个会话正在生成。`,
        cancel: '取消',
        confirm: '仍然重启',
        restarting: '正在重启',
        restartingSub: '页面会暂时断开，起来后自动刷新。',
        failed: '重启失败',
        timeout: '等了太久还没起来。请到终端手动重启宿主。',
        remote: '只能在运行 dsh web 的这台机器上重启。',
      },
      en: {
        trigger: 'Restart Harness Web',
        kicker: 'Destructive',
        title: 'Restart DeepSeek Harness?',
        body: 'This stops the running Web host and brings it back up. Every session and task on this process will be interrupted, and the page will disconnect. Restart is always dangerous, whether or not anything is running right now.',
        busy: (n) => n === 1 ? 'At least 1 session is generating right now.' : `At least ${n} sessions are generating right now.`,
        cancel: 'Cancel',
        confirm: 'Restart anyway',
        restarting: 'Restarting',
        restartingSub: 'The page will drop; it reloads when the host is back.',
        failed: 'Restart failed',
        timeout: 'The host did not come back in time. Restart it from a terminal.',
        remote: 'Restart is only available on the machine that is running dsh web.',
      },
    }

    function locale() {
      const lang = typeof document !== 'undefined' ? document.documentElement.lang : ''
      return String(lang).toLowerCase().startsWith('en') ? copy.en : copy.zh
    }

    function useSnapshot(store) {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        if (!store || typeof store.subscribe !== 'function') return undefined
        return store.subscribe(() => bump((n) => n + 1))
      }, [store])
      return store && typeof store.getSnapshot === 'function' ? store.getSnapshot() : undefined
    }

    function runningCount(snap) {
      const items = snap && Array.isArray(snap.items)
        ? snap.items
        : (Array.isArray(snap) ? snap : [])
      let n = 0
      for (const item of items) {
        if (item && item.running === true) n += 1
      }
      return n
    }

    function IconRestart({ size = 18 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      },
        h('path', {
          d: 'M13.4 8A5.4 5.4 0 1 1 11.8 4.1',
          stroke: 'currentColor',
          strokeWidth: 1.35,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M13.4 2.1v2.7h-2.7',
          stroke: 'currentColor',
          strokeWidth: 1.35,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
    }

    async function readJson(url, init) {
      const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        ...init,
        headers: { accept: 'application/json', ...(init && init.headers) },
      })
      let value
      try {
        value = await response.json()
      } catch {
        value = null
      }
      return { response, value }
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    async function waitForNewBoot(previousBootId, t) {
      const started = Date.now()
      while (Date.now() - started < TIMEOUT_MS) {
        await sleep(POLL_MS)
        try {
          const { response, value } = await readJson(STATUS_ROUTE, { method: 'GET' })
          if (response.ok && value && value.ok === true && typeof value.bootId === 'string' && value.bootId !== previousBootId) {
            return true
          }
        } catch {
          /* host is down; keep polling */
        }
      }
      throw new Error(t.timeout)
    }

    function RestartButton({ wide, sessions }) {
      const t = locale()
      const running = runningCount(useSnapshot(sessions && sessions.list))
      const cancelRef = React.useRef(null)
      const [open, setOpen] = React.useState(false)
      const [phase, setPhase] = React.useState('idle')
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        if (!open || phase !== 'confirm') return undefined
        const id = window.requestAnimationFrame(() => {
          if (cancelRef.current) cancelRef.current.focus()
        })
        return () => window.cancelAnimationFrame(id)
      }, [open, phase])

      React.useEffect(() => {
        if (!open || phase !== 'confirm') return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
            setError('')
          }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [open, phase])

      async function confirmRestart() {
        if (phase === 'restarting') return
        setPhase('restarting')
        setError('')
        try {
          const before = await readJson(STATUS_ROUTE, { method: 'GET' })
          const previousBootId = before.value && typeof before.value.bootId === 'string' ? before.value.bootId : ''
          const posted = await readJson(RESTART_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ confirm: true }),
          })
          if (!posted.response.ok || !posted.value || posted.value.ok !== true) {
            const code = posted.value && posted.value.code
            throw new Error(code === 'remote-not-supported' ? t.remote : ((posted.value && posted.value.error) || t.failed))
          }
          await waitForNewBoot(posted.value.bootId || previousBootId, t)
          window.location.reload()
        } catch (err) {
          setPhase('confirm')
          setError(err instanceof Error ? err.message : t.failed)
        }
      }

      const dialog = open
        ? ReactDOM.createPortal(
          h('div', { className: 'dwr-overlay', role: 'presentation' },
            h('div', {
              className: 'dwr-mask',
              onClick: phase === 'restarting' ? undefined : () => {
                setOpen(false)
                setError('')
              },
            }),
            phase === 'restarting'
              ? h('div', { className: 'dwr-wait', role: 'status', 'aria-live': 'polite' },
                h('p', { className: 'dwr-wait-title' }, t.restarting),
                h('p', { className: 'dwr-wait-sub' }, t.restartingSub),
              )
              : h('div', {
                className: 'dwr-panel',
                role: 'alertdialog',
                'aria-modal': 'true',
                'aria-labelledby': 'dwr-title',
                'aria-describedby': 'dwr-body',
              },
                h('p', { className: 'dwr-kicker' }, t.kicker),
                h('h2', { className: 'dwr-title', id: 'dwr-title' }, t.title),
                h('p', { className: 'dwr-body', id: 'dwr-body' }, t.body),
                running > 0 ? h('p', { className: 'dwr-busy' }, t.busy(running)) : null,
                error ? h('p', { className: 'dwr-error', role: 'alert' }, error) : null,
                h('div', { className: 'dwr-actions' },
                  h('button', {
                    ref: cancelRef,
                    type: 'button',
                    className: 'dwr-action',
                    onClick: () => {
                      setOpen(false)
                      setError('')
                    },
                  }, t.cancel),
                  h('button', {
                    type: 'button',
                    className: 'dwr-action dwr-action-danger',
                    onClick: () => { void confirmRestart() },
                  }, t.confirm),
                ),
              ),
          ),
          document.body,
        )
        : null

      return h('div', { className: wide === false ? 'dwr' : 'dwr dwr-wide' },
        h('button', {
          type: 'button',
          className: 'dwr-btn' + (open ? ' is-open' : '') + (phase === 'restarting' ? ' is-busy' : ''),
          title: t.trigger,
          'aria-label': t.trigger,
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          disabled: phase === 'restarting',
          onClick: () => {
            setOpen(true)
            setPhase('confirm')
            setError('')
          },
        }, h(IconRestart, { size: 18 })),
        dialog,
      )
    }

    const inject = ['slots', 'sessions']

    function apply(ctx) {
      ctx.slots.inject('sidebar.footer.action', () => {
        let dispose
        try {
          dispose = ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'dsh-web-restart',
            order: -100,
          }, (props) => h(RestartButton, {
            wide: props && props.wide,
            sessions: ctx.sessions,
          }))
        } catch {
          dispose = undefined
        }
        return () => { if (dispose) dispose() }
      })
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})
