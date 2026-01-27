import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import micromatch from 'micromatch'

function runGit(args: string[], cwd?: string) {
  // Increase maxBuffer to 10MB to handle large diffs
  const res = spawnSync('git', args, { encoding: 'utf8', cwd, maxBuffer: 10 * 1024 * 1024 })
  
  if (res.error) {
    // If it's a buffer issue or other spawn error, return empty string to handle gracefully upstream
    return ''
  }
  
  if (res.status !== 0) {
    return ''
  }
  return res.stdout || ''
}

export function getGitRoot(): string {
  return runGit(['rev-parse', '--show-toplevel']).trim()
}

export function getStagedFiles(): string[] {
  const root = getGitRoot()
  const out = runGit(['diff', '--staged', '--name-only'], root)
  const files = out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  return files
}

export function getStagedDiff(): string {
  const root = getGitRoot()
  console.log('[DEBUG] Git Root:', root)
  // Run git diff from the root to ensure we capture all staged files correctly
  const diff = runGit(['diff', '--staged'], root)
  console.log('[DEBUG] git diff --staged length:', diff.length)
  return diff
}

export function getStagedDiffForFile(file: string): string {
  const root = getGitRoot()
  // File path is already relative to root (from getStagedFiles), so we run from root
  return runGit(['diff', '--staged', '--', file], root)
}

export function filterFiles(files: string[], fileTypes?: string[], exclude?: string[]): string[] {
  let list = files

  // 1. Whitelist (fileTypes)
  if (fileTypes && fileTypes.length > 0) {
    const exts = new Set(fileTypes.map((t) => t.replace(/^\./, '').toLowerCase()))
    list = list.filter((f) => {
      const m = f.split('.').pop()
      if (!m) return false
      return exts.has(m.toLowerCase())
    })
  }

  // 2. Blacklist (exclude)
  if (exclude && exclude.length > 0) {
    list = list.filter((f) => !micromatch.isMatch(f, exclude))
  }

  return list
}

export function getBranchName(): string {
  return runGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
}

export function getDiffStats(): string {
  return runGit(['diff', '--staged', '--shortstat']).trim()
}

function getPendingCommitMessage(): string | null {
  try {
    let pid = process.ppid
    for (let i = 0; i < 10; i++) {
      // Use ps -ww to ensure full command line is visible
      const res = spawnSync('ps', ['-ww', '-o', 'ppid,args', '-p', String(pid)], { encoding: 'utf8' })
      if (res.status !== 0) break
      const lines = res.stdout.trim().split('\n')
      if (lines.length < 2) break
      
      const match = lines[1].trim().match(/^(\d+)\s+(.*)$/)
      if (!match) break
      
      const ppid = parseInt(match[1], 10)
      const args = match[2]
      
      if (/\bgit\s+commit\b/.test(args)) {
        // Found git commit command
        // Try to extract -m or --message
        const m = args.match(/(?:-m|--message)\s+(?:["']?)(.*?)(?:["']?)(?:\s+--|$)/)
        if (m && m[1]) {
           let msg = m[1].trim()
           // Strip matching quotes if preserved by ps
           if ((msg.startsWith('"') && msg.endsWith('"')) || (msg.startsWith("'") && msg.endsWith("'"))) {
             msg = msg.slice(1, -1)
           }
           return msg
        }
        return '' // Found git commit but no message (interactive)
      }
      
      if (ppid === 0) break
      pid = ppid
    }
  } catch {}
  return null
}

export function getCommitMessage(): string {
  // 1. Try to find pending commit message from process args (git commit -m ...)
  const pending = getPendingCommitMessage()
  if (pending !== null) {
    return pending
  }

  // 2. Try to read .git/COMMIT_EDITMSG (for pre-commit hook)
  try {
    const gitDir = runGit(['rev-parse', '--git-dir']).trim()
    if (gitDir) {
      const msgPath = path.join(gitDir, 'COMMIT_EDITMSG')
      if (fs.existsSync(msgPath)) {
        // Only use if recent (avoid stale message from previous commit)
        const stats = fs.statSync(msgPath)
        const now = new Date().getTime()
        if (now - stats.mtimeMs < 60 * 1000) { // 1 minute
          const msg = fs.readFileSync(msgPath, 'utf8').trim()
          const subject = msg.split('\n')[0].trim()
          if (subject) return subject
        }
      }
    }
  } catch {}

  // 3. Do NOT fallback to HEAD commit message to avoid confusion
  return ''
}
