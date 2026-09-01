# dsh-web-restart 仓库与 Agent 维护规范（AGENTS.md）

> 本文件是本插件的**代码架构与维护硬性规范**。
> 所有 AI Agent 与人类贡献者在修改、重构或新增功能时，**必须严格遵守以下规则**。

---

## 1. 零单文件膨胀原则（Strict File Size Limits）

1. **单文件行数上限**：
   - 任何单个源码文件严禁超过 **300 行**。
   - 禁止在现有文件末尾无脑追加代码，新增独立逻辑必须抽离到子模块。
2. **前后端职责与模块划分**：
   - **后端路由与装配 (`index.js`)**：保持极简（< 150 行），仅做 Cordis WebServer 路由注册、Loopback 安全边界检查与参数校验。
   - **核心重启逻辑 (`restart.js`)**：专职负责当前进程 `execPath` 与 `argv` 的解析、生成跨平台独立子进程（Detached Helper）、调度杀死旧进程并唤起新进程。
   - **前端交互组件 (`client.js`)**：专职负责侧栏底部重启按钮渲染与强制高危确认弹窗（Danger Modal），禁止塞入后端逻辑。

---

## 2. 运行宿主与跨平台铁律

本插件跟的是 DSH 宿主（跑 `dsh web` 的那台机器），不是当前对话所在的 Mac。

一等公民：macOS 桌面、Windows 桌面、Linux（含无 GUI 的云主机）。

改代码时：

- **禁止硬编码环境与路径**：不要把当前会话的 `/Users/...`、`~/Documents`、`127.0.0.1:3080`、`open` / `pbcopy` / `osascript` 写进产品逻辑。
- `process.platform` 只分 `win32` 与 POSIX；没有 Darwin API 就不要写 `darwin` 分支。
- 路径走 `node:path` / `os.homedir()`；Linux 大小写敏感。
- 重启接口的 loopback-only 是安全边界，不是「产品只跑在个人 PC」。
- **禁止硬绑定 LaunchAgent/Systemd 别名**：不要去调某台 Mac 上的 `dsh-web` 包装脚本或 LaunchAgent 标签；统一用当前进程的 `execPath` + `argv` 独立 respawn。
- 端口、监听地址从进程 argv / `DSH_WEB_URL` 读，不要写死 3080。

---

## 3. 原生 ESM 与修改后自检

1. **零构建原生 ESM**：所有模块引用必须显式带 `.js` 扩展名。
2. **修改后门禁自检**：
   修改任何代码后，必须在插件根目录下运行以下命令：
   ```bash
   node --test test/*.test.js
   find . -name "*.js" -not -path "*/.*" -not -path "*/node_modules/*" -exec node --check {} +
   ```
