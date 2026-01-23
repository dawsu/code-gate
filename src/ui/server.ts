import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Config, loadConfig, loadUserConfig, mergeConfig, resolveConfigPath, serializeConfig } from '../config/index.js'

export async function serveReview(
  cfg: Config,
  html: string,
  id: string,
  getStatus?: () => any,
  openNow?: boolean
): Promise<string> {
  const port = cfg.ui?.port ?? 5175
  const openCfg = cfg.ui?.openBrowser ?? true
  const route = `/review/${id}`
  const server = http.createServer((req, res) => {
    const u = (req.url || '').split('?')[0]
    if (u === route || u === `${route}/`) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(html)
      return
    }
    if (u === `${route}/status` && getStatus) {
      const body = JSON.stringify(getStatus() || {})
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(body)
      return
    }
    if (u === '/config' || u === '/config/') {
      const url = renderConfig(cfg, '')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(url)
      return
    }
    if (u === '/api/config') {
      if (req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(cfg))
        return
      }
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', async () => {
          try {
            const payload = body ? JSON.parse(body) : {}
            const user = await loadUserConfig(process.cwd())
            const merged = mergeConfig({}, user.config, payload)
            const configPath = resolveConfigPath(process.cwd())
            const content = serializeConfig(merged, configPath)
            fs.writeFileSync(configPath, content, 'utf8')
            const newConfig = await loadConfig()
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: true, config: newConfig }))
          } catch (e: any) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, message: e?.message || 'Invalid config' }))
          }
        })
        return
      }
    }
    res.statusCode = 404
    res.end('Not Found')
  })
  return new Promise((resolve) => {
    server.listen(port, () => {
      const url = `http://localhost:${port}${route}`
      const shouldOpen = typeof openNow === 'boolean' ? openNow : openCfg
      if (shouldOpen) openBrowser(url)
      server.unref()
      resolve(url)
    })
    server.on('error', () => {
      const p = path.join(os.tmpdir(), `code-gate-${id}.html`)
      fs.writeFileSync(p, html, 'utf8')
      const url = `file://${p}`
      const shouldOpen = typeof openNow === 'boolean' ? openNow : openCfg
      if (shouldOpen) openBrowser(url)
      resolve(url)
    })
  })
}

function renderConfig(cfg: Config, message: string) {
  const providerOptions = cfg.providerOptions || {}
  const provider = cfg.provider
  const optionsJson = JSON.stringify(providerOptions, null, 2)
  const branchOverrides = cfg.branchOverrides ? JSON.stringify(cfg.branchOverrides, null, 2) : ''
  const mode = cfg.reviewMode || 'files'
  const prompt = cfg.prompt || ''
  const fileTypes = Array.isArray(cfg.fileTypes) ? cfg.fileTypes.join(', ') : ''
  const exclude = Array.isArray(cfg.exclude) ? cfg.exclude.join(', ') : ''
  const maxDiffLines = cfg.limits?.maxDiffLines ?? ''
  const maxFiles = cfg.limits?.maxFiles ?? ''
  const language = cfg.language || ''
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Code Gate Config</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:24px;color:#24292f;background:#f6f8fa}
  .card{max-width:960px;margin:0 auto;background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:20px;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
  h1{margin-top:0}
  label{display:block;margin:12px 0 6px;font-weight:600}
  input,select,textarea{width:100%;padding:8px 10px;border:1px solid #d0d7de;border-radius:6px;font-size:14px;font-family:inherit}
  textarea{min-height:140px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .actions{display:flex;gap:12px;margin-top:16px}
  button{background:#0969da;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:14px;cursor:pointer}
  button.secondary{background:#57606a}
  .note{color:#57606a;font-size:12px;margin-top:8px}
  .alert{padding:8px 12px;border-radius:6px;margin-bottom:12px;background:#ddf4ff;border:1px solid #54aeff66}
</style>
</head>
<body>
  <div class="card">
    <h1>Code Gate Config</h1>
    ${message ? `<div class="alert">${message}</div>` : ''}
    <form id="cfg-form">
      <div class="row">
        <div>
          <label for="provider">Provider</label>
          <select id="provider" name="provider">
            ${['ollama','deepseek','openai','anthropic','gemini','cohere','mistral','azureOpenAI','aliyun','volcengine','zhipu'].map(p => `<option value="${p}"${p === provider ? ' selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="model">Model (current provider)</label>
          <input id="model" name="model" value="${providerOptions?.[provider]?.model || ''}" placeholder="model name" />
        </div>
      </div>
      <div class="row">
        <div>
          <label for="reviewMode">Review Mode</label>
          <select id="reviewMode" name="reviewMode">
            ${['summary','files','both'].map(m => `<option value="${m}"${m === mode ? ' selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="language">Language</label>
          <input id="language" name="language" value="${language}" placeholder="en / zh-CN / ..." />
        </div>
      </div>
      <div class="row">
        <div>
          <label for="fileTypes">File Types (comma separated)</label>
          <input id="fileTypes" name="fileTypes" value="${fileTypes}" placeholder="ts, tsx" />
        </div>
        <div>
          <label for="exclude">Exclude (comma separated)</label>
          <input id="exclude" name="exclude" value="${exclude}" placeholder="**/node_modules/**" />
        </div>
      </div>
      <div class="row">
        <div>
          <label for="maxDiffLines">Max Diff Lines</label>
          <input id="maxDiffLines" name="maxDiffLines" value="${maxDiffLines}" />
        </div>
        <div>
          <label for="maxFiles">Max Files</label>
          <input id="maxFiles" name="maxFiles" value="${maxFiles}" />
        </div>
      </div>
      <label for="prompt">Prompt</label>
      <textarea id="prompt" name="prompt">${prompt}</textarea>
      <label for="providerOptions">Provider Options (JSON)</label>
      <textarea id="providerOptions" name="providerOptions">${optionsJson}</textarea>
      <label for="branchOverrides">Branch Overrides (JSON)</label>
      <textarea id="branchOverrides" name="branchOverrides" placeholder='{"main":{"provider":"deepseek","providerOptions":{"deepseek":{"model":"deepseek-chat"}}}}'>${branchOverrides}</textarea>
      <div class="actions">
        <button type="submit">Save</button>
        <button type="button" class="secondary" id="reload">Reload</button>
      </div>
      <div class="note">Changes are saved to your project config file (e.g. .codegate.js).</div>
    </form>
  </div>
<script>
  const form = document.getElementById('cfg-form');
  const reload = document.getElementById('reload');
  reload.addEventListener('click', () => location.reload());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const provider = document.getElementById('provider').value;
    const model = document.getElementById('model').value;
    const reviewMode = document.getElementById('reviewMode').value;
    const language = document.getElementById('language').value.trim();
    const fileTypes = document.getElementById('fileTypes').value.split(',').map(s => s.trim()).filter(Boolean);
    const exclude = document.getElementById('exclude').value.split(',').map(s => s.trim()).filter(Boolean);
    const maxDiffLines = Number(document.getElementById('maxDiffLines').value || 0) || undefined;
    const maxFiles = Number(document.getElementById('maxFiles').value || 0) || undefined;
    const prompt = document.getElementById('prompt').value;
    let providerOptions = {};
    let branchOverrides = {};
    try {
      providerOptions = JSON.parse(document.getElementById('providerOptions').value || '{}');
    } catch (err) {
      alert('Invalid providerOptions JSON');
      return;
    }
    try {
      const raw = document.getElementById('branchOverrides').value.trim();
      branchOverrides = raw ? JSON.parse(raw) : {};
    } catch (err) {
      alert('Invalid branchOverrides JSON');
      return;
    }
    if (!providerOptions[provider]) providerOptions[provider] = {};
    if (model) providerOptions[provider].model = model;
    const payload = {
      provider,
      providerOptions,
      branchOverrides,
      reviewMode,
      language: language || undefined,
      fileTypes,
      exclude,
      limits: { maxDiffLines, maxFiles },
      prompt
    };
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.message || 'Save failed');
      return;
    }
    alert('Config saved');
  });
</script>
</body>
</html>`
}

export function saveOutput(cfg: Config, id: string, html: string) {
  try {
    const outDir = (cfg.output?.dir && cfg.output.dir.trim()) || '.review-logs'
    const p = path.join(process.cwd(), outDir)
    fs.mkdirSync(p, { recursive: true })
    const fp = path.join(p, `review-${id}.html`)
    fs.writeFileSync(fp, html, 'utf8')
    // process.stdout.write(`已保存审查页面：${fp}\n`)
  } catch (e) {
    // process.stderr.write(`保存审查页面失败：${(e as any)?.message || e}\n`)
  }
}

function openBrowser(url: string) {
  const platform = process.platform
  if (platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true })
  else if (platform === 'win32') spawn('cmd', ['/c', 'start', url], { stdio: 'ignore', detached: true })
  else spawn('xdg-open', [url], { stdio: 'ignore', detached: true })
}

export function triggerOpen(url: string) {
  openBrowser(url)
}
