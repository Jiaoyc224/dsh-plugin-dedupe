# dsh-plugin-dedupe

**DSH plugin deduplication guard** — prevents installing the same plugin twice in a DSH profile.

## Features

1. **Startup scan**: When loaded as a DSH plugin, it scans the current profile's `package.json` dependencies and the actual `node_modules` installation to detect:
   - Same plugin declared multiple times in `package.json` with different sources (npm / github / file / link)
   - Same package appearing more than once in `node_modules` (different versions/sources)
   - Undeclared `dsh-*` leftover plugins
   - Same package declared in multiple fields with same source protocol (downgraded to warning)

2. **preinstall hook**: Can be used as a `pnpm install` preinstall hook. If duplicates are found, it returns a non-zero exit code and **blocks the installation**.

## Example output

```text
[dsh-plugin-dedupe] Scanning profile: C:\Users\<your-user>\.dsh\profiles\web
❌ Detected duplicate declaration: "dsh-agent-teams" has multiple sources in package.json:
   github:NanmiCoder/dsh-agent-teams
   file:E:/fake/dsh-agent-teams
[dsh-plugin-dedupe] Detected 1 duplicate plugin error, installation blocked.
```

## Installation

### 1. Install via GitHub (recommended)

Inside your DSH profile directory:

```bash
cd <your-dsh-profile-dir>  # e.g. C:\Users\<user>\.dsh\profiles\web
pnpm add github:Jiaoyc224/dsh-plugin-dedupe
```

Or with `dsh plugin`:

```bash
dsh plugin --profile web add github:Jiaoyc224/dsh-plugin-dedupe
```

### 2. Enable the preinstall hook (recommended)

Add this to your profile's `package.json`:

```json
{
  "scripts": {
    "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs"
  }
}
```

> **Note**: After first installing the plugin, run `pnpm install` once to generate `node_modules/dsh-plugin-dedupe`. Subsequent `pnpm install` will trigger the preinstall hook. Use `pnpm install --prefer-offline` to avoid first-run loop.

Now every `pnpm install` will first run the duplicate check. If duplicates are found, the install is blocked.

## Usage

### Run a standalone check

```bash
# From the profile root
node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs

# Or specify a profile directory
node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs --profile /path/to/profile
```

### As a preinstall hook

```json
{
  "scripts": {
    "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs"
  }
}
```

Then run `pnpm install`. If duplicates are found, the install stops with:

```
❌ Detected duplicate declaration: "dsh-agent-teams" has multiple sources in package.json
[ERROR] preinstall script failed with exit code 1
```

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DSH_DEDUPE_WARN_ORPHANS` | Set to `true` to also warn about non-plugin undeclared dependencies | `false` |
| `DSH_PROFILE_DIR` | Manually specify the profile root directory | auto-detect |

## Detection rules

| Type | Behavior | Description |
|------|----------|-------------|
| Duplicate declaration in package.json (different sources) | ❌ Error | Same plugin name declared with multiple different sources |
| Duplicate declaration in multiple fields (same source) | ⚠️ Warning | Same package in dependencies/devDependencies with same protocol |
| Duplicate installation in node_modules | ⚠️ Warning | Same package appears multiple times |
| Undeclared `dsh-*` plugin installed | ⚠️ Warning | Likely leftover or manually copied |

## Files

```
dsh-plugin-dedupe/
├── package.json          # Plugin metadata, entry, scripts
├── lib/index.js          # Cordis plugin entry, scans on startup
├── scripts/
│   └── check-duplicates.mjs  # Standalone check script / preinstall hook
├── cordis.patch.yml      # Cordis patch registration
├── docs/
│   └── screenshot.txt    # Demo output (text)
├── README.md             # Chinese docs
├── README.en.md          # English docs
└── LICENSE
```

## How it works

1. **Cordis plugin**: `lib/index.js` loads as a DSH bundle and scans the current profile in its `apply` phase, logging warnings/errors.
2. **preinstall hook**: `scripts/check-duplicates.mjs` can run standalone and returns a non-zero code to block `pnpm install`.
3. **Detection logic**:
   - Parse `dependencies` / `devDependencies` / `optionalDependencies` / `peerDependencies` from `package.json`
   - Scan installed package names in `node_modules`
   - Detect duplicate multi-source declarations, duplicate node_modules entries, and undeclared `dsh-*` leftovers

## License

MIT License

## Quick start

```bash
# 1. Install from GitHub
cd <your-dsh-profile-dir>  # Your DSH profile directory
pnpm add github:Jiaoyc224/dsh-plugin-dedupe

# 2. Add the preinstall hook to package.json
# "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs"

# 3. Test
pnpm install
```

Every future `pnpm install` will automatically check for and block duplicate plugin installation.
