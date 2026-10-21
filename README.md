# dsh-sound-notify

DeepSeek Harness（DSH）Web 客户端提示音插件：**主智能体 / 子智能体** × **完成 / 提问 / 审批 / 计划待审**，共 8 种情况各自独立配置音效与音量。声音由浏览器 Web Audio 实时合成，也可上传自己的音频文件；输入框旁一键静音。

> A per-scope (main agent / subagent) notification-sound plugin for the DeepSeek Harness web client. Six Web Audio presets plus custom clips, per-row volume, and a mute button.

**Last verified against DSH `0.2.1-rc.2` (2026-10-21).**

## 功能

| 情况 | 触发 |
|---|---|
| 任务完成 `done` | 一轮对话结束（运行 → 空闲） |
| 等待回答 `question` | Agent 提问（`pendingInteraction.kind === "question"`） |
| 等待审批 `approval` | 等待审批（`kind === "approval"`） |
| 计划待审 `plan` | 计划审阅（`kind === "plan-review"`） |

- **两种作用域**：主智能体（普通会话）默认发声；子智能体（`row.subagent != null` 的子会话）默认关闭，勾选后同一套 4 行 UI 独立配置。可以做到“听声音就知道是谁结束了”。
- **每行独立**：音效（6 个内置 + 静音 + 自定义音频）、音量 0–100%、试听、行内重置。
- **内置音效**：`chime` 上升双音、`beep` 双叮、`soft` 柔和三音、`drop` 水滴下滑、`marimba` 木琴三连、`alert` 警示三连。
- **上传音频**：≤ 256 KB，以 data URL 存本机 `localStorage`，不上传网络。
- 子会话、外部任务的状态变化默认不会打断你；可用 `Alt+点击` 快速静音。

## 安装

### 方式一：直接从 GitHub 安装（需要 pnpm 可拉取 git 仓库）

```sh
# 非 desktop profile 会自动把包加入 dsh.profile.bundles
dsh plugin --profile web add github:TungsticAcid/dsh-sound-notify
```

`desktop` profile 例外：CLI 只转发 pnpm，不代选 profile bundle，需要再手工把 `"dsh-sound-notify"` 加进 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles`。

### 方式二：克隆后本地安装（推荐用于改代码）

```sh
git clone https://github.com/TungsticAcid/dsh-sound-notify.git
cd dsh-sound-notify
node build.mjs                     # 重新生成 lib/（仓库已提交构建产物）
dsh plugin --profile web add "$PWD"          # Windows: dsh plugin --profile web add D:/path/to/dsh-sound-notify
```

`desktop` profile：

```sh
dsh plugin --profile desktop add link:D:/path/to/dsh-sound-notify
# 再把 "dsh-sound-notify" 加入 ~/.dsh/profiles/desktop/package.json 的 dsh.profile.bundles
```

安装后重启对应 DSH 进程；已打开页面请刷新一次（Ctrl+Shift+R）以加载新的 client bundle。

## 使用

- 输入框下方（composer dock，统计控件旁）的小喇叭：**点击打开设置面板**，**Alt+点击**快速静音/恢复。
- 面板上半部分是**主智能体**四行；下半部分是**子智能体**开关（默认关），勾选后展开子智能体的四行。
- 每行：音效下拉、`▶` 试听、音量滑块、`自定义音频…`、`重置`；底部 `恢复默认` 全部重置。
- 音频解锁：浏览器要求先有用户手势；页面加载后第一次点击/按键即可，Electron 桌面端通常无需。

### 页面控制台调试

```js
window.__dshSoundNotify.play('done');               // 主智能体
window.__dshSoundNotify.play('done', 'subagent');   // 子智能体
window.__dshSoundNotify.preview('approval');        // 忽略静音试听
window.__dshSoundNotify.getSettings();
window.__dshSoundNotify.setSettings(s);
window.__dshSoundNotify.setEnabled(false);
window.__dshSoundNotify.setSubagentEnabled(true);
window.__dshSoundNotify.reset();
window.__dshSoundNotify.effects;                    // 内置音效 id
```

### 配置存储

- 键：`dsh-sound-notify.settings`（JSON v2），仅存在当前浏览器。
- 会自动迁移早期版本的键：`@smartcatai/sound-notify.settings`、`@smartcatai/sound-notify.enabled`、`dsh-plugin-sound-notify.enabled`；静音状态继续镜像到两个旧 enabled 键，便于旧实例共存。
- 配置结构：

```json
{
  "version": 2,
  "enabled": true,
  "events": {
    "done":     { "effect": "chime", "volume": 0.85 },
    "question": { "effect": "beep",  "volume": 0.85 },
    "approval": { "effect": "alert", "volume": 0.9 },
    "plan":     { "effect": "soft",  "volume": 0.8 }
  },
  "subagent": { "enabled": false, "events": { "...": "same shape" } }
}
```

## 开发

```
src/client/index.ts     插件入口：Session 状态订阅、主/子作用域判定、情况映射、去重、页面调试句柄
src/client/settings.ts  v2 配置模型/校验/持久化/旧键迁移 + 可订阅 store
src/client/effects.ts   内置音效预设、Web Audio 合成、上传音频播放
src/client/ui.ts        composer dock 小喇叭 + <dialog> 设置面板
src/index.ts            Host 半侧：空实现 + 激活标记（profile 下 .sound-notify-applied.log）
build.mjs               esbuild：src/client/index.ts -> lib/client.js（包 __ModuleLoader__ 外壳）
                        src/index.ts        -> lib/index.js（ESM）
cordis.patch.yml        插入一个 Host 行
test/simulate.cjs       离线仿真（vm 沙箱模拟模块加载器/React/Web Audio/uiSession）
```

```sh
npm install --no-save esbuild@0.23.0   # 构建依赖（与提交的 lib/ 对齐）
node build.mjs                         # 生成 lib/（已提交，改 src 后需重跑）
node test/simulate.cjs                 # 离线仿真
```

`lib/` 是构建产物，但为了让 `dsh plugin add github:...` 免构建即可用，仓库里保留了最近一次构建。

## 故障排查

**输入框旁出现两个小喇叭**：页面里还挂着旧 bundle 的插件实例（HMR 只替换模块，旧 fiber 可能存活到整页刷新）。硬刷新一次（Ctrl+Shift+R）即可恢复为一个。自 0.3.1 起，插件在 dock 冲突时只在**同一个 id** 上逐级降低 priority 来遮蔽旧注册（`-1 → -2 → -5 → -10`），不再回退到第二个 id，所以正常情况下不会再出现第二个按钮。

## 已知边界

- 只在已打开且已解锁音频的页面发声；Host 本身不发声。
- 作用域判定依赖 Client 能看到该 Session 的目录行（`row.subagent`）；外部后端子代理通常没有执行状态，因此不会有提示音。
- 不发送系统级通知；后台 job 多次唤醒可能带来多次完赛音。
- 设置按浏览器/页面存储，不随账号同步。

## License

Apache-2.0，见 [LICENSE](./LICENSE)。
