import * as client from '../public/app.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML, resolveDocumentLink, renderMarkdown, consumeNDJSON, quoteDisplayText, findQuoteRanges, importWarnings, readerMarkdown, providerStatusText, graphLabelLines } from '../public/app.js';

const documents = [
  { id: 'concept/one"<x>', path: 'wiki/concepts/one.md', title: '첫 개념' },
  { id: 'source-a', path: 'raw/source.md', title: '출처 문서' }
];

test('raw HTML and unsafe URLs cannot create executable elements', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[위험](javascript:alert(1))\n[위험2](data:text/html,hello)\n![그림](https://example.com/image.png)');
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img|href="javascript:|href="data:/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('document links resolve relative paths, URI encoded paths and wiki titles with escaped IDs', () => {
  assert.equal(resolveDocumentLink('../../raw/source.md', 'wiki/concepts/one.md', documents)?.id, 'source-a');
  assert.equal(resolveDocumentLink('%EC%B2%AB%20%EA%B0%9C%EB%85%90', '', documents)?.id, documents[0].id);
  const html = renderMarkdown('[자료](../../raw/source.md) [[첫 개념|설명]]', { documents, currentPath: 'wiki/concepts/one.md' });
  assert.match(html, /data-doc="source-a"/);
  assert.match(html, /data-doc="concept\/one&quot;&lt;x&gt;"/);
  assert.equal(resolveDocumentLink('javascript:evil', '', documents), null);
  assert.equal(resolveDocumentLink('//example.com/a', '', documents), null);
});

test('headings, tables and fenced code stay readable and safe', () => {
  const html = renderMarkdown('# 제목\n\n| 개념 | 의미 |\n| --- | --- |\n| A | **중요** |\n\n```html\n<img src=x onerror=alert(1)>\n```\n\n> 원문\n\n- 하나\n- 둘');
  assert.match(html, /<h1>제목<\/h1>/);
  assert.match(html, /<table>/);
  assert.match(html, /<strong>중요<\/strong>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<ul><li>하나/);
  assert.equal(escapeHTML('\"><b>'), '&quot;&gt;&lt;b&gt;');
});

function chunkedResponse(text, size = 5) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += size) controller.enqueue(bytes.slice(index, index + size)); controller.close(); } }));
}

test('NDJSON reads split unicode and a final line without newline, ignores intermediate JSON deltas as data', async () => {
  const events = [];
  const response = chunkedResponse(JSON.stringify({ type: 'status', message: '자료를 읽어요' }) + '\n' + JSON.stringify({ type: 'delta', text: '{"answer":' }) + '\n' + JSON.stringify({ type: 'done', data: { answer: '답변입니다', citations: [] } }), 2);
  const result = await consumeNDJSON(response, event => events.push(event));
  assert.equal(result.answer, '답변입니다');
  assert.equal(events[0].message, '자료를 읽어요');
  assert.equal(events.length, 3);
});

test('NDJSON rejects explicit failures, failed HTTP requests and interrupted streams', async () => {
  await assert.rejects(consumeNDJSON(chunkedResponse('{"type":"error","message":"로그인해주세요"}\n'), () => {}), /로그인/);
  await assert.rejects(consumeNDJSON(new Response('{"error":"허용하지 않은 요청"}', { status: 403 }), () => {}), /허용하지/);
  await assert.rejects(consumeNDJSON(chunkedResponse('{"type":"status","message":"진행중"}\n'), () => {}), /멈췄어요/);
});


test('source quote formatting is removed without changing the actual words or executing quoted HTML', () => {
  assert.equal(quoteDisplayText('**중요한 개념**을 `직접` 확인하고\n[원문](../../raw/note.md)을 읽어요.'), '중요한 개념을 직접 확인하고 원문을 읽어요.');
  assert.equal(quoteDisplayText('# 제목\n\n> 설명은 __그대로__\n- 첫 자료'), '제목 설명은 그대로 첫 자료');
  assert.equal(quoteDisplayText('<script>인용된 내용</script>'), '<script>인용된 내용</script>');
  assert.equal(quoteDisplayText('[[concept|개념 이름]]\n다음 설명'), '개념 이름 다음 설명');
});

test('a formatted source quote maps across inline nodes and line or paragraph breaks', () => {
  const runs = [
    { text: '앞부분. 개념을 ' },
    { text: '연결해서' },
    { text: ' 살펴봐요.' },
    { text: '다른 자료도 확인해요. 뒷부분.', breakBefore: true }
  ];
  const ranges = findQuoteRanges(runs, '개념을 **연결해서** 살펴봐요.\n다른 자료도 확인해요.');
  assert.deepEqual(ranges, [
    { run: 0, start: 5, end: 9 },
    { run: 1, start: 0, end: 4 },
    { run: 2, start: 0, end: 6 },
    { run: 3, start: 0, end: 12 }
  ]);
  assert.deepEqual(findQuoteRanges(runs, '원문에 없는 설명'), []);
  assert.deepEqual(findQuoteRanges(runs, '** **'), []);
});

test('quote range matching collapses whitespace and retains offsets for exact source highlighting', () => {
  const runs = [{ text: '  첫   설명\n' }, { text: '두 번째' }, { text: ' 내용', breakBefore: true }];
  const ranges = findQuoteRanges(runs, '첫 설명\n두 번째 내용');
  assert.deepEqual(ranges, [
    { run: 0, start: 2, end: 9 },
    { run: 1, start: 0, end: 4 },
    { run: 2, start: 0, end: 3 }
  ]);
  assert.deepEqual(findQuoteRanges([{ text: '1 + 2 = 3' }], '1 + 2 = 3'), [{ run: 0, start: 0, end: 9 }]);
});

test('import results retain each failed file warning and support structured warnings', () => {
  const warnings = importWarnings({ imported: { added: ['one'], warnings: ['bad.pdf: 읽지 못했어요. 원본은 보관했습니다.', { name: 'second.docx', message: 'Python 3이 필요해요.' }, { name: 'third.txt', message: 'third.txt: 인코딩을 확인해주세요.' }, null, {}] } });
  assert.deepEqual(warnings, ['bad.pdf: 읽지 못했어요. 원본은 보관했습니다.', 'second.docx: Python 3이 필요해요.', 'third.txt: 인코딩을 확인해주세요.']);
  assert.deepEqual(importWarnings({ imported: { warnings: [] } }), []);
  assert.deepEqual(importWarnings({}), []);
});


test('reader hides only opening provenance and duplicate title without changing the stored note', () => {
  const original = '# 개념\n\n> Sources: 저자, 2026\n> Raw: [자료](../../raw/one.md)\n> Updated: 2026-10-22\n\n본문입니다.\n\n> 중요한 원문 인용입니다.\n\n> Sources: 본문에서 설명하는 예시';
  const body = readerMarkdown(original, '개념');
  assert.equal(body, '본문입니다.\n\n> 중요한 원문 인용입니다.\n\n> Sources: 본문에서 설명하는 예시');
  assert.match(original, /> Updated: 2026-10-22/);
  assert.equal(readerMarkdown('> 중요한 원문 인용\n\n설명', '개념'), '> 중요한 원문 인용\n\n설명');
  assert.equal(readerMarkdown('# 다른 제목\n\n> Raw: [자료](raw/a.md)\n\n설명', '문서 제목'), '# 다른 제목\n\n설명');
});

test('reader removes opening frontmatter before metadata, preserves an adjacent actual quote and escapes HTML on render', () => {
  const original = '\uFEFF---\r\ntitle: 개념\r\nkind: concept\r\n---\r\n# 개념\r\n\r\n> Sources: 저자\r\n> Updated: 오늘\r\n> 실제 인용은 남아야 합니다.\r\n\r\n<script>alert(1)</script>';
  const body = readerMarkdown(original, '개념');
  assert.equal(body, '> 실제 인용은 남아야 합니다.\n\n<script>alert(1)</script>');
  assert.match(renderMarkdown(body), /&lt;script&gt;/);
  assert.doesNotMatch(renderMarkdown(body), /<script>/);
  assert.equal(readerMarkdown('---\n끝나지 않은 frontmatter', ''), '---\n끝나지 않은 frontmatter');
});


test('provider status separates missing CLI, logged out and unconfirmed state without showing protocol logs', () => {
  const raw = 'keychain protocol stderr 터미널 진단';
  assert.equal(providerStatusText({ installed: true, authenticated: false, message: raw }, 'claude'), 'Claude Code에서 로그인한 뒤 ‘다시 확인’을 눌러주세요.');
  assert.match(providerStatusText({ installed: false, authenticated: false, message: raw }, 'codex'), /Codex CLI를 설치/);
  assert.match(providerStatusText({ installed: true, authenticated: null, message: raw }, 'claude'), /실행 상태를 확인하지 못했어요/);
  assert.match(providerStatusText({ installed: true, authenticated: true, message: raw }, 'codex'), /Codex 연결됨/);
  assert.doesNotMatch(providerStatusText({ installed: true, authenticated: false, message: raw }, 'claude'), /keychain|protocol|stderr|터미널/);
});


test('reader hides the complete import envelope and repeated source title but keeps original Korean provenance', () => {
  const hash = 'a'.repeat(64), asset = `assets/${hash}-note.md.original`;
  const envelope = `# 원문 제목\n\n> Source: [note.md](${asset})\n> Collected: 2026-10-22\n> Published: Unknown\n\n- Original: [note.md](${asset})\n- Content hash: ${hash}\n\n---\n\n`;
  const originalBody = '# 원문 제목\n\n> 출처: 실제 한국어 자료\n> 읽은 날: 2026-10-21\n\n본문\n\n> Source: 원문에서 직접 인용한 문구';
  const stored = envelope + originalBody;
  assert.equal(readerMarkdown(stored, '원문 제목'), '> 출처: 실제 한국어 자료\n> 읽은 날: 2026-10-21\n\n본문\n\n> Source: 원문에서 직접 인용한 문구');
  assert.match(stored, /Content hash:/);
});

test('reader preserves incomplete or mismatched importer-looking quotes and a different original heading', () => {
  const hash = 'b'.repeat(64), asset = `assets/${hash}-note.md.original`;
  const partial = `> Source: [note.md](${asset})\n> Collected: 2026-10-22\n> Published: Unknown\n\n본문 인용`;
  assert.equal(readerMarkdown(partial), partial);
  const invalid = `${partial.split('\n\n본문 인용')[0]}\n\n- Original: [다른 원문](assets/other.original)\n- Content hash: ${hash}\n\n---\n\n내용`;
  assert.equal(readerMarkdown(invalid), invalid);
  const complete = `> Source: [note.md](${asset})\n> Collected: 2026-10-22\n> Published: Unknown\n\n- Original: [note.md](${asset})\n- Content hash: ${hash}\n\n---\n\n# 원래 소제목\n\n> 출처: 보존`;
  assert.equal(readerMarkdown(complete, '외부 제목'), '# 원래 소제목\n\n> 출처: 보존');
});


test('graph labels wrap long Korean titles into at most two short lines while short names stay intact', () => {
  assert.deepEqual(graphLabelLines('RAG'), ['RAG']);
  assert.deepEqual(graphLabelLines('온톨로지'), ['온톨로지']);
  assert.deepEqual(graphLabelLines('온톨로지: 사실과 규칙을 연결하는 추론'), ['온톨로지:', '사실과 규칙…']);
  assert.deepEqual(graphLabelLines('가나다라마바사아자차카타파하거너더러'), ['가나다라마바사', '아자차카타파…']);
  assert.equal(graphLabelLines('  시맨틱   레이어: 지표와 계산기를  연결하기 ').length, 2);
});


test('a first visit selects the authenticated Claude instead of an unavailable Codex', () => {
  assert.equal(typeof client.chooseInitialProvider, 'function');
  const providers = [{id:'codex',installed:false,authenticated:false},{id:'claude',installed:true,authenticated:true}];
  assert.equal(client.chooseInitialProvider(null, providers), 'claude');
});

test('an explicit tool choice is preserved when a different tool is connected', () => {
  const providers = [{id:'codex',installed:false,authenticated:false},{id:'claude',installed:true,authenticated:true}];
  assert.equal(client.chooseInitialProvider('codex', providers), 'codex');
  assert.equal(client.chooseInitialProvider('invalid', providers), 'claude');
});

test('without an authenticated tool the installed tool is selected for login guidance', () => {
  assert.equal(client.chooseInitialProvider(null, [{id:'codex',installed:false,authenticated:false},{id:'claude',installed:true,authenticated:false}]), 'claude');
  assert.equal(client.chooseInitialProvider(null, []), 'codex');
  assert.equal(client.chooseInitialProvider(null, [{id:'codex',installed:true,authenticated:true},{id:'claude',installed:true,authenticated:true}]), 'codex');
});

test('file preparation guidance separates available tools, missing tools and an unconfirmed check', () => {
  assert.equal(typeof client.importPreparationText, 'function');
  assert.match(client.importPreparationText({pdf:{available:true},docx:{available:false}}), /PDF.*읽을 수/);
  assert.match(client.importPreparationText({pdf:{available:true},docx:{available:false}}), /Word.*Python 3.*필요/);
  assert.match(client.importPreparationText({pdf:{available:false},docx:{available:true}}), /PDF.*변환.*필요/);
  assert.match(client.importPreparationText({pdf:{available:false},docx:{available:true}}), /Word.*읽을 수/);
  assert.match(client.importPreparationText(), /확인 중/);
});


test('a saved unavailable tool offers the connected alternative without suggesting a reinstall only', () => {
  const selected = {id:'codex',installed:false,authenticated:false};
  assert.match(providerStatusText(selected, 'codex', [selected,{id:'claude',installed:true,authenticated:true}]), /Claude.*선택/);
});
