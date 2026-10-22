import { spawn as nodeSpawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const DOCX_SCRIPT = 'import sys,zipfile,xml.etree.ElementTree as E\nz=zipfile.ZipFile(sys.argv[1])\ni=z.getinfo("word/document.xml")\nif i.file_size>10485760: raise ValueError("document too large")\nr=E.fromstring(z.read(i))\nprint("\\n".join("".join(p.itertext()) for p in r.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p")))';

// Probe and extraction share the selected executable. No installs, login changes,
// shell commands, or changes to the parent's environment are performed here.
export function createImportTools({ spawn = nodeSpawn, env = process.env, platform = process.platform, fsAccess = access } = {}) {
  const paths = platform === 'win32' ? path.win32 : path;
  const childEnv = { ...env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHON_MANAGER_AUTOMATIC_INSTALL: 'false' };
  let prepared;

  async function findExecutable(name) {
    const directories = (env.PATH || env.Path || '').split(paths.delimiter).map(value => value.replace(/^"(.*)"$/, '$1')).filter(Boolean);
    for (const directory of directories) {
      const command = paths.resolve(directory, name + (platform === 'win32' ? '.exe' : ''));
      try { await fsAccess(command, platform === 'win32' ? constants.F_OK : constants.X_OK); return command; }
      catch { /* Continue to the next PATH entry. */ }
    }
    return null;
  }

  function run(command, args, { timeout = 30_000, max = 10 * 1024 * 1024 } = {}) {
    return new Promise((resolve, reject) => {
      let child, timer, done = false, size = 0;
      const stdout = [], stderr = [];
      const finish = (error, code) => {
        if (done) return;
        done = true; clearTimeout(timer);
        if (error) reject(error);
        else resolve({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
      };
      try { child = spawn(command, args, { env: childEnv, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch { finish(new Error('문서 추출 프로그램을 실행하지 못했습니다.')); return; }
      timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('문서에서 텍스트를 추출하는 시간이 초과됐습니다.')); }, timeout);
      child.on('error', () => finish(new Error('문서 추출 프로그램을 실행하지 못했습니다.')));
      for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) stream.on('data', chunk => {
        if (done) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > max) { child.kill('SIGKILL'); finish(new Error('추출한 텍스트가 허용 크기를 넘어 읽기를 중단했습니다.')); }
        else chunks.push(bytes);
      });
      child.on('close', code => finish(null, code));
    });
  }

  async function pythonCommand() {
    for (const name of platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) {
      const command = await findExecutable(name);
      if (!command) continue;
      const args = name === 'py' ? ['-3'] : [];
      try {
        const result = await run(command, [...args, '--version'], { timeout: 3000, max: 16384 });
        if (result.code === 0 && /^Python 3\.\d+\.\d+[a-zA-Z0-9.+-]*\s*$/.test((result.stdout || result.stderr).trim())) return { command, args };
      } catch { /* Missing, unsupported, or unresponsive Python is unavailable. */ }
    }
    return null;
  }

  async function pdfCommand() {
    const command = await findExecutable('pdftotext');
    if (!command) return null;
    try {
      const result = await run(command, ['-v'], { timeout: 3000, max: 16384 });
      if (result.code === 0 && /pdftotext\s+version\s+\d/i.test(result.stdout + '\n' + result.stderr)) return { command, args: [] };
    } catch { /* PDF conversion remains optional. */ }
    return null;
  }

  function prepare(refresh = false) {
    if (!prepared || refresh) prepared = Promise.all([pdfCommand(), pythonCommand()]).then(([pdf, docx]) => ({ pdf, docx }));
    return prepared;
  }

  return {
    async getImportCapabilities({ refresh = false } = {}) {
      const commands = await prepare(refresh);
      return { pdf: { available: !!commands.pdf }, docx: { available: !!commands.docx } };
    },
    async extract(format, filename) {
      const commands = await prepare();
      const selected = commands[format];
      if (!selected) throw new Error(format === 'docx' ? 'Python 3를 찾지 못해 DOCX를 읽을 수 없습니다.' : 'pdftotext를 찾지 못해 PDF를 읽을 수 없습니다.');
      const args = format === 'docx'
        ? [...selected.args, '-c', DOCX_SCRIPT, filename]
        : ['-layout', '-enc', 'UTF-8', filename, '-'];
      const result = await run(selected.command, args);
      if (result.code !== 0) throw new Error('문서의 텍스트를 읽지 못했습니다. 텍스트가 있는 PDF 또는 Markdown 파일로 다시 추가해주세요.');
      return result.stdout;
    },
  };
}

export async function getImportCapabilities() {
  return createImportTools().getImportCapabilities();
}
