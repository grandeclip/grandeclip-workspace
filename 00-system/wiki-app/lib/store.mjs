import { lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, posix, resolve, sep } from 'node:path';
import { createImportTools } from './import-tools.mjs';

const MAX_FILE = 10 * 1024 * 1024;
const MAX_ARTICLE = 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.csv', '.json', '.html', '.htm']);
const SOURCE_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
const DATE = () => new Date().toISOString().slice(0, 10);

function fail(message) { throw new Error(message); }
function safeId(id) {
  if (typeof id !== 'string' || !id || isAbsolute(id) || /[\\\u0000-\u001f]/.test(id) || id.split('/').includes('..') || id.split('/').includes('.')) fail('허용되지 않는 문서 경로입니다.');
  if (!/^(raw|wiki)\//.test(id) || id.endsWith('/')) fail('raw 또는 wiki 안의 문서만 사용할 수 있습니다.');
  return id;
}
function cleanTitle(value) { return String(value || '').replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, 200); }
function unquote(value) { return value.trim().replace(/^(['"])(.*)\1$/, '$2'); }
function titleOf(markdown, fallback) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  const yamlTitle = frontmatter && /^title:\s*(.+)$/m.exec(frontmatter[1]);
  const heading = /^#\s+(.+)$/m.exec(markdown);
  return cleanTitle(yamlTitle ? unquote(yamlTitle[1]) : heading ? heading[1] : fallback);
}
function summaryOf(markdown) {
  const paragraphs = [];
  let lines = [], preferred = false, references = false, fence = null;
  const flush = () => {
    const text = lines.join(' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
      .replace(/\[\^?\d+\]/g, '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
    if (text && /[\p{L}\p{N}]/u.test(text)) paragraphs.push({ text, preferred });
    lines = [];
  };
  const source = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  for (const original of source.split(/\r?\n/)) {
    let line = original.trim();
    const marker = /^(?:`{3,}|~{3,})/.exec(line)?.[0];
    if (marker) { flush(); if (!fence) fence = marker[0]; else if (marker[0] === fence) fence = null; continue; }
    if (fence) continue;
    if (!line) { flush(); continue; }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const label = heading[1].replace(/[*_`]/g, '').replace(/^\d+[.)]\s*/, '').trim();
      preferred = /^(?:핵심\s*요약|한\s*줄\s*요약|요약|개요|summary|overview)$/i.test(label);
      references = /^(?:출처|원자료(?:\s*인용)?|원문(?:\s*인용)?|근거(?:\s*인용)?|인용|참고(?:\s*자료|\s*문헌)?|sources?|references?|raw|원본|읽은\s*날|수집\s*정보)$/i.test(label);
      continue;
    }
    if (references || /^>/.test(line) || /^(?:[-*_]\s*){3,}$/.test(line) || /^\|/.test(line)) { flush(); continue; }
    const list = /^(?:[-+*]|\d+[.)])\s+/.test(line);
    if (list) { flush(); line = line.replace(/^(?:[-+*]|\d+[.)])\s+/, ''); }
    const plain = line.replace(/[*_`]/g, '');
    if (/^(?:sources?|raw|updated|collected|published|archived|original|content\s*hash|title|tags|aliases|읽은\s*날|수집(?:일|한\s*날|정보)?|출처|원자료|원본|작성(?:일|자)|수정일|발행일|자료\s*유형)\s*[:：]/i.test(plain)
      || /^(?:!?\[[^\]]*\]\([^)]*\)[;,\s]*)+$/.test(line)
      || /^(?:https?:\/\/\S+|\d{4}-\d{2}-\d{2})$/.test(line)) { flush(); continue; }
    lines.push(line);
    if (list) flush();
  }
  flush();
  const text = (paragraphs.find((paragraph) => paragraph.preferred) || paragraphs[0])?.text || '';
  const firstSentence = /[.!?。！？](?=\s|$)/.exec(text);
  const excerpt = firstSentence ? text.slice(0, firstSentence.index + 1) : text;
  if (excerpt.length <= 120) return excerpt;
  const prefix = excerpt.slice(0, 119);
  const boundary = prefix.lastIndexOf(' ');
  return `${(boundary >= 60 ? prefix.slice(0, boundary) : prefix).trimEnd()}…`;
}
function linkTargets(markdown) {
  const links = [];
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
  for (const match of withoutCode.matchAll(/(?<!!)\[([^\]]*)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g)) links.push({ label: match[1], target: match[2].replace(/^<|>$/g, ''), wiki: false });
  for (const match of withoutCode.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) links.push({ label: match[2] || match[1], target: match[1], wiki: true });
  return links;
}
function resolveLink(currentId, link, documents) {
  let target;
  try { target = decodeURIComponent(link.target).split('#')[0].split('?')[0].trim(); } catch { return null; }
  if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('/') || target.includes('\\') || /[\u0000-\u001f]/.test(target)) return null;
  const rooted = /^(raw|wiki)\//.test(target);
  let candidate = posix.normalize(rooted ? target : posix.join(posix.dirname(currentId), target));
  if (!/^(raw|wiki)\//.test(candidate) || candidate.split('/').includes('..')) return null;
  if (documents.has(candidate)) return candidate;
  if (!posix.extname(candidate) && documents.has(`${candidate}.md`)) return `${candidate}.md`;
  if (link.wiki) {
    const name = target.replace(/\.md$/i, '');
    const matches = [...documents.keys()].filter((id) => id.startsWith('wiki/') && (id.replace(/^wiki\//, '').replace(/\.md$/i, '') === name || posix.basename(id, '.md') === name || documents.get(id).title === name));
    if (matches.length === 1) return matches[0];
  }
  return null;
}
function isLocalDocumentLink(target) {
  let decoded;
  try { decoded = decodeURIComponent(target).split('#')[0].split('?')[0]; } catch { return true; }
  return !!decoded && !/^[a-z][a-z\d+.-]*:/i.test(decoded) && /(?:\.md|\.markdown|\.txt)?$/i.test(decoded);
}
function safeFilename(name) {
  if (typeof name !== 'string' || !name.trim() || name.includes('/') || name.includes('\\') || /[\u0000-\u001f]/.test(name) || name === '.' || name === '..') fail('파일 이름에 경로를 넣을 수 없습니다.');
  const normalized = name.normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu, '-').replace(/\s+/g, '-');
  const extension = extname(normalized).slice(0, 16);
  const stem = [...basename(normalized, extname(normalized))];
  while (Buffer.byteLength(stem.join('') + extension) > 140) stem.pop();
  return (stem.join('') + extension) || 'source.txt';
}
function decodeFile(file) {
  const name = safeFilename(file.name);
  if (file.encoding !== 'base64' || typeof file.content !== 'string' || file.content.length > Math.ceil(MAX_FILE / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) fail('파일 데이터는 올바른 base64 형식이어야 합니다.');
  const bytes = Buffer.from(file.content, 'base64');
  if (bytes.length > MAX_FILE) fail('파일은 하나당 10MB까지 추가할 수 있습니다.');
  return { name, bytes, hash: createHash('sha256').update(bytes).digest('hex') };
}
function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('UTF-8 텍스트로 읽을 수 없습니다. 텍스트나 Markdown으로 변환해 다시 추가해주세요.'); }
  if (text.includes('\u0000')) fail('텍스트 파일에서 바이너리 데이터가 발견됐습니다.');
  return text.replace(/^\uFEFF/, '');
}
function htmlText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<h1\b[^>]*>/gi, '\n# ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|h[1-6]|li|tr|section)>/gi, '\n\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
      if (entity.startsWith('#')) { const number = Number.parseInt(entity.startsWith('#x') ? entity.slice(2) : entity.slice(1), entity.startsWith('#x') ? 16 : 10); return number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ''; }
      return entities[entity.toLowerCase()] || '';
    }).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export class WikiStore {
  constructor(root, { importTools = createImportTools() } = {}) {
    if (typeof root !== 'string' || !root.trim()) fail('위키 폴더를 지정해주세요.');
    this.root = resolve(root);
    this.importTools = importTools;
    this._pending = Promise.resolve();
    this._initialized = false;
  }

  async getImportCapabilities() {
    return this.importTools.getImportCapabilities({ refresh: true });
  }

  async init() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink()) fail('위키 폴더 자체를 심볼릭 링크로 지정할 수 없습니다.');
    this.realRoot = await realpath(this.root);
    await this._directory('raw');
    await this._directory('raw/assets');
    await this._directory('wiki');
    for (const [id, text] of [['wiki/index.md', '# 내 위키\n'], ['wiki/log.md', '# 위키 기록\n']]) {
      if (!(await this._exists(id))) await this._atomic(id, text);
    }
    this._initialized = true;
    return this;
  }

  async _checkPath(id, { allowMissing = false, directory = false } = {}) {
    const parts = id.split('/');
    let absolute = this.root;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (!part || part === '.' || part === '..' || /[\\\u0000-\u001f]/.test(part)) fail('허용되지 않는 문서 경로입니다.');
      absolute = join(absolute, part);
      let info;
      try { info = await lstat(absolute); } catch (error) { if (error.code === 'ENOENT' && allowMissing) return join(this.root, ...parts); throw error; }
      if (info.isSymbolicLink()) fail('심볼릭 링크를 통해 문서를 읽거나 쓸 수 없습니다.');
      if (index < parts.length - 1 && !info.isDirectory()) fail('문서 경로의 상위 폴더가 올바르지 않습니다.');
      if (index === parts.length - 1 && directory && !info.isDirectory()) fail('폴더가 필요한 경로입니다.');
    }
    const actual = await realpath(absolute);
    if (actual !== this.realRoot && !actual.startsWith(`${this.realRoot}${sep}`)) fail('위키 폴더 밖의 문서에는 접근할 수 없습니다.');
    return absolute;
  }

  async _directory(id) {
    await this._checkPath(id, { allowMissing: true, directory: true });
    await mkdir(join(this.root, ...id.split('/')), { recursive: true });
    return this._checkPath(id, { directory: true });
  }

  async _exists(id) {
    try { await this._checkPath(id); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }

  async _read(id) {
    const absolute = await this._checkPath(id);
    const info = await lstat(absolute);
    if (!info.isFile() || info.size > MAX_FILE) fail('읽을 수 있는 10MB 이하의 문서가 아닙니다.');
    return readFile(absolute, 'utf8');
  }

  async _atomic(id, content) {
    safeId(id);
    await this._directory(posix.dirname(id));
    await this._checkPath(id, { allowMissing: true });
    const absolute = join(this.root, ...id.split('/'));
    const temporary = join(dirname(absolute), `.wiki-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      await this._checkPath(id, { allowMissing: true });
      await rename(temporary, absolute);
    } finally { await unlink(temporary).catch(() => {}); }
  }

  _mutate(operation) {
    const result = this._pending.then(operation);
    this._pending = result.catch(() => {});
    return result;
  }

  async _walk(id) {
    await this._checkPath(id, { directory: true });
    const found = [];
    for (const entry of await readdir(join(this.root, id), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink() || id === 'raw' && entry.name === 'assets') continue;
      const child = `${id}/${entry.name}`;
      if (entry.isDirectory()) found.push(...await this._walk(child));
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()) && !['wiki/index.md', 'wiki/log.md'].includes(child)) found.push(child);
    }
    return found;
  }

  async getData() {
    if (!this._initialized) await this.init();
    const ids = [...await this._walk('raw'), ...await this._walk('wiki')].sort((a, b) => a.localeCompare(b, 'ko'));
    const documents = new Map();
    for (const id of ids) {
      let markdown;
      try { markdown = await this._read(id); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      documents.set(id, { id, path: id, kind: id.startsWith('raw/') ? 'source' : 'concept', title: titleOf(markdown, posix.basename(id, posix.extname(id))), summary: summaryOf(markdown), markdown, related: [], sources: [] });
    }
    const edges = new Map();
    for (const document of documents.values()) {
      for (const link of linkTargets(document.markdown)) {
        const target = resolveLink(document.id, link, documents);
        if (!target || target === document.id) continue;
        if (!document.related.includes(target)) document.related.push(target);
        if (target.startsWith('raw/') && !document.sources.some((source) => source.id === target)) document.sources.push({ id: target, label: documents.get(target).title, excerpt: documents.get(target).summary });
        const pair = [document.id, target].sort();
        edges.set(pair.join('\u0000'), pair);
      }
    }
    // Related documents include both outbound and inbound links so the map is navigable from sources too.
    for (const [a, b] of edges.values()) {
      if (!documents.get(a).related.includes(b)) documents.get(a).related.push(b);
      if (!documents.get(b).related.includes(a)) documents.get(b).related.push(a);
    }
    return { title: '내 위키', docs: [...documents.values()], edges: [...edges.values()] };
  }

  async getDocument(id) {
    safeId(id);
    const document = (await this.getData()).docs.find((entry) => entry.id === id);
    if (!document) fail('문서를 찾을 수 없습니다.');
    return document;
  }

  async importFiles(files) {
    if (!Array.isArray(files) || !files.length || files.length > 30) fail('자료는 한 번에 1개부터 30개까지 추가할 수 있습니다.');
    const decoded = files.map(decodeFile); // Validate every payload before creating original files.
    return this._mutate(async () => {
      if (!this._initialized) await this.init();
      const added = []; const duplicates = []; const warnings = [];
      const known = new Map((await this._walk('raw')).map((id) => [/\/([a-f0-9]{64})-/.exec(id)?.[1], id]).filter(([hash]) => hash));
      for (const { name, bytes, hash } of decoded) {
        if (known.has(hash)) { duplicates.push(known.get(hash)); continue; }
        const originalName = `${hash}-${name}.original`;
        const originalId = `raw/assets/${originalName}`;
        if (!(await this._exists(originalId))) await this._atomic(originalId, bytes);
        let text;
        try {
          const extension = extname(name).toLowerCase();
          if (TEXT_EXTENSIONS.has(extension)) {
            text = decodeText(bytes);
            if (extension === '.html' || extension === '.htm') text = htmlText(text);
          } else if (extension === '.pdf' || extension === '.docx') {
            text = await this.importTools.extract(extension.slice(1), join(this.root, originalId));
          } else fail('지원하는 파일은 Markdown, TXT, CSV, JSON, HTML, PDF, DOCX입니다.');
          if (!text.trim()) fail('읽을 수 있는 텍스트가 없습니다. 스캔한 문서는 텍스트로 변환해 다시 추가해주세요.');
        } catch (error) { warnings.push(`${name}: ${error.message} 원본은 보관했습니다.`); continue; }
        const stem = basename(name, extname(name)) || 'source';
        const sourceId = `raw/${hash}-${stem}.md`;
        const title = titleOf(text, stem);
        const originalLink = `assets/${encodeURIComponent(originalName)}`;
        const markdown = `# ${title}\n\n> Source: [${name.replace(/[\[\]]/g, '')}](${originalLink})\n> Collected: ${DATE()}\n> Published: Unknown\n\n- Original: [${name.replace(/[\[\]]/g, '')}](${originalLink})\n- Content hash: ${hash}\n\n---\n\n${text}\n`;
        await this._atomic(sourceId, markdown);
        known.set(hash, sourceId);
        added.push(sourceId);
      }
      return { added, duplicates, warnings };
    });
  }

  async commitArticles({ articles, summary = '' } = {}) {
    if (!Array.isArray(articles) || !articles.length || articles.length > 30) fail('저장할 개념 문서는 한 번에 1개부터 30개까지 지정해주세요.');
    return this._mutate(async () => {
      if (!this._initialized) await this.init();
      const existing = await this.getData();
      const documents = new Map(existing.docs.map((document) => [document.id, document]));
      const changed = [];
      for (const article of articles) {
        safeId(article.path);
        if (!/^wiki\/[^/]+\/[^/]+\.md$/.test(article.path)) fail('개념 문서는 wiki/주제/문서.md 형식으로 저장해야 합니다.');
        if (changed.some((entry) => entry.id === article.path)) fail('같은 개념 문서를 한 번에 두 번 저장할 수 없습니다.');
        if (typeof article.markdown !== 'string' || !article.markdown.trim() || Buffer.byteLength(article.markdown) > MAX_ARTICLE) fail('개념 문서 본문이 비어 있거나 1MB를 넘습니다.');
        await this._checkPath(article.path, { allowMissing: true });
        const title = cleanTitle(article.title) || titleOf(article.markdown, posix.basename(article.path, '.md'));
        const markdown = /^#\s/m.test(article.markdown) ? article.markdown : `# ${title}\n\n${article.markdown}`;
        const entry = { id: article.path, title, markdown, summary: summaryOf(markdown) };
        changed.push(entry);
        documents.set(entry.id, entry);
      }
      for (const document of changed) {
        let rawCount = 0;
        const rawIds = new Set();
        for (const link of linkTargets(document.markdown)) {
          const target = resolveLink(document.id, link, documents);
          if (target?.startsWith('raw/')) { rawCount++; rawIds.add(target); }
          if (!target && isLocalDocumentLink(link.target)) fail(`${document.title}: 출처 또는 문서 링크가 존재하지 않습니다 (${link.target}).`);
        }
        if (!rawCount) fail(`${document.title}: 저장된 raw 원문을 가리키는 출처 링크가 필요합니다.`);
        // Keep the upstream evidence checker compatible with model outputs that cite sources in the body.
        const rawLine = `> Raw: ${[...rawIds].map((id) => `[${documents.get(id).title.replace(/[\[\]]/g, '')}](${posix.relative(posix.dirname(document.id), id)})`).join('; ')}`;
        document.markdown = /^>\s*Raw:/m.test(document.markdown)
          ? document.markdown.replace(/^>\s*Raw:.*$/m, rawLine)
          : document.markdown.replace(/^(#\s+[^\n]+\n?)/m, `$1\n${rawLine}\n`);
      }
      const backups = new Map();
      const outputs = changed.map((document) => [document.id, `${document.markdown.trim()}\n`]);
      const priorDates = new Map();
      for (const line of (await this._read('wiki/index.md')).split('\n')) {
        const link = /\]\(([^)]+)\)/.exec(line);
        const date = /\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*$/.exec(line);
        if (link && date) {
          try { priorDates.set(`wiki/${decodeURIComponent(link[1])}`, date[1]); } catch { /* Invalid old index links are replaced below. */ }
        }
      }
      const indexLines = ['# 내 위키', ''];
      const concepts = [...documents.values()].filter((document) => document.id.startsWith('wiki/')).sort((a, b) => a.id.localeCompare(b.id));
      for (const topic of [...new Set(concepts.map((document) => document.id.split('/')[1]))]) {
        indexLines.push(`## ${topic}`, '', '| 문서 | 요약 | Updated |', '|---|---|---|');
        for (const document of concepts.filter((entry) => entry.id.split('/')[1] === topic)) {
          const updated = changed.some((entry) => entry.id === document.id) ? DATE() : /^>\s*Updated:\s*(\d{4}-\d{2}-\d{2})/m.exec(document.markdown)?.[1] || priorDates.get(document.id) || DATE();
          indexLines.push(`| [${document.title.replace(/[\[\]|]/g, '')}](${encodeURI(document.id.slice(5))}) | ${document.summary.replace(/\|/g, '/')} | ${updated} |`);
        }
        indexLines.push('');
      }
      outputs.push(['wiki/index.md', `${indexLines.join('\n')}\n`]);
      const log = await this._read('wiki/log.md');
      outputs.push(['wiki/log.md', `${log.trim()}\n\n## [${DATE()}] ingest | ${cleanTitle(summary) || changed.map((entry) => entry.title).join(', ')}\n- Updated: ${changed.map((entry) => entry.id).join(', ')}\n`]);
      for (const [id] of outputs) backups.set(id, await this._exists(id) ? await this._read(id) : null);
      const applied = [];
      try {
        for (const [id, content] of outputs) { await this._atomic(id, content); applied.push(id); }
      } catch (error) {
        for (const id of applied.reverse()) {
          if (backups.get(id) === null) await unlink(await this._checkPath(id)).catch(() => {});
          else await this._atomic(id, backups.get(id)).catch(() => {});
        }
        throw error;
      }
      return { updated: changed.map((entry) => entry.id), summary: cleanTitle(summary) };
    });
  }
}
