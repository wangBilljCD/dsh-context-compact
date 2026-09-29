# dsh-context-compact

给 DeepSeek Harness 的可配置上下文压缩插件：**达到阈值后，自动把最旧的上下文压缩成一条摘要**，对所有会话生效，并且开关、阈值、压缩比都能在 **设置 → 插件 → 插件配置** 里改，不需要重启、不需要改配置文件。

装上它之后，设置页里会出现一张「上下文压缩」卡片：

| 控件 | 含义 | 默认 |
|---|---|---|
| 启用自动压缩 | 关掉后交回 Harness 内置策略（占用 80% 触发、保留最近 16%），而不是停止压缩 | 开 |
| 压缩阈值（%） | 聊天输入框右下角显示的**上下文占用**达到该百分比时触发 | 65 |
| 旧上下文压缩比（%） | 每次从**最旧的一端**压缩掉「可压缩区间」的百分比 | 25 |

## 它怎么工作

Harness 里「什么时候压缩、压哪一段」是一个可选能力 seam（`ctx.compaction`），默认由 `@deepseek-ai/dsh-compaction-basic` 提供。本插件替换这个提供方，只改两件事：

- **触发条件**读的是会话的 `contextPressure` 投影 —— 也就是聊天输入框右下角那个百分比本身，所以「看到 65% 就压」和配置里的 65 永远是同一个数，切换模型后也不会因为窗口容量过期而对不上。
- **选取范围**从最旧一端按比例截取（跳过开头的 `system/message`，两端都退到不切断 tool call/result 配对的边界），而不是内置策略的「按 token 预算保留最近的尾巴」。

其余全部继承内置引擎：摘要调用、持久化事务与锁、`/compact` 手动命令、以及**上下文超限时的溢出恢复**（`agent/request-error`）。摘要上限默认 16384 token，避免大区间摘要被截断成不完全的检查点。

当光标位置读不到投影、或开关关闭时，本插件把该次判断交回内置策略执行——**关掉开关不会让会话失去压缩保护**。

## 安装

作为组合包（bundle）安装进某个 profile：

```sh
# 从 git（源码即产物，仓库里已带构建好的 lib/*.js，不需要 prepare/构建授权）
dsh plugin --profile web add github:<you>/dsh-context-compact

# 或从本地目录
dsh plugin --profile web add ./dsh-context-compact
```

安装后 profile 的 `dsh.profile.bundles` 会多出 `dsh-context-compact`，它的 `cordis.patch.yml` 会：

1. 在**宿主层**插入本插件的行（因此对所有 agent preset 的会话都生效）；
2. 把 `compaction-basic` 行 `disabled: true`。

第 2 步是必须的：本插件的引擎继承自 `BasicCompactionEngine`，两者都注册同名服务 `compaction`。Cordis 不会为此报错——每个插件行有自己的作用域，两个引擎都会激活，于是「某个 consumer 拿到哪一个」就取决于组合顺序；把内置行禁用掉，本插件才是唯一提供方，替换才是确定的。

实测（0.1.6-alpha.1）：故意让本插件导入失败时，启动会打印 `dsh: warning: 1 entry did not activate` 与 `dsh-context-compact (dsh-context-compact): failed to import`；正常安装时没有任何这类警告。

> 如果你之前用着 `@local/context-compact`（本工作区里那个 bundle），请先把它的 bundle 从 profile 里移除：两个引擎抢同一个 `compaction` 服务，而且它插入的行 id 与本插件不同、不会互相覆盖。本插件用 `triggerPercent` / `compactPercent`（百分比），旧 bundle 用 `triggerRatio` / `compactRatio`（小数）。

重启 `dsh web` 后生效（组合包列表是启动时读的）。

### 只用配置文件

不想用设置页也行，把策略写在 profile 的 `cordis.patch.yml` 里覆盖同一行：

```yaml
- id: dsh-context-compact
  config:
    enabled: true
    triggerPercent: 70
    compactPercent: 30
    maxTokens: 16384
```

组合层是 `base`，设置页写入的用户层盖在它上面；在设置页点「恢复默认」就是清掉用户层、回到这里。

## 兼容性

- 需要在设置页出现卡片：`dsh ≥ 0.1.6-alpha.1`（宿主侧的 `settings.installSection` + 浏览器侧的 `settings.plugin.item` 卡片槽位）。实测于 0.1.6-alpha.1。
- 更早的版本上，插件仍会正常压缩，只是没有设置页卡片：宿主找不到 `installSection` 时会跳过设置注册，行配置就是全部策略。
- 浏览器半侧只依赖模块表里的 React，通过 `settingsScope` 服务读写设置，因此不依赖任何私有 UI 包，也不需要自建 HTTP bridge。

## 已知限制

- **压缩比按 surface 节点计数，不按 token 计价**。「最旧的 25%」是节点占比；如果最旧那一段恰好都是短消息，一次压缩释放的 token 会少于预期，占用仍高于阈值，于是下一个 step 边界会再取一段——方向正确、逐步收敛，但单次释放量不保证等于 25% 的 token。
- **`maxTokens` 只能从行配置改**，没有放进卡片（它是摘要调用的输出上限，属于部署取值而非日常调节项）。
- 卡片文案由插件自己持有（中/英按浏览器语言选择），不进入 Harness 的 locale 字典。
- 与 `compaction-basic` 互斥，见上文。

## 开发

```sh
npm run check      # 语法检查 + 浏览器半侧测试（纯 Node，无需安装）
npm run test:host  # 宿主半侧集成测试：在真实 Cordis 上下文上挂载引擎
```

`tests/host.test.mjs` 需要能解析 `@deepseek-ai/*`：在一个装好插件的 DSH profile 里跑（或在仓库里放一个指向 `<DSH_HOME>/profiles/node_modules/@deepseek-ai` 的 `node_modules/@deepseek-ai` 链接）即可。

仓库内 `lib/*.js` 是提交产物：源码即发布内容，没有构建步骤，所以从 git 安装不需要 pnpm 的 `allowBuilds` 授权。发布内容只有 6 个文件（`lib/index.js`、`lib/client.js`、`cordis.patch.yml`、`package.json`、`README.md`、`LICENSE`）。

### 已验证

- 组合层：把包装进一个干净 profile 后 `--dump-config` 出现 `# == dsh-context-compact` 层与 `- id: compaction-basic / disabled: true`。
- 宿主半侧：6 个用例覆盖阈值触发、压缩比取值（含单节点区间）、开关关闭时委托内置策略、设置层热替换、投影缺失时回退。
- 浏览器半侧：7 个用例覆盖卡片注册（命名空间/槽位 key）、渲染、越界草稿拦截保存、写入与回读、被拒绝时的失败提示与保留草稿、开关与「恢复默认」、只读文档。
- 端到端：把 `npm pack` 出来的 tarball 装进一个只含 `dsh-base` + `dsh-web-app` 的临时 profile，`dsh --profile <临时> --port 3097 --no-open` 启动成功，首页模块列表里出现 `dsh-context-compact`，`/plugins/??dsh-context-compact/client.js` 返回 200 且内容为本文件；故意破坏导入时启动会打印 `dsh: warning: 1 entry did not activate`。

## 许可

MIT
