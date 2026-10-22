import { spawn as nodeSpawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const IDS = new Set(['codex', 'claude']);
const NAMES = { codex: 'Codex', claude: 'Claude Code' };
const MAX_OUTPUT = 8 * 1024 * 1024;
const AUTH_TIMEOUT = 15000;

class ProviderError extends Error {
  constructor(message, code = 'PROVIDER_ERROR') {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

function validateProvider(provider) {
  if (!IDS.has(provider)) throw new ProviderError('지원하지 않는 AI 도구입니다.', 'INVALID_PROVIDER');
}

// Keep the user's normal CLI login. Never forward API credentials or alternate
// inference backends: this app deliberately uses the personal subscription path.
function subscriptionEnv(source) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^(?:OPENAI|CODEX|ANTHROPIC|AZURE_OPENAI).*API[_]?KEY$/i.test(key)
      || ['ANTHROPIC_AUTH_TOKEN', 'OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL',
        'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'].includes(key)) delete env[key];
  }
  return env;
}

async function executable(candidate) {
  try { await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK); return true; }
  catch { return false; }
}

async function resolveExecutable(provider, { env }) {
  const extensions = process.platform === 'win32' ? ['.exe'] : [''];
  const directories = (env.PATH || env.Path || '').split(path.delimiter).map(value => value.replace(/^"(.*)"$/, '$1')).filter(Boolean);
  for (const directory of directories) {
    for (const suffix of extensions) {
      const candidate = path.join(directory, provider + suffix);
      if (await executable(candidate)) return candidate;
    }
  }
  const userHome = env.HOME || env.USERPROFILE || homedir();
  const candidates = [path.join(userHome, '.local', 'bin', provider + (process.platform === 'win32' ? '.exe' : ''))];
  if (provider === 'codex' && process.platform === 'darwin') candidates.push(
    '/Applications/Codex.app/Contents/Resources/codex',
    '/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
  );
  if (process.platform === 'win32' && env.LOCALAPPDATA) candidates.push(
    path.join(env.LOCALAPPDATA, 'Programs', provider === 'codex' ? 'Codex' : 'Claude',
      ...(provider === 'codex' ? ['resources', 'codex.exe'] : ['claude.exe'])),
  );
  for (const candidate of candidates) if (await executable(candidate)) return candidate;
  // npm's Windows .cmd shim requires a command shell. Resolve its actual JS
  // entry point instead, keeping user text on stdin and shell:false everywhere.
  if (process.platform === 'win32') {
    const prefixes = new Set([...directories, ...(env.APPDATA ? [path.join(env.APPDATA, 'npm')] : [])]);
    for (const prefix of prefixes) {
      const entry = provider === 'codex'
        ? path.join(prefix, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
        : path.join(prefix, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
      try { await access(entry); return { command: process.execPath, args: [entry] }; } catch { /* Not installed here. */ }
    }
  }
  return null;
}

function authError(provider, method) {
  if (provider === 'codex') return new ProviderError(
    method && method !== 'chatgpt'
      ? 'Codex가 API 방식으로 설정되어 있습니다. Codex에서 ChatGPT 계정으로 로그인한 뒤 다시 시도해주세요.'
      : 'Codex의 ChatGPT 로그인을 확인하지 못했습니다. Codex에서 계정 상태를 확인한 뒤 다시 시도해주세요.',
    'AUTH_REQUIRED',
  );
  return new ProviderError(
    method && !['none', 'claude.ai', 'oauth_token'].includes(method)
      ? 'Claude Code가 API 방식으로 설정되어 있습니다. Claude 구독 계정으로 로그인한 뒤 다시 시도해주세요.'
      : 'Claude Code의 구독 로그인을 확인하지 못했습니다. 터미널에서 Claude Code의 계정 상태를 확인해주세요. 실행 환경의 키체인 접근 제한도 확인이 필요할 수 있습니다.',
    'AUTH_REQUIRED',
  );
}

function publicError(provider, error) {
  if (error instanceof ProviderError) return error;
  const raw = String(error?.message || error || '');
  if (/rate.?limit|usage.?limit|quota|insufficient.*credit|exceeded.*limit/i.test(raw)) return new ProviderError(`${NAMES[provider]}의 사용량 한도에 도달했습니다. 한도가 회복된 뒤 다시 시도해주세요.`, 'RATE_LIMIT');
  if (/unauthorized|not.?logged.?in|authentication|invalid.*(?:token|credential)|login.?required|401/i.test(raw)) return authError(provider);
  if (/EACCES|EPERM|permission denied|operation not permitted/i.test(raw)) return new ProviderError(`${NAMES[provider]} 실행 권한을 확인할 수 없습니다. 터미널에서 실행 가능한지 확인해주세요.`, 'PERMISSION_DENIED');
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|network|fetch failed|connection/i.test(raw)) return new ProviderError(`${NAMES[provider]}에 연결하지 못했습니다. 인터넷 연결과 도구 상태를 확인한 뒤 다시 시도해주세요.`, 'CONNECTION_ERROR');
  if (/ENOENT|not found/i.test(raw)) return new ProviderError(`${NAMES[provider]} 실행 파일을 찾지 못했습니다. 설치 상태를 확인해주세요.`, 'NOT_INSTALLED');
  return new ProviderError(`${NAMES[provider]} 실행 중 문제가 발생했습니다. 도구를 업데이트하고 터미널에서 실행 상태를 확인해주세요.`, 'PROVIDER_ERROR');
}

function launch(spawn, command, args, { cwd, env }) {
  const actual = typeof command === 'string' ? { command, args: [] } : command;
  return spawn(actual.command, [...(actual.args || []), ...args], {
    cwd,
    env: subscriptionEnv(env),
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
  }, 750);
  timer.unref?.();
}

function collectProcess(spawn, command, args, { provider, cwd, env, signal, timeoutMs = AUTH_TIMEOUT, input = '', onLine }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new ProviderError('요청을 취소했습니다.', 'ABORTED')); return; }
    let child;
    try { child = launch(spawn, command, args, { cwd, env }); }
    catch (error) { reject(publicError(provider, error)); return; }
    let stdout = '', stderr = '', pending = '', bytes = 0, settled = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      stopChild(child);
      reject(publicError(provider, error));
    };
    const abort = () => fail(new ProviderError('요청을 취소했습니다.', 'ABORTED'));
    const timer = setTimeout(() => fail(new ProviderError('응답 대기 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.', 'TIMEOUT')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_OUTPUT) { fail(new ProviderError('AI 응답이 너무 큽니다. 자료의 범위를 줄여 다시 시도해주세요.', 'OUTPUT_LIMIT')); return; }
      stdout += chunk;
      if (!onLine) return;
      pending += chunk;
      while (pending.includes('\n')) {
        const end = pending.indexOf('\n');
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line) try { onLine(JSON.parse(line)); } catch (error) { fail(error instanceof ProviderError ? error : new ProviderError(`${NAMES[provider]}의 응답을 읽지 못했습니다. 도구 버전을 확인해주세요.`, 'PROTOCOL_ERROR')); return; }
      }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16384); });
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.on('close', code => {
      if (settled) return;
      if (onLine && pending.trim()) {
        try { onLine(JSON.parse(pending)); }
        catch (error) { fail(error); return; }
      }
      settled = true;
      cleanup();
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

const CODEX_ARGS = [
  'app-server', '--listen', 'stdio://',
  '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false',
  '-c', 'features.hooks=false', '-c', 'features.apps=false', '-c', 'features.plugins=false',
  '-c', 'agents.enabled=false', '-c', 'mcp_servers={}', '-c', 'web_search="disabled"',
  '-c', 'tools.view_image=false',
];

class CodexConnection {
  constructor(spawn, command, { cwd, env, signal, timeoutMs, onDelta }) {
    this.child = launch(spawn, command, CODEX_ARGS, { cwd, env });
    this.pending = new Map();
    this.items = new Map();
    this.id = 0;
    this.onDelta = onDelta;
    this.closed = false;
    this.stderr = '';
    this.done = new Promise((resolve, reject) => { this.resolveDone = resolve; this.rejectDone = reject; });
    this.done.catch(() => {}); // It can fail while a handshake request is awaited.
    this.abort = () => this.fail(new ProviderError('요청을 취소했습니다.', 'ABORTED'));
    this.signal = signal;
    this.timer = setTimeout(() => this.fail(new ProviderError('응답 대기 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.', 'TIMEOUT')), timeoutMs);
    signal?.addEventListener('abort', this.abort, { once: true });
    let buffer = '', bytes = 0;
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      if (this.closed) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_OUTPUT) { this.fail(new ProviderError('AI 응답이 너무 큽니다. 자료의 범위를 줄여 다시 시도해주세요.', 'OUTPUT_LIMIT')); return; }
      buffer += chunk;
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n');
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (line) try { this.receive(JSON.parse(line)); }
        catch (error) { this.fail(error instanceof ProviderError ? error : new ProviderError('Codex의 응답을 읽지 못했습니다. 도구 버전을 확인해주세요.', 'PROTOCOL_ERROR')); return; }
      }
    });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-16384); });
    this.child.on('error', error => this.fail(error));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('close', code => {
      if (this.closed) return;
      if (buffer.trim()) try { this.receive(JSON.parse(buffer)); } catch { /* Error below covers an incomplete final frame. */ }
      if (!this.closed) this.fail(new Error(this.stderr || `Codex exited before completion (${code})`));
    });
  }

  send(message) {
    if (this.closed) throw this.failure || new ProviderError('Codex 연결이 종료되었습니다.', 'CONNECTION_CLOSED');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }

  request(method, params) {
    if (this.closed) return Promise.reject(this.failure || new ProviderError('Codex 연결이 종료되었습니다.', 'CONNECTION_CLOSED'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.send({ id, method, params }); } catch (error) { this.pending.delete(id); reject(publicError('codex', error)); }
    });
  }

  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'grandeclip_personal_wiki', title: 'Personal Wiki', version: '0.1.0' } });
    this.send({ method: 'initialized', params: {} });
    return this.request('account/read', { refreshToken: false });
  }

  receive(message) {
    if (message.id !== undefined && message.method) {
      // This app never approves commands, file changes, external tool calls, or
      // extra permissions. Unknown future requests fail closed as well.
      const method = message.method;
      let result;
      if (/commandExecution\/requestApproval|fileChange\/requestApproval/.test(method)) result = { decision: 'decline' };
      else if (method === 'item/permissions/requestApproval') result = { permissions: {}, scope: 'turn' };
      else if (/elicitation/.test(method)) result = { action: 'decline', content: null };
      else if (method === 'item/tool/call') result = { success: false, contentItems: [{ type: 'inputText', text: 'Tools are disabled in this wiki application.' }] };
      else if (method === 'item/tool/requestUserInput') result = { answers: {} };
      if (result) this.send({ id: message.id, result });
      else this.send({ id: message.id, error: { code: -32601, message: 'This local wiki client does not allow this request.' } });
      return;
    }
    if (message.id !== undefined) {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(publicError('codex', new Error(message.error.message || 'Codex protocol error')));
      else request.resolve(message.result);
      return;
    }
    const params = message.params || {};
    if (this.threadId && params.threadId && params.threadId !== this.threadId) return;
    if (message.method === 'item/agentMessage/delta') {
      const id = params.itemId || 'answer';
      const item = this.items.get(id) || { text: '', emitted: '', phase: null };
      if (typeof params.delta === 'string') {
        item.text += params.delta;
        if (item.phase !== 'commentary') { this.onDelta?.(params.delta); item.emitted += params.delta; }
      }
      this.items.set(id, item);
    }
    if (['item/started', 'item/completed'].includes(message.method) && params.item?.type === 'agentMessage') {
      const value = params.item;
      const item = this.items.get(value.id) || { text: '', emitted: '', phase: null };
      item.phase = value.phase || item.phase;
      if (typeof value.text === 'string' && (value.text || message.method === 'item/completed')) item.text = value.text;
      if (message.method === 'item/completed' && item.phase !== 'commentary' && item.text.startsWith(item.emitted)) {
        const tail = item.text.slice(item.emitted.length);
        if (tail) this.onDelta?.(tail);
        item.emitted = item.text;
      }
      this.items.set(value.id, item);
    }
    if (message.method === 'error' && params.willRetry !== true) this.fail(new Error(params.error?.message || params.message || 'Codex failed'));
    if (message.method === 'turn/completed') {
      const turn = params.turn || {};
      if (turn.status !== 'completed') { this.fail(turn.status === 'interrupted' ? new ProviderError('요청을 취소했습니다.', 'ABORTED') : new Error(turn.error?.message || 'Codex turn failed')); return; }
      const values = [...this.items.values()];
      const final = values.filter(item => item.phase === 'final_answer');
      const text = (final.length ? final : values.filter(item => item.phase !== 'commentary')).map(item => item.text).filter(Boolean).join('\n\n');
      if (!text.trim()) { this.fail(new ProviderError('Codex가 빈 응답을 보냈습니다. 다시 질문해주세요.', 'EMPTY_RESPONSE')); return; }
      this.resolveDone({ text });
    }
  }

  fail(error) {
    if (this.closed) return;
    this.failure = publicError('codex', error);
    for (const request of this.pending.values()) request.reject(this.failure);
    this.pending.clear();
    this.rejectDone(this.failure);
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.signal?.removeEventListener('abort', this.abort);
    stopChild(this.child);
  }
}

export function parseJsonResult(text) {
  if (typeof text !== 'string' || !text.trim()) throw new ProviderError('AI 응답에서 JSON 결과를 찾지 못했습니다. 다시 시도해주세요.', 'INVALID_JSON');
  const source = text.replace(/^\uFEFF/, '').trim();
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(source);
  if (fenced) return parseJsonResult(fenced[1]);
  try {
    const result = JSON.parse(source);
    if (object(result)) return result;
    throw new ProviderError('AI 응답이 JSON 객체 형식이 아닙니다. 다시 시도해주세요.', 'INVALID_JSON');
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    // A provider can add a fence or a short introduction.
  }
  const candidates = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (start < 0) { if (char === '{') { start = i; depth = 1; } continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try { const result = JSON.parse(source.slice(start, i + 1)); if (object(result)) candidates.push(result); } catch { /* Not a JSON object. */ }
      start = -1;
    }
  }
  if (candidates.length === 1) return candidates[0];
  throw new ProviderError('AI 응답의 JSON 형식을 확인하지 못했습니다. 다시 시도해주세요.', 'INVALID_JSON');
}

export function createProviderAdapters({ spawn = nodeSpawn, resolveCommand = resolveExecutable, env: defaultEnv = process.env } = {}) {
  async function commandFor(provider, options) {
    validateProvider(provider);
    return resolveCommand(provider, options);
  }

  async function claudeAuth(command, { cwd, env, signal, timeoutMs = AUTH_TIMEOUT }) {
    const result = await collectProcess(spawn, command, ['auth', 'status'], { provider: 'claude', cwd, env, signal, timeoutMs });
    let status;
    try { status = JSON.parse(result.stdout); }
    catch { throw publicError('claude', new Error(result.stderr || 'Could not read auth status')); }
    return { authenticated: status.loggedIn === true && ['claude.ai', 'oauth_token'].includes(status.authMethod), method: status.authMethod };
  }

  async function providerStatus(provider, { cwd, env = defaultEnv } = {}) {
    validateProvider(provider);
    let command;
    try { command = await commandFor(provider, { cwd, env }); }
    catch { return { id: provider, installed: false, authenticated: null, message: `${NAMES[provider]} 설치 상태를 확인하지 못했습니다.` }; }
    if (!command) return { id: provider, installed: false, authenticated: false, message: `${NAMES[provider]} CLI를 찾지 못했습니다. ${NAMES[provider]}를 설치한 뒤 다시 확인해주세요.` };
    let connection;
    try {
      let authenticated, method;
      if (provider === 'claude') ({ authenticated, method } = await claudeAuth(command, { cwd, env }));
      else {
        connection = new CodexConnection(spawn, command, { cwd, env, timeoutMs: AUTH_TIMEOUT });
        const result = await connection.initialize();
        method = result?.account?.type;
        authenticated = method === 'chatgpt';
      }
      return { id: provider, installed: true, authenticated, message: authenticated ? `${NAMES[provider]} 구독 계정으로 연결되어 있습니다.` : authError(provider, method).message };
    } catch (error) {
      return { id: provider, installed: true, authenticated: null, message: `${NAMES[provider]} 로그인 상태를 확인하지 못했습니다. ${publicError(provider, error).message}` };
    } finally { connection?.close(); }
  }

  async function runProvider({ provider, prompt, cwd, onDelta, signal, timeoutMs = 180000, env = defaultEnv, outputSchema }) {
    validateProvider(provider);
    if (typeof prompt !== 'string' || !prompt.trim()) throw new ProviderError('AI에게 보낼 요청이 비어 있습니다.', 'INVALID_PROMPT');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new ProviderError('응답 대기 시간이 올바르지 않습니다.', 'INVALID_TIMEOUT');
    if (signal?.aborted) throw new ProviderError('요청을 취소했습니다.', 'ABORTED');
    const command = await commandFor(provider, { cwd, env });
    if (!command) throw new ProviderError(`${NAMES[provider]} 실행 파일을 찾지 못했습니다. 설치 상태를 확인해주세요.`, 'NOT_INSTALLED');
    const started = Date.now();
    if (provider === 'claude') {
      const auth = await claudeAuth(command, { cwd, env, signal, timeoutMs: Math.min(AUTH_TIMEOUT, timeoutMs) });
      if (!auth.authenticated) throw authError(provider, auth.method);
      let streamed = '', assistantText = '', resultText, resultError;
      const result = await collectProcess(spawn, command, [
        '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
        '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--permission-prompts', 'none', '--no-session-persistence', '--disable-slash-commands',
        '--settings', '{"disableAllHooks":true}',
      ], {
        provider, cwd, env, signal, input: prompt, timeoutMs: Math.max(1, timeoutMs - (Date.now() - started)),
        onLine(message) {
          const delta = message.type === 'stream_event' ? message.event?.delta : null;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') { streamed += delta.text; onDelta?.(delta.text); }
          if (message.type === 'assistant') assistantText = (message.message?.content || []).filter(item => item.type === 'text').map(item => item.text).join('');
          if (message.type === 'result') {
            if (message.is_error || (message.subtype && message.subtype !== 'success')) resultError = publicError(provider, new Error(message.result || message.errors?.join(' ') || 'Claude failed'));
            else if (typeof message.result === 'string') resultText = message.result;
          }
        },
      });
      if (resultError) throw resultError;
      if (result.code !== 0) throw publicError(provider, new Error(result.stderr || result.stdout));
      const text = resultText ?? (assistantText || streamed);
      if (!text.trim()) throw new ProviderError('Claude Code가 빈 응답을 보냈습니다. 다시 질문해주세요.', 'EMPTY_RESPONSE');
      if (text.startsWith(streamed) && text.length > streamed.length) onDelta?.(text.slice(streamed.length));
      return { text };
    }
    let connection;
    try {
      if (signal?.aborted) throw new ProviderError('요청을 취소했습니다.', 'ABORTED');
      connection = new CodexConnection(spawn, command, { cwd, env, signal, timeoutMs, onDelta });
      const account = await connection.initialize();
      if (account?.account?.type !== 'chatgpt') throw authError(provider, account?.account?.type);
      // Empty TOML tables merge with user config; they do not clear it. Disable
      // every discovered MCP explicitly for this thread, without changing the
      // user's configuration or exposing server identities to the browser.
      const effective = await connection.request('config/read', { includeLayers: false });
      const toolConfig = {
        mcp_servers: Object.fromEntries(Object.keys(effective?.config?.mcp_servers || {}).map(name => [name, { enabled: false }])),
      };
      const result = await connection.request('thread/start', {
        cwd, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user', ephemeral: true,
        modelProvider: 'openai',
        config: toolConfig,
        developerInstructions: 'Answer using only the supplied wiki instructions and context. Do not use tools, read other files, change files, or access the network. Return only the requested answer.',
      });
      connection.threadId = result?.thread?.id;
      if (!connection.threadId) throw new ProviderError('Codex 대화를 시작하지 못했습니다. 도구를 업데이트하고 다시 시도해주세요.', 'PROTOCOL_ERROR');
      await connection.request('turn/start', {
        threadId: connection.threadId,
        input: [{ type: 'text', text: prompt }],
        cwd,
        approvalPolicy: 'on-request', approvalsReviewer: 'user',
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
        ...(outputSchema ? { outputSchema } : {}),
      });
      return await connection.done;
    } catch (error) { throw publicError(provider, error); }
    finally { connection?.close(); }
  }

  return { providerStatus, runProvider };
}

const defaults = createProviderAdapters();
export const providerStatus = defaults.providerStatus;
export const runProvider = defaults.runProvider;
