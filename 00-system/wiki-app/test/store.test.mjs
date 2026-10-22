import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { WikiStore } from '../lib/store.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'wiki-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await new WikiStore(root).init();
  return { root, store };
}
const file = (name, content) => ({ name, content: Buffer.from(content).toString('base64'), encoding: 'base64' });

async function documentSummary(t, markdown) {
  const { root, store } = await fixture(t);
  await mkdir(join(root, 'wiki/topic'), { recursive: true });
  await writeFile(join(root, 'wiki/topic/summary.md'), markdown);
  return (await store.getDocument('wiki/topic/summary.md')).summary;
}

test('document summary keeps the first explanation sentence instead of joining the whole article', async (t) => {
  const summary = await documentSummary(t, '# 인출 연습\n\n자료를 덮고 기억에서 꺼내 설명하는 학습 방법이다. 다시 읽기와는 다르다.\n\n## 실습\n책을 덮고 설명한다.');
  assert.equal(summary, '자료를 덮고 기억에서 꺼내 설명하는 학습 방법이다.');
});

test('document summary excludes source metadata, quotations, dates, and reference-only links', async (t) => {
  const summary = await documentSummary(t, '# 개념\n\n> Sources: 교재\n> Raw: [원문](../../raw/a.md)\n> Updated: 2026-10-22\n\n> 원자료에서 가져온 긴 인용문이다.\n\n읽은 날: 2026-10-22\n출처: 강의 자료\n[원자료](../../raw/a.md)\n\n핵심 개념을 자기 말로 연결하는 방법이다.\n\n다른 세부 설명이다.');
  assert.equal(summary, '핵심 개념을 자기 말로 연결하는 방법이다.');
});

test('an explicit core summary takes precedence over an introductory housekeeping paragraph', async (t) => {
  const summary = await documentSummary(t, '# 학습\n\n이 문서는 여러 자료를 정리한 기록이다.\n\n## 원자료 인용\n원문에서 옮긴 문장이다.\n\n## 핵심 요약\n인출 연습은 기억에서 정보를 꺼내는 활동이다. 반복 읽기와 구분된다.\n\n## 방법\n책을 덮는다.');
  assert.equal(summary, '인출 연습은 기억에서 정보를 꺼내는 활동이다.');
});

test('metadata-only documents may have an empty summary', async (t) => {
  const summary = await documentSummary(t, '# 제목\n\nSources: 교재\nRaw: [원문](../../raw/a.md)\nUpdated: 2026-10-22\n읽은 날: 2026-10-22\n\n> 원문 인용만 있다.\n\n[원자료](../../raw/a.md)');
  assert.equal(summary, '');
});

test('long summaries use at most 120 characters and prefer a word boundary', async (t) => {
  const sentence = '개념의 정의와 적용 방법을 연결해서 '.repeat(12).trim() + '.';
  const summary = await documentSummary(t, `# 긴 설명\n\n${sentence}\n\n다음 문단은 포함하지 않는다.`);
  assert.ok(summary.length <= 120);
  assert.ok(summary.endsWith('…'));
  const prefix = summary.slice(0, -1);
  assert.ok(sentence.startsWith(prefix));
  assert.equal(sentence[prefix.length], ' ');
});

test('imports Unicode sources without inventing concepts and preserves original bytes', async (t) => {
  const { root, store } = await fixture(t);
  const bytes = '# 선택 편향\r\n\r\n표본을 선택하는 방식이 결과에 영향을 준다.\r\n';
  const result = await store.importFiles([file('선택 편향.md', bytes)]);
  assert.equal(result.added.length, 1);
  const data = await store.getData();
  assert.equal(data.title, '내 위키');
  assert.equal(data.docs.length, 1);
  assert.equal(data.docs[0].kind, 'source');
  assert.equal(data.docs[0].title, '선택 편향');
  const originals = await readdir(join(root, 'raw/assets'));
  assert.equal(originals.length, 1);
  assert.equal(await readFile(join(root, 'raw/assets', originals[0]), 'utf8'), bytes);
  assert.ok(!data.docs.some((doc) => doc.kind === 'concept'));
});

test('identical bytes under a different filename are duplicates', async (t) => {
  const { store } = await fixture(t);
  const first = await store.importFiles([file('first.md', 'same source')]);
  const second = await store.importFiles([file('다른 이름.md', 'same source')]);
  assert.deepEqual(second.duplicates, first.added);
  assert.equal(second.added.length, 0);
  assert.equal((await store.getData()).docs.length, 1);
});

test('long multibyte filenames fit filesystem limits without losing their extension', async (t) => {
  const { store } = await fixture(t);
  const result = await store.importFiles([file(`${'가나다라'.repeat(40)}.md`, '# 긴 이름\n자료 본문')]);
  assert.equal(result.added.length, 1);
  assert.equal((await store.getDocument(result.added[0])).title, '긴 이름');
});

test('commits grounded articles and indexes relative, wiki, and project-root links', async (t) => {
  const { root, store } = await fixture(t);
  const { added: [source] } = await store.importFiles([file('자료.txt', '선택편향과 확증편향은 다르다.')]);
  const before = await readFile(join(root, source));
  const result = await store.commitArticles({ articles: [
    { path: 'wiki/학습/선택편향.md', title: '선택편향', markdown: `# 선택편향\n\n> Raw: [자료](../../${source})\n\n표본 선택에 관한 개념.\n\n[[확증편향]]\n[같은 문서](선택편향.md#정의)\n[웹](https://example.com/)` },
    { path: 'wiki/학습/확증편향.md', title: '확증편향', markdown: `# 확증편향\n\n[자료](${source})\n\n자기 생각에 맞는 정보에 주목한다.\n\n[관련](선택편향.md)` },
  ], summary: '두 개념을 정리했습니다.' });
  assert.equal(result.updated.length, 2);
  const data = await store.getData();
  assert.equal(data.docs.length, 3);
  const concept = data.docs.find((doc) => doc.id.endsWith('/선택편향.md'));
  assert.equal(concept.kind, 'concept');
  assert.ok(concept.related.includes('wiki/학습/확증편향.md'));
  assert.deepEqual(concept.sources.map((entry) => entry.id), [source]);
  assert.ok(data.edges.some(([a, b]) => a === concept.id && b === source || b === concept.id && a === source));
  assert.equal((await readFile(join(root, source))).toString(), before.toString());
  assert.match(await readFile(join(root, 'wiki/index.md'), 'utf8'), /선택편향/);
  assert.match(await readFile(join(root, 'wiki/log.md'), 'utf8'), /두 개념을 정리했습니다/);
  assert.match((await store.getDocument('wiki/학습/확증편향.md')).markdown, /^> Raw:/m);
  assert.equal((await store.getDocument(concept.id)).title, '선택편향');
});

test('updates an existing concept while leaving raw originals unchanged', async (t) => {
  const { root, store } = await fixture(t);
  const { added: [source] } = await store.importFiles([file('facts.md', '# Facts\nOriginal fact.')]);
  const original = await readFile(join(root, source), 'utf8');
  for (const revision of ['First summary.', 'Improved summary.']) {
    await store.commitArticles({ articles: [{ path: 'wiki/topic/fact.md', title: 'Fact', markdown: `# Fact\n\n[원문](../../${source})\n\n${revision}` }], summary: revision });
  }
  assert.match((await store.getDocument('wiki/topic/fact.md')).markdown, /Improved/);
  assert.equal(await readFile(join(root, source), 'utf8'), original);
});

test('untouched article dates survive an index rebuild', async (t) => {
  const { root, store } = await fixture(t);
  const { added: [source] } = await store.importFiles([file('source.txt', 'Old and new facts.')]);
  await mkdir(join(root, 'wiki/topic'), { recursive: true });
  await writeFile(join(root, 'wiki/topic/old.md'), `# Old\n\n> Updated: 2020-01-02\n> Raw: [source](../../${source})\n\nOld fact.\n`);
  await store.commitArticles({ articles: [{ path: 'wiki/topic/new.md', title: 'New', markdown: `# New\n\n[원문](../../${source})\n\nNew fact.` }] });
  assert.match(await readFile(join(root, 'wiki/index.md'), 'utf8'), /\[Old\].*2020-01-02/);
});

test('parallel imports serialize content deduplication', async (t) => {
  const { store } = await fixture(t);
  const results = await Promise.all([
    store.importFiles([file('same1.md', 'same bytes')]),
    store.importFiles([file('same2.md', 'same bytes')]),
  ]);
  assert.equal(results.flatMap((result) => result.added).length, 1);
  assert.equal(results.flatMap((result) => result.duplicates).length, 1);
  assert.equal((await store.getData()).docs.length, 1);
});

test('validates an entire article batch before mutating any file', async (t) => {
  const { root, store } = await fixture(t);
  const { added: [source] } = await store.importFiles([file('facts.txt', 'A fact')]);
  await assert.rejects(store.commitArticles({ articles: [
    { path: 'wiki/topic/good.md', title: 'Good', markdown: `[원문](../../${source})` },
    { path: 'wiki/topic/bad.md', title: 'Bad', markdown: '[없는 원문](../../raw/missing.md)' },
  ] }), /출처|링크/);
  assert.equal((await store.getData()).docs.filter((doc) => doc.kind === 'concept').length, 0);
  assert.doesNotMatch(await readFile(join(root, 'wiki/index.md'), 'utf8'), /Good/);
});

test('refuses traversal, absolute paths, raw writes, and ungrounded articles', async (t) => {
  const { store } = await fixture(t);
  for (const path of ['../escape.md', '/tmp/escape.md', 'wiki/topic/../../escape.md', 'raw/rewrite.md', 'wiki/topic/nested/a.md']) {
    await assert.rejects(store.commitArticles({ articles: [{ path, title: 'No', markdown: 'No' }] }));
  }
  await assert.rejects(store.commitArticles({ articles: [{ path: 'wiki/topic/no.md', title: 'No', markdown: '# No\nNo sources.' }] }), /출처/);
  await assert.rejects(store.getDocument('../secret.md'));
  await assert.rejects(store.importFiles([file('../escape.md', 'No')]));
});

test('ignores external and escaping links when reading existing Markdown', async (t) => {
  const { root, store } = await fixture(t);
  await mkdir(join(root, 'wiki/topic'), { recursive: true });
  await writeFile(join(root, 'wiki/topic/manual.md'), '# Existing\n\n[external](https://example.com)\n[escape](../../../secret.md)\n[script](javascript:alert(1))\n');
  const doc = await store.getDocument('wiki/topic/manual.md');
  assert.deepEqual(doc.related, []);
});

test('never follows symlinks outside the wiki root', async (t) => {
  const { root, store } = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'wiki-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'secret.md'), '# Do not read');
  await symlink(outside, join(root, 'wiki/leak'));
  assert.equal((await store.getData()).docs.length, 0);
  await assert.rejects(store.getDocument('wiki/leak/secret.md'));
  await assert.rejects(store.commitArticles({ articles: [{ path: 'wiki/leak/write.md', title: 'No', markdown: '[source](../../raw/no.md)' }] }));
  assert.deepEqual(await readdir(outside), ['secret.md']);
});

test('HTML input strips executable markup while retaining text and original bytes', async (t) => {
  const { root, store } = await fixture(t);
  const html = '<html><head><style>bad css</style><script>alert("bad")</script></head><body><h1>실험</h1><p>자료 &amp; 설명</p></body></html>';
  const { added: [id] } = await store.importFiles([file('실험.html', html)]);
  const doc = await store.getDocument(id);
  assert.match(doc.markdown, /자료 & 설명/);
  assert.doesNotMatch(doc.markdown, /alert|bad css|<script>/);
  const [original] = await readdir(join(root, 'raw/assets'));
  assert.equal(await readFile(join(root, 'raw/assets', original), 'utf8'), html);
});

test('unreadable files retain originals and report failure without successful source nodes', async (t) => {
  const { root, store } = await fixture(t);
  const result = await store.importFiles([file('broken.pdf', 'not a PDF')]);
  assert.equal(result.added.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal((await readdir(join(root, 'raw/assets'))).length, 1);
  assert.equal((await store.getData()).docs.length, 0);
});

test('extracts a real text PDF when pdftotext is installed', async (t) => {
  const { store } = await fixture(t);
  if (!(await store.getImportCapabilities()).pdf.available) { t.skip('pdftotext is optional and not installed'); return; }
  const stream = 'BT /F1 12 Tf 50 100 Td (A source document.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const result = await store.importFiles([file('읽기.pdf', pdf)]);
  assert.equal(result.warnings.length, 0);
  assert.match((await store.getDocument(result.added[0])).markdown, /A source document/);
});

test('extracts real DOCX XML with Python standard library', async (t) => {
  const { store } = await fixture(t);
  let bytes;
  try {
    bytes = execFileSync('python3', ['-c', 'import io,zipfile\nb=io.BytesIO()\nz=zipfile.ZipFile(b,"w")\nz.writestr("word/document.xml",\'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>학습 자료의 개념</w:t></w:r></w:p></w:body></w:document>\')\nz.close()\nimport sys;sys.stdout.buffer.write(b.getvalue())']);
  } catch (error) { if (error.code === 'ENOENT') { t.skip('python3 is optional and not installed'); return; } throw error; }
  const result = await store.importFiles([file('학습.docx', bytes)]);
  assert.equal(result.warnings.length, 0);
  assert.match((await store.getDocument(result.added[0])).markdown, /학습 자료의 개념/);
});

test('import limits are enforced before any write', async (t) => {
  const { root, store } = await fixture(t);
  await assert.rejects(store.importFiles(Array.from({ length: 31 }, (_, i) => file(`${i}.txt`, 'test'))), /30/);
  await assert.rejects(store.importFiles([{ name: 'invalid.txt', content: '@@@', encoding: 'base64' }]));
  assert.deepEqual(await readdir(join(root, 'raw/assets')), []);
});


test('DOCX uses a verified Python 3 available as python without changing the parent environment', async t => {
  if (process.platform === 'win32') { t.skip('POSIX isolated PATH fixture; Windows command selection has separate coverage'); return; }
  let python;
  try { python = execFileSync('python3', ['-c', 'import sys;print(sys.executable)'], { encoding: 'utf8' }).trim(); }
  catch { t.skip('Python 3 is optional'); return; }
  const root = await mkdtemp(join(tmpdir(), 'wiki DOCX 학생 공백 '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tools = join(root, '실행 도구'); await mkdir(tools); await symlink(python, join(tools, 'python'));
  const bytes = execFileSync(python, ['-c', 'import io,zipfile,sys\nb=io.BytesIO()\nz=zipfile.ZipFile(b,"w")\nz.writestr("word/document.xml",\'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>내 학습 자료의 개념</w:t></w:r></w:p></w:body></w:document>\')\nz.close()\nsys.stdout.buffer.write(b.getvalue())']);
  const moduleUrl = new URL('../lib/store.mjs', import.meta.url).href;
  const source = `import {WikiStore} from ${JSON.stringify(moduleUrl)};const store=await new WikiStore(${JSON.stringify(join(root, '개인 위키'))}).init();const r=await store.importFiles([{name:'학습 자료.docx',content:${JSON.stringify(bytes.toString('base64'))},encoding:'base64'}]);const data=await store.getData();console.log(JSON.stringify({added:r.added.length,warnings:r.warnings,text:data.docs[0]?.markdown}));`;
  const before = process.env.PATH;
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: source, env: { ...process.env, PATH: tools }, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.added, 1, JSON.stringify(output.warnings));
  assert.deepEqual(output.warnings, []);
  assert.match(output.text, /내 학습 자료의 개념/);
  assert.equal(process.env.PATH, before);
});
