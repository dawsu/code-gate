import fs from 'node:fs'
import path from 'node:path'
import yaml from 'yaml'
import { Config } from './types.js'
import { defaultConfig } from './defaults.js'
import { getBranchName } from '../core/git.js'

export * from './types.js'
export * from './defaults.js'

function findConfigFile(cwd: string): string | undefined {
  const candidates = [
    path.join(cwd, '.codegate.js'),
    path.join(cwd, '.codegate.cjs'),
    path.join(cwd, '.codegate.mjs'),
    path.join(cwd, 'code-gate.config.js'),
    path.join(cwd, 'code-gate.config.cjs'),
    path.join(cwd, 'code-gate.config.mjs'),
    path.join(cwd, 'code-gate.config.json'),
    path.join(cwd, 'code-gate.config.yaml'),
    path.join(cwd, 'code-gate.config.yml'),
    path.join(cwd, '.code-gaterc'),
    path.join(cwd, '.code-gaterc.json'),
    path.join(cwd, '.code-gaterc.yaml'),
    path.join(cwd, '.code-gaterc.yml')
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return undefined
}

async function readFile(p: string): Promise<any> {
  const ext = path.extname(p).toLowerCase()
  if (ext === '.js' || ext === '.cjs') {
    const { pathToFileURL } = await import('node:url')
    const mod = await import(pathToFileURL(p).href)
    return mod?.default ?? mod
  }
  const raw = fs.readFileSync(p, 'utf8')
  if (ext === '.yaml' || ext === '.yml') return yaml.parse(raw)
  return JSON.parse(raw)
}

function isObject(item: any) {
  return (item && typeof item === 'object' && !Array.isArray(item))
}

function mergeDeep(target: any, ...sources: any[]): any {
  if (!sources.length) return target
  const source = sources.shift()

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} })
        mergeDeep(target[key], source[key])
      } else {
        Object.assign(target, { [key]: source[key] })
      }
    }
  }
  return mergeDeep(target, ...sources)
}

export async function loadConfig(cwd = process.cwd()): Promise<Config> {
  const p = findConfigFile(cwd)
  if (!p) return { ...defaultConfig }
  
  try {
    const user = (await readFile(p)) || {}
    // Deep clone default config to avoid mutation issues
    const base = JSON.parse(JSON.stringify(defaultConfig))
    const merged = mergeDeep(base, user)
    const branch = getBranchName(cwd)
    const overrides = branch && merged.branchOverrides ? merged.branchOverrides[branch] : undefined
    if (overrides && typeof overrides === 'object') {
      return mergeDeep(merged, overrides)
    }
    return merged
  } catch (e) {
    console.error(`Failed to load config from ${p}:`, e)
    return { ...defaultConfig }
  }
}

export function resolveConfigPath(cwd = process.cwd()): string {
  return findConfigFile(cwd) || path.join(cwd, '.codegate.js')
}

export async function loadUserConfig(cwd = process.cwd()): Promise<{ path: string; config: any; exists: boolean }> {
  const p = findConfigFile(cwd)
  if (!p) {
    return { path: path.join(cwd, '.codegate.js'), config: {}, exists: false }
  }
  try {
    const user = (await readFile(p)) || {}
    return { path: p, config: user, exists: true }
  } catch (e) {
    console.error(`Failed to load user config from ${p}:`, e)
    return { path: p, config: {}, exists: true }
  }
}

export function mergeConfig(target: any, ...sources: any[]): any {
  return mergeDeep(target, ...sources)
}

export function serializeConfig(config: any, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.yaml' || ext === '.yml') return yaml.stringify(config)
  if (ext === '.cjs') return `module.exports = ${JSON.stringify(config, null, 2)}\n`
  if (ext === '.js' || ext === '.mjs') return `export default ${JSON.stringify(config, null, 2)}\n`
  return JSON.stringify(config, null, 2)
}
