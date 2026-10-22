import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
let createImportTools;
try { ({ createImportTools } = await import('../lib/import-tools.mjs')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

function fixture({ files = [], versions = {}, exitCodes = {}, platform = 'win32' } = {}) {
  assert.equal(typeof createImportTools, 'function', 'shared import readiness and extraction must be available');
  const available = new Set(files), calls = [];
  const env = { PATH: 'C:\\학생 자료\\도구;C:\\Users\\학생\\AppData\\Local\\Microsoft\\WindowsApps', KEEP_SETTING: 'preserve', PYTHON_MANAGER_AUTOMATIC_INSTALL: 'true' };
  const spawn = (command, args, options) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => true; calls.push({ command, args, options });
    queueMicrotask(() => {
      if (args.includes('--version')) child.stdout.write(versions[command] || 'Python 3.12.5\n');
      else if (args.includes('-v')) child.stderr.write('pdftotext version 25.10.0\n');
      else child.stdout.write('내 학습 자료의 개념\n');
      child.stdout.end(); child.stderr.end(); child.emit('close', exitCodes[command] ?? 0);
    });
    return child;
  };
  const tools = createImportTools({ spawn, env, platform, fsAccess: async candidate => { if (!available.has(candidate)) { const error = new Error('missing'); error.code = 'ENOENT'; throw error; } } });
  return { tools, calls, env, available };
}

test('Windows Python launcher is verified with -3 and reused for Korean DOCX extraction', async () => {
  const { tools, calls, env } = fixture({ files: ['C:\\학생 자료\\도구\\py.exe'] });
  const before = { ...env };
  assert.deepEqual(await tools.getImportCapabilities(), { pdf: { available: false }, docx: { available: true } });
  const filename = 'C:\\학생 자료\\개인 위키\\원본.docx';
  assert.equal(await tools.extract('docx', filename), '내 학습 자료의 개념\n');
  assert.deepEqual(calls[0].args, ['-3', '--version']);
  const run = calls.at(-1);
  assert.equal(run.command, 'C:\\학생 자료\\도구\\py.exe');
  assert.equal(run.args[0], '-3');
  assert.equal(run.args.at(-1), filename);
  assert.equal(run.options.shell, false);
  assert.equal(run.options.env.PYTHONIOENCODING, 'utf-8');
  assert.equal(run.options.env.PYTHONUTF8, '1');
  assert.ok(calls.every(call => call.options.env.PYTHON_MANAGER_AUTOMATIC_INSTALL === 'false'));
  assert.equal(env.PYTHON_MANAGER_AUTOMATIC_INSTALL, 'true');
  assert.deepEqual(env, before);
});

test('Python 2 cannot be reported as DOCX ready', async () => {
  const python = 'C:\\학생 자료\\도구\\python.exe';
  const { tools } = fixture({ files: [python], versions: { [python]: 'Python 2.7.18\n' } });
  assert.deepEqual(await tools.getImportCapabilities(), { pdf: { available: false }, docx: { available: false } });
  await assert.rejects(tools.extract('docx', 'C:\\문서.docx'), /Python 3/);
});

test('PDF readiness probes pdftotext independently without exposing executable paths', async () => {
  const { tools } = fixture({ files: ['C:\\학생 자료\\도구\\pdftotext.exe'] });
  assert.deepEqual(await tools.getImportCapabilities(), { pdf: { available: true }, docx: { available: false } });
});

test('readiness can refresh after tools are installed and unknown version output stays unavailable', async () => {
  const python = 'C:\\학생 자료\\도구\\python.exe';
  const { tools, available } = fixture();
  assert.equal((await tools.getImportCapabilities()).docx.available, false);
  available.add(python);
  assert.equal((await tools.getImportCapabilities({ refresh: true })).docx.available, true);
  const invalid = fixture({ files: [python], versions: { [python]: 'Open Microsoft Store\n' } });
  assert.equal((await invalid.tools.getImportCapabilities()).docx.available, false);
});


test('a functioning WindowsApps Python 3 alias remains available without automatic installation', async () => {
  const python = 'C:\\Users\\학생\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe';
  const { tools, calls, env } = fixture({ files: [python] });
  const before = { ...env };
  assert.deepEqual(await tools.getImportCapabilities(), { pdf: { available: false }, docx: { available: true } });
  assert.equal(await tools.extract('docx', 'C:\\학생 자료\\원본.docx'), '내 학습 자료의 개념\n');
  assert.ok(calls.every(call => call.options.env.PYTHON_MANAGER_AUTOMATIC_INSTALL === 'false'));
  assert.deepEqual(env, before);
});

test('Windows Store placeholders with an error exit or malformed version stay unavailable', async () => {
  const python = 'C:\\Users\\학생\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe';
  for (const config of [
    { exitCodes: { [python]: 9009 } },
    { versions: { [python]: 'Python was not found; install from Microsoft Store.\n' } },
  ]) {
    const { tools } = fixture({ files: [python], ...config });
    assert.equal((await tools.getImportCapabilities()).docx.available, false);
  }
});
