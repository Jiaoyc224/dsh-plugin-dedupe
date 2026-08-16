#!/usr/bin/env node
/**
 * dsh-plugin-dedupe: 插件去重检查脚本
 *
 * 独立运行：node scripts/check-duplicates.mjs [--profile <path>]
 * 或作为 pnpm preinstall 钩子使用：
 *   "scripts": { "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs" }
 *
 * 功能：
 * - 扫描 profile 的 package.json 依赖声明
 * - 扫描 node_modules 实际安装
 * - 检测重复声明、重复安装
 * - 如有错误返回非零退出码，阻断 pnpm install
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

function findProfileRoot(startDir) {
  let dir = startDir;
  while (dir !== resolve(dir, '..')) {
    const pkgPath = join(dir, 'package.json');
    try {
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.dsh?.profile || pkg.name?.startsWith('dsh-profile')) {
          return dir;
        }
      }
    } catch { }
    dir = resolve(dir, '..');
  }
  return process.cwd();
}

function readPackageJson(profileRoot) {
  const path = join(profileRoot, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.error(`[dsh-plugin-dedupe] 读取 package.json 失败: ${e.message}`);
    return null;
  }
}

function scanNodeModules(profileRoot) {
  const nmDir = join(profileRoot, 'node_modules');
  const result = {};
  if (!existsSync(nmDir)) return result;
  try {
    const entries = readdirSync(nmDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === '.pnpm') continue;
      // 兼容 scoped 包（@scope/name 会作为目录名出现，这里简化只统计顶层目录）
      const pkgPath = join(nmDir, entry.name, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          if (pkg.name) result[pkg.name] = (result[pkg.name] || 0) + 1;
        } catch { }
      }
    }
  } catch (e) {
    console.warn(`[dsh-plugin-dedupe] 扫描 node_modules 失败: ${e.message}`);
  }
  return result;
}

function checkDuplicates(profileRoot) {
  const pkg = readPackageJson(profileRoot);
  if (!pkg) return { errors: ['无法读取 package.json'], warnings: [] };

  const declared = {};
  const addDeclared = (obj) => {
    for (const [name, spec] of Object.entries(obj || {})) {
      if (!declared[name]) declared[name] = [];
      declared[name].push(spec);
    }
  };
  addDeclared(pkg.dependencies);
  addDeclared(pkg.devDependencies);
  addDeclared(pkg.optionalDependencies);

  const installed = scanNodeModules(profileRoot);

  const errors = [];
  const warnings = [];

  // 1. 同一包名在 package.json 中被多次声明（不同来源）
  for (const [name, specs] of Object.entries(declared)) {
    const uniqueSpecs = [...new Set(specs)];
    if (uniqueSpecs.length > 1) {
      errors.push(`检测到重复声明: "${name}" 在 package.json 中有多个来源: ${uniqueSpecs.join(', ')}`);
    }
  }

  // 2. node_modules 中同名包出现多次
  for (const [name, count] of Object.entries(installed)) {
    if (count > 1) {
      warnings.push(`检测到重复安装: "${name}" 在 node_modules 中出现 ${count} 次`);
    }
  }

  // 3. 已安装但未在 package.json 声明的“插件类”包（dsh-* 前缀或含 dsh bundle 元数据）
  //    普通间接依赖（hoisted）不警告，避免 pnpm 大量误报
  const declaredNames = new Set(Object.keys(declared));
  const warnOrphans = process.env.DSH_DEDUPE_WARN_ORPHANS === 'true';
  for (const [name] of Object.entries(installed)) {
    if (declaredNames.has(name)) continue;
    const isPluginLike = name.startsWith('dsh-')
      || name.startsWith('@deepseek-ai/dsh-')
      || name === 'github-explore'
      || name === 'argo-search';
    if (isPluginLike) {
      warnings.push(`发现未声明但已安装的插件: "${name}"（可能是旧残留或手动复制）`);
    } else if (warnOrphans) {
      warnings.push(`发现未声明但已安装的包: "${name}"`);
    }
  }

  return { errors, warnings };
}

function main() {
  const { values: { profile: profileArg } } = parseArgs({
    args: process.argv.slice(2),
    options: {
      profile: { type: 'string', short: 'p', description: 'Profile directory path' },
      help: { type: 'boolean', short: 'h', description: 'Show help' }
    },
    strict: true,
    allowPositionals: true
  });

  if (profileArg === '--help' || profileArg === '-h') {
    console.log(`
用法: node check-duplicates.mjs [--profile <path>]

选项:
  -p, --profile <path>  指定 profile 根目录 (默认自动向上查找 package.json)
  -h, --help            显示帮助

作为 pnpm preinstall 钩子使用:
  在 profile 的 package.json 中添加:
  "scripts": {
    "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs"
  }
`);
    return 0;
  }

  const profileRoot = profileArg || findProfileRoot(process.cwd());
  console.log(`[dsh-plugin-dedupe] 扫描 profile: ${profileRoot}`);

  const { errors, warnings } = checkDuplicates(profileRoot);

  for (const warn of warnings) {
    console.warn(`⚠️ ${warn}`);
  }
  for (const err of errors) {
    console.error(`❌ ${err}`);
  }

  if (errors.length > 0) {
    console.error(`[dsh-plugin-dedupe] 检测到 ${errors.length} 个重复插件错误，已阻断安装。`);
    return 1;
  }

  console.log(`✅ 未发现重复插件（${warnings.length} 个提示）`);
  return 0;
}

// 导出供测试/其他模块使用
export { findProfileRoot, checkDuplicates, scanNodeModules };

// 直接运行时执行 main
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exit(main());
}