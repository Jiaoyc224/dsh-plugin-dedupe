/**
 * dsh-plugin-dedupe: DSH 插件去重守护
 * 
 * 在 DSH 启动时扫描当前 profile 的已安装插件，
 * 检测重复安装（同名插件多次声明、不同来源重复、node_modules 中重复目录等）。
 * 
 * 用法：
 * 1. 作为 DSH 插件安装到 profile：dsh plugin --profile web add file:E:/deepseek/work/dsh-plugin-dedupe
 * 2. 可选：在 profile 的 package.json 中添加 preinstall 钩子：
 *    "scripts": { "preinstall": "node node_modules/dsh-plugin-dedupe/scripts/check-duplicates.mjs" }
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 从当前文件位置推导 DSH profile 根目录
 * 我们假设插件安装在 profile 的 node_modules/dsh-plugin-dedupe 下
 */
function findProfileRoot() {
  // 从当前文件向上找 node_modules -> profile 根
  let dir = __dirname;
  while (dir !== resolve(dir, '..')) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name === 'dsh-profile-web' || pkg.name === 'dsh-profile-*' || pkg.dsh?.profile) {
        return dir;
      }
    }
    dir = resolve(dir, '..');
  }
  // 回退：尝试从环境变量
  if (process.env.DSH_PROFILE_DIR) return process.env.DSH_PROFILE_DIR;
  // 最后兜底：返回当前工作目录
  return process.cwd();
}

function readPackageJson(profileRoot) {
  const path = join(profileRoot, 'package.json');
  if (!existsSync(path)) {
    console.error('[dsh-plugin-dedupe] 找不到 profile package.json:', path);
    return null;
  }
  try {
    return JSON.parse(readFileSync(join(profileRoot, 'package.json'), 'utf-8'));
  } catch (e) {
    console.error('[dsh-plugin-dedupe] 读取 package.json 失败:', e.message);
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
      // scoped 包：node_modules/@scope/name/package.json
      if (entry.name.startsWith('@')) {
        const scopeDir = join(nmDir, entry.name);
        const scopedEntries = readdirSync(scopeDir, { withFileTypes: true });
        for (const sub of scopedEntries) {
          if (!sub.isDirectory()) continue;
          const pkgPath = join(scopeDir, sub.name, 'package.json');
          if (existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
              if (pkg.name) result[pkg.name] = (result[pkg.name] || 0) + 1;
            } catch { }
          }
        }
        continue;
      }
      const pkgPath = join(nmDir, entry.name, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          if (pkg.name) result[pkg.name] = (result[pkg.name] || 0) + 1;
        } catch { }
      }
    }
  } catch (e) {
    console.warn('[dsh-plugin-dedupe] 扫描 node_modules 失败:', e.message);
  }
  return result;
}

function checkDuplicates(profileRoot) {
  const pkg = readPackageJson(profileRoot);
  if (!pkg) return { ok: false, errors: ['无法读取 package.json'], warnings: [] };

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

  const nmCounts = scanNodeModules(profileRoot);

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
  for (const [name, count] of Object.entries(nmCounts)) {
    if (count > 1) {
      warnings.push(`检测到重复安装: "${name}" 在 node_modules 中出现 ${count} 次`);
    }
  }

  // 3. 已安装但未在 package.json 声明的“插件类”包
  const declaredNames = new Set(Object.keys(declared));
  const warnOrphans = process.env.DSH_DEDUPE_WARN_ORPHANS === 'true';
  for (const [name] of Object.entries(nmCounts)) {
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

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      declared: Object.keys(declared).length,
      installed: Object.keys(nmCounts).length,
      warnings: warnings.length,
      errors: errors.length
    }
  };
}

export const name = 'dsh-plugin-dedupe';
export const inject = ['logger'];

export function apply(ctx) {
  const profileRoot = findProfileRoot();
  console.log(`[dsh-plugin-dedupe] 正在扫描 profile: ${profileRoot}`);

  const result = checkDuplicates(profileRoot);

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      ctx.logger.error(`[dsh-plugin-dedupe] ${err}`);
    }
    // 如果有错误，可以选择抛出异常阻止启动（可配置）
    // throw new Error('dsh-plugin-dedupe: 检测到重复插件，启动中止');
  }

  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      ctx.logger.warn(`[dsh-plugin-dedupe] ${warn}`);
    }
  }

  ctx.logger.info(`[dsh-plugin-dedupe] 扫描完成: ${result.summary.declared} 个声明, ${result.summary.installed} 个已安装, ${result.summary.warnings} 个警告, ${result.summary.errors} 个错误`);

  // 将结果挂载到 ctx 供其他插件使用
  ctx.pluginDedupeResult = result;
}