# dsh-plugin-dedupe Examples

This folder contains detailed configuration examples.

## Example 1: Full profile `package.json`

A complete example showing how to install the plugin and enable the preinstall hook:

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "scripts": {
    "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs"
  },
  "dependencies": {
    "@deepseek-ai/dsh-base": "latest",
    "@deepseek-ai/dsh-web-app": "latest",
    "dsh-plugin-dedupe": "github:Jiaoyc224/dsh-plugin-dedupe"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-plugin-dedupe"
      ]
    }
  }
}
```

## Example 2: Detect duplicate declarations

If the same plugin appears in `dependencies` and `devDependencies` with different sources, the check fails:

```json
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": {
    "dsh-agent-teams": "github:NanmiCoder/dsh-agent-teams"
  },
  "devDependencies": {
    "dsh-agent-teams": "file:E:/fake/dsh-agent-teams"
  }
}
```

Run:

```bash
node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs --profile .
```

Expected output:

```
[dsh-plugin-dedupe] 扫描 profile: /path/to/profile
❌ 检测到重复声明: "dsh-agent-teams" 在 package.json 中有多个来源: github:NanmiCoder/dsh-agent-teams, file:E:/fake/dsh-agent-teams
[dsh-plugin-dedupe] 检测到 1 个重复插件错误，已阻断安装。
```

Exit code: `1`

## Example 3: Use `DSH_DEDUPE_WARN_ORPHANS`

To also warn about non-plugin undeclared packages (transitive dependencies hoisted by pnpm), set:

```powershell
$env:DSH_DEDUPE_WARN_ORPHANS = "true"
node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs --profile .
```

This is usually noisy because pnpm hoists many indirect dependencies, so it is off by default.

## Example 4: Use as a pnpm preinstall hook in CI

In CI, you can run the check before installing dependencies:

```yaml
# .github/workflows/ci.yml
steps:
  - uses: actions/checkout@v4
  - uses: pnpm/action-setup@v4
  - run: pnpm install
    env:
      # The preinstall hook in package.json runs automatically.
      # You can also run it manually:
      # node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs
```

## Example 5: Custom profile directory

If you need to check another DSH profile:

```bash
node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs --profile C:\Users\me\.dsh\profiles\web
```
