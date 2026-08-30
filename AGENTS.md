# 运行宿主

本插件跟的是 DSH 宿主（跑 `dsh web` 的那台机器），不是当前对话所在的 Mac。

一等公民：macOS 桌面、Windows 桌面、Linux（含无 GUI 的云主机）。

改代码时：

- 不要把当前会话的 `/Users/...`、`~/Documents`、`127.0.0.1:3080`、`open` / `pbcopy` / `osascript` 写进产品逻辑
- `process.platform` 只分 `win32` 与 POSIX；没有 Darwin API 就不要写 `darwin` 分支
- 路径走 `node:path` / `os.homedir()`；Linux 大小写敏感
- 重启接口的 loopback-only 是安全边界，不是「产品只跑在个人 PC」
- 不要去调某台 Mac 上的 `dsh-web` 包装脚本或 LaunchAgent 标签；用当前进程的 `execPath` + `argv` 复原 `dsh web`
- 端口、监听地址从进程 argv / `DSH_WEB_URL` 读，不要写死 3080

给人看的安装说明在 `README.zh.md`。不要把某台云的 IP、SSH 或盘符写进本文件。
