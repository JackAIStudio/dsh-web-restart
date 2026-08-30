# dsh-web-restart

侧栏左下角（和设置同一排）一颗重启图标。点下去**一定**先弹出警告，不管现在有没有会话在跑：重启会杀掉正在跑的 `dsh web` 宿主，同一进程上的所有会话和任务都会断。

确认之后：

1. 只接受来自 loopback 的请求（远程/公网入口不能重启）
2. 拉起一个脱离宿主的 helper
3. helper 结束当前进程；若已有 supervisor（例如 KeepAlive 的 LaunchAgent）先把端口抢回来，就不再另起一份
4. 否则用当前进程的 `node` + `dsh` 入口，带上原来的 `web --port … --no-open` 再拉起来
5. 页面等到新进程就绪后自动刷新

不调用某台机器上的 `dsh-web` 包装脚本，也不写死端口。

## 安装

```sh
# 开发机
dsh plugin --profile web add link:$HOME/Documents/dshspace/plugins/dsh-web-restart

# 新电脑（仓库推送之后）
dsh plugin --profile web add github:JackAIStudio/dsh-web-restart
```

装完需要重启 `dsh web` 才生效。**不要自己重启正在跑的进程**；告诉用户。第一次装这个插件，还是得在终端里重启一次——之后就可以点按钮。
