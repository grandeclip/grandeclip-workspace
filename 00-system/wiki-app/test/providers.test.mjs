import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createProviderAdapters, parseJsonResult } from '../lib/providers.mjs';

function fakeSpawn(handler) {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.kills = [];
    const call = { command, args, options, child, messages: [], input: '' };
    calls.push(call);
    let pending = '';
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        call.input += chunk.toString();
        pending += chunk.toString();
        while (pending.includes('\n')) {
          const end = pending.indexOf('\n');
          const line = pending.slice(0, end);
          pending = pending.slice(end + 1);
          if (args.includes('app-server')) {
            const message = JSON.parse(line);
            call.messages.push(message);
            queueMicrotask(() => handler(call, message));
          }
        }
        callback();
      },
      final(callback) {
        if (!args.includes('app-server') && args[0] !== 'auth') queueMicrotask(() => handler(call));
        callback();
      },
    });
    call.send = (message, fragmented = false) => {
      const text = JSON.stringify(message) + '\n';
      if (fragmented) {
        const middle = Math.floor(text.length / 2);
        child.stdout.write(text.slice(0, middle));
        child.stdout.write(text.slice(middle));
      } else child.stdout.write(text);
    };
    call.close = (code = 0) => {
      if (child.exitCode !== null || child.signalCode) return;
      child.exitCode = code;
      child.stdout.end();
      child.stderr.end();
      child.emit('close', code, null);
    };
    child.kill = (signal = 'SIGTERM') => {
      child.kills.push(signal);
      if (child.exitCode === null && !child.signalCode) {
        child.signalCode = signal;
        queueMicrotask(() => child.emit('close', null, signal));
      }
      return true;
    };
    if (args[0] === 'auth') queueMicrotask(() => handler(call));
    return child;
  };
  return { spawn, calls };
}

function codexHandshake(call, message, accountType = 'chatgpt') {
  if (message.method === 'initialize') call.send({ id: message.id, result: { userAgent: 'test' } }, true);
  if (message.method === 'account/read') call.send({ id: message.id, result: { account: { type: accountType }, requiresOpenaiAuth: true } });
  if (message.method === 'config/read') call.send({ id: message.id, result: { config: { mcp_servers: { docs: { enabled: true }, 'server.with.dots': { enabled: true } } } } });
  if (message.method === 'thread/start') call.send({ id: message.id, result: { thread: { id: 'thread-1' } } });
}

const adapters = (fake, extra = {}) => createProviderAdapters({ spawn: fake.spawn, resolveCommand: async () => '/fake/cli', env: { PATH: '/bin', HOME: '/test' }, ...extra });

test('parses JSON objects with fences, introductory prose, and braces in strings', () => {
  assert.deepEqual(parseJsonResult('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonResult('정리한 결과입니다.\n{"text":"a } { b", "nested":{"ok":true}}\n끝'), { text: 'a } { b', nested: { ok: true } });
  assert.throws(() => parseJsonResult('[1,2]'), /JSON/);
  assert.throws(() => parseJsonResult('[{"answer":"a"}]'), /JSON/);
  assert.throws(() => parseJsonResult('```json\n[{"answer":"a"}]\n```'), /JSON/);
  assert.throws(() => parseJsonResult('답변 없음'), /JSON/);
  assert.throws(() => parseJsonResult('{"a":1} {"b":2}'), /JSON/);
});

test('missing installations and invalid providers are distinguished', async () => {
  const a = createProviderAdapters({ resolveCommand: async () => null });
  assert.deepEqual(await a.providerStatus('codex'), { id: 'codex', installed: false, authenticated: false, message: 'Codex CLI를 찾지 못했습니다. Codex를 설치한 뒤 다시 확인해주세요.' });
  await assert.rejects(a.runProvider({ provider: 'unknown', prompt: 'hi' }), /지원하지 않는/);
});

test('Codex auth uses initialized handshake before account/read and exposes no account identifiers', async () => {
  const fake = fakeSpawn(codexHandshake);
  const status = await adapters(fake).providerStatus('codex');
  assert.equal(status.authenticated, true);
  assert.deepEqual(fake.calls[0].messages.map(x => x.method), ['initialize', 'initialized', 'account/read']);
  assert.equal(fake.calls[0].child.kills[0], 'SIGTERM');
  assert.deepEqual(Object.keys(status).sort(), ['authenticated', 'id', 'installed', 'message']);
});

test('API-only accounts are never treated as subscription authentication', async () => {
  const fake = fakeSpawn((call, message) => codexHandshake(call, message, 'apiKey'));
  const a = adapters(fake);
  assert.equal((await a.providerStatus('codex')).authenticated, false);
  await assert.rejects(a.runProvider({ provider: 'codex', prompt: 'hi' }), /ChatGPT.*로그인/);
  assert.ok(fake.calls.every(c => !c.messages.some(m => m.method === 'thread/start')));
});

test('Claude status recognizes subscription and reports non-subscription or missing auth', async () => {
  for (const authMethod of ['claude.ai', 'oauth_token', 'api_key', 'none']) {
    const fake = fakeSpawn(call => { call.child.stdout.write(JSON.stringify({ loggedIn: authMethod !== 'none', authMethod })); call.close(authMethod === 'none' ? 1 : 0); });
    assert.equal((await adapters(fake).providerStatus('claude')).authenticated, ['claude.ai', 'oauth_token'].includes(authMethod));
  }
});

test('Claude streams partial text without doubling assistant/result text, uses stdin and no tools', async () => {
  const fake = fakeSpawn(call => {
    if (call.args[0] === 'auth') { call.child.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' })); call.close(); return; }
    call.send({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '안녕 ' } } }, true);
    call.send({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '위키' } } });
    call.send({ type: 'assistant', message: { content: [{ type: 'text', text: '안녕 위키' }] } });
    call.send({ type: 'result', subtype: 'success', is_error: false, result: '안녕 위키' });
    call.close();
  });
  const chunks = [];
  const env = { PATH: '/bin', HOME: '/test', OPENAI_API_KEY: 'private-openai', ANTHROPIC_API_KEY: 'private-anthropic', ANTHROPIC_AUTH_TOKEN: 'private-proxy' };
  const result = await adapters(fake, { env }).runProvider({ provider: 'claude', prompt: '질문 `$(never)`', cwd: '/wiki', onDelta: value => chunks.push(value) });
  assert.equal(result.text, '안녕 위키');
  assert.equal(chunks.join(''), result.text);
  const run = fake.calls[1];
  assert.equal(run.input, '질문 `$(never)`');
  assert.equal(run.args[run.args.indexOf('--tools') + 1], '');
  assert.ok(run.args.includes('--include-partial-messages'));
  assert.ok(!run.args.includes('--bare'));
  assert.equal(run.options.shell, false);
  for (const call of fake.calls) {
    assert.equal(call.options.env.OPENAI_API_KEY, undefined);
    assert.equal(call.options.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(call.options.env.ANTHROPIC_AUTH_TOKEN, undefined);
  }
});

test('Codex streams final messages only and waits for turn/completed rather than turn/start', async () => {
  const fake = fakeSpawn((call, message) => {
    codexHandshake(call, message);
    if (message.method !== 'turn/start') return;
    call.send({ id: message.id, result: { turn: { id: 'turn-1', status: 'inProgress' } } });
    call.send({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'answer', delta: '출처 ' } }, true);
    call.send({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'answer', delta: '확인' } });
    call.send({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'answer', type: 'agentMessage', phase: 'final_answer', text: '출처 확인' } } });
    call.send({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  });
  const chunks = [];
  assert.deepEqual(await adapters(fake).runProvider({ provider: 'codex', prompt: '위키 질문', cwd: '/wiki', onDelta: x => chunks.push(x) }), { text: '출처 확인' });
  assert.equal(chunks.join(''), '출처 확인');
  const requests = fake.calls[0].messages;
  const start = requests.find(m => m.method === 'thread/start');
  assert.equal(start.params.sandbox, 'read-only');
  assert.equal(start.params.approvalPolicy, 'on-request');
  assert.equal(start.params.modelProvider, 'openai');
  assert.deepEqual(start.params.config, { mcp_servers: { docs: { enabled: false }, 'server.with.dots': { enabled: false } } });
  assert.ok(!('model' in start.params));
  const turn = requests.find(m => m.method === 'turn/start');
  assert.deepEqual(turn.params.sandboxPolicy, { type: 'readOnly', networkAccess: false });
  assert.equal(turn.params.input[0].text, '위키 질문');
  assert.ok(fake.calls[0].args.includes('features.shell_tool=false'));
});

test('Codex forwards a caller-supplied output schema without selecting a model', async () => {
  const outputSchema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false };
  const fake = fakeSpawn((call, message) => {
    codexHandshake(call, message);
    if (message.method === 'turn/start') {
      call.send({ id: message.id, result: { turn: { id: 'turn-1' } } });
      call.send({ method: 'item/completed', params: { item: { id: 'x', type: 'agentMessage', text: '{"answer":"정리"}' } } });
      call.send({ method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } });
    }
  });
  await adapters(fake).runProvider({ provider: 'codex', prompt: 'hi', outputSchema });
  const params = fake.calls[0].messages.find(m => m.method === 'turn/start').params;
  assert.deepEqual(params.outputSchema, outputSchema);
  assert.ok(!('model' in params));
});

test('Codex rejects every approval and unknown client request', async () => {
  const fake = fakeSpawn((call, message) => {
    codexHandshake(call, message);
    if (message.method === 'turn/start') {
      call.send({ id: message.id, result: { turn: { id: 'turn-1' } } });
      call.send({ id: 100, method: 'item/commandExecution/requestApproval', params: {} });
      call.send({ id: 101, method: 'item/permissions/requestApproval', params: {} });
      call.send({ id: 102, method: 'future/request', params: {} });
    }
    if (message.id === 102 && message.error) {
      call.send({ method: 'item/completed', params: { item: { id: 'x', type: 'agentMessage', text: '완료' } } });
      call.send({ method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } });
    }
  });
  await adapters(fake).runProvider({ provider: 'codex', prompt: 'hi' });
  const messages = fake.calls[0].messages;
  assert.deepEqual(messages.find(m => m.id === 100 && !m.method)?.result, { decision: 'decline' });
  assert.deepEqual(messages.find(m => m.id === 101 && !m.method)?.result, { permissions: {}, scope: 'turn' });
  assert.equal(messages.find(m => m.id === 102 && !m.method)?.error.code, -32601);
});

test('provider errors do not become success and do not leak keys', async () => {
  const fake = fakeSpawn(call => {
    if (call.args[0] === 'auth') { call.child.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' })); call.close(); return; }
    call.send({ type: 'result', is_error: true, subtype: 'error_during_execution', result: 'API Error sk-secret01234567890123456789' });
    call.close(1);
  });
  await assert.rejects(adapters(fake).runProvider({ provider: 'claude', prompt: 'hi' }), error => !error.message.includes('sk-secret') && /Claude/.test(error.message));
});

test('Codex failed turns reject with a safe actionable error', async () => {
  const fake = fakeSpawn((call, message) => {
    codexHandshake(call, message);
    if (message.method === 'turn/start') {
      call.send({ id: message.id, result: { turn: { id: 'turn-1' } } });
      call.send({ method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'failed', error: { message: 'Rate limit exceeded sk-do-not-show' } } } });
    }
  });
  await assert.rejects(adapters(fake).runProvider({ provider: 'codex', prompt: 'hi' }), /사용량|한도/);
});

test('timeout and cancellation terminate subprocesses, including handshake', async () => {
  const fake = fakeSpawn(() => {});
  await assert.rejects(adapters(fake).runProvider({ provider: 'codex', prompt: 'hi', timeoutMs: 20 }), /시간/);
  assert.equal(fake.calls[0].child.kills[0], 'SIGTERM');
  const controller = new AbortController();
  const promise = adapters(fake).runProvider({ provider: 'codex', prompt: 'hi', signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(promise, /취소/);
  assert.equal(fake.calls[1].child.kills[0], 'SIGTERM');
});

test('auth probe startup failures are unknown rather than incorrectly asking for login', async () => {
  const fake = fakeSpawn(call => { call.child.stderr.write('Operation not permitted'); call.close(1); });
  const result = await adapters(fake).providerStatus('claude');
  assert.equal(result.installed, true);
  assert.equal(result.authenticated, null);
  assert.match(result.message, /확인/);
});


async function windowsNpmFixture(t, provider, { native = false, defaultPrefix = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'wiki CLI 학생 공백 '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prefix = path.join(root, defaultPrefix ? 'Roaming/npm' : '별도 npm 경로');
  const entry = path.join(prefix, 'node_modules', ...(provider === 'codex' ? ['@openai', 'codex', 'bin', 'codex.js'] : ['@anthropic-ai', 'claude-code', 'cli.js']));
  await mkdir(path.dirname(entry), { recursive: true });
  await Promise.all([writeFile(entry, '// real package entry'), writeFile(path.join(prefix, provider), '#!/bin/sh\n'), writeFile(path.join(prefix, provider + '.cmd'), '@echo off\n')]);
  if (native) await writeFile(path.join(prefix, provider + '.exe'), 'native executable fixture');
  const moduleUrl = new URL('../lib/providers.mjs', import.meta.url).href;
  const source = `import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';import {createProviderAdapters} from ${JSON.stringify(moduleUrl)};
Object.defineProperty(process,'platform',{value:'win32'});
${fakeSpawn.toString()}
${codexHandshake.toString()}
const fake=fakeSpawn((call,message)=>{if(call.args.includes('auth')){call.child.stdout.write(JSON.stringify({loggedIn:true,authMethod:'claude.ai'}));call.close();}else codexHandshake(call,message);});
const env={...process.env,PATH:${JSON.stringify(prefix)},APPDATA:${JSON.stringify(path.join(root, 'Roaming'))},HOME:${JSON.stringify(root)},USERPROFILE:${JSON.stringify(root)}};
const before=JSON.stringify(env);const a=createProviderAdapters({spawn:fake.spawn,env});const status=await a.providerStatus(${JSON.stringify(provider)},{cwd:${JSON.stringify(root)}});
console.log(JSON.stringify({status,command:fake.calls[0]?.command,args:fake.calls[0]?.args,shell:fake.calls[0]?.options.shell,environmentUnchanged:before===JSON.stringify(env)}));`;
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: source, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  return { ...JSON.parse(result.stdout), entry, nativePath: path.join(prefix, provider + '.exe') };
}

for (const provider of ['codex', 'claude']) test(`Windows npm ${provider} ignores shell shims and uses Node with the package entry in a Korean spaced path`, async t => {
  const before = process.env.PATH;
  const result = await windowsNpmFixture(t, provider);
  assert.equal(result.command, process.execPath);
  assert.equal(result.args[0], result.entry);
  assert.equal(result.status.authenticated, true);
  assert.equal(result.shell, false);
  assert.equal(result.environmentUnchanged, true);
  assert.equal(process.env.PATH, before);
});

test('Windows npm custom prefixes are resolved from PATH instead of only APPDATA', async t => {
  const result = await windowsNpmFixture(t, 'claude', { defaultPrefix: false });
  assert.equal(result.command, process.execPath);
  assert.equal(result.args[0], result.entry);
});

test('Windows native CLI executables remain preferable to npm shell shims', async t => {
  const result = await windowsNpmFixture(t, 'claude', { native: true });
  assert.equal(result.command, result.nativePath);
  assert.equal(result.args[0], 'auth');
});
