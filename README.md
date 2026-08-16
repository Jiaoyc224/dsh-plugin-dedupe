# dsh-plugin-dedupe

**DSH 插件去重守护** — 防止在 DSH profile 中重复安装同一插件。

## 功能

1. **启动时扫描**：作为 DSH 插件加载时，自动扫描当前 profile 的 `package.json` 依赖和 `node_modules` 实际安装，检测：
   - 同名插件在 `package.json` 中多次声明（不同来源：npm / github / file / link）
   - `node_modules` 中同名包出现多次（不同版本/来源并存）
   - 依赖声明但未在 `node_modules` 中找到（可选警告）
   - `dsh.profile.bundles` 与 `dependencies` 重复声明（正常情况不报错）

2. **preinstall 钩子**：作为 `pnpm install` 的 `preinstall` 钩子，安装前自动检查，发现错误时返回非零退出码，**阻断安装**，防止重复插件被下载。

## 安装

### 1. 作为 DSH 插件安装

在 DSH profile 目录下：

```bash
cd C:\Users\31506\.dsh\profiles\web
pnpm add file:E:/deepseek/work/dsh-plugin-dedupe
```

或使用 `dsh plugin` 命令：

```bash
dsh plugin --profile web add file:E:/deepseek/work/dsh-plugin-dedupe
```

### 2. 启用 preinstall 钩子（推荐）

编辑 profile 的 `package.json`，在 `scripts` 中添加 `preinstall` 钩子：

```json
{
  "scripts": {
    "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs"
  }
}
```

这样每次运行 `pnpm install` 前，都会自动运行去重检查，发现重复插件会返回非零退出码，**阻断安装**。

## 使用示例

### 独立运行检查

```bash
# 在 profile 根目录下
node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs

# 或指定 profile 目录
node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs --profile /path/to/profile
```

### 作为 preinstall 钩子

```json
{
  "scripts": {
    "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs"
  }
}
```

然后运行 `pnpm install`，如果有重复插件会报错并阻断：

```
❌ 检测到重复插件: dsh-agent-teams 在 package.json 中被声明了两次 (github + file)
错误: preinstall script failed with exit code 1
```

## 配置选项

插件支持通过环境变量配置：

| 环境变量 | 说明 | 默认值 |
|-----------|------|--------|
| `DSH_DEDUPE_STRICT` | `true` 时报错阻断启动，`false` 仅警告 | `false` |
| `DSH_PROFILE_DIR` | 手动指定 profile 根目录 | 自动向上查找 |

## 检测规则

| 类型 | 行为 | 说明 |
|------|------|------|
| package.json 同名依赖重复 | ⚠️ 警告 | 同一包名在 dependencies 中出现多次（不同来源） |
| node_modules 同名包多次 | ⚠️ 警告 | 同名包在 node_modules 中出现多次（不同版本/来源） |
| dsh.bundles 与 dependencies 重复 | 信息 | 正常情况，不报错 |
| 依赖未安装 | 可选警告 | 可通过 `DSH_DEDUPE_WARN_MISSING=true` 开启 |

## 核心文件

```
dsh-plugin-dedupe/
├── package.json          # 插件元数据、入口、脚本
├── lib/index.js          # Cordis 插件入口，启动时扫描
├── scripts/
│   └── check-duplicates.mjs  # 独立检查脚本，可作 preinstall
├── cordis.patch.yml      # Cordis patch 注册插件
└── README.md
```

## 原理

1. **Cordis 插件**：`lib/index.js` 作为 DSH bundle 加载，在 `apply` 阶段扫描当前 profile，输出警告/错误到 logger。
2. **preinstall 钩子**：`scripts/check-duplicates.mjs` 可独立运行，返回非零码阻断 `pnpm install`。
3. **检测逻辑**：
   - 解析 `package.json` 的 `dependencies` / `devDependencies` / `optionalDependencies`
   - 扫描 `node_modules` 实际安装的包名计数
   - 检测同名多源声明、node_modules 重复目录、bundles 重复

## 许可证

MIT License

---

## 快速开始

```bash
# 1. 安装到你的 web profile
cd C:\Users\31506\.dsh\profiles\web
pnpm add file:E:/deepseek/work/dsh-plugin-dedupe

# 2. 添加 preinstall 钩子（编辑 package.json）
# 在 scripts 中添加: "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs"

# 3. 测试
pnpm install
```

以后每次 `pnpm install` 前，都会自动检查并阻断重复插件安装。