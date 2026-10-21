'use strict';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const normalizePath = path => {
  const result = [];
  for (const part of String(path).replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') result.pop(); else result.push(part);
  }
  return result.join('/');
};

export function resolveDocumentLink(target, currentPath, documents) {
  let path;
  try { path = decodeURIComponent(String(target).split('#')[0]); } catch { return null; }
  if (!path || /^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//')) return null;
  const relative = normalizePath(`${String(currentPath || '').split('/').slice(0, -1).join('/')}/${path}`);
  const absolute = normalizePath(path);
  const title = path.replace(/\.(md|markdown)$/i, '').split('/').pop();
  return documents.find(document => document.id === path || normalizePath(document.path) === relative || normalizePath(document.path) === absolute)
    || documents.find(document => document.title === path || document.title === title) || null;
}

export function renderMarkdown(markdown, { documents = [], currentPath = '' } = {}) {
  const inline = (value, nesting = 0) => {
    if (nesting > 5) return escapeHTML(value);
    const tokens = /(`[^`\n]+`|\[\[[^\]\n]+\]\]|!?\[[^\]\n]*\]\([^\s)]+(?:\s+"[^"]*")?\)|\*\*[^*\n]+\*\*|__[^_\n]+__)/g;
    let output = '', last = 0, match;
    while ((match = tokens.exec(value))) {
      output += escapeHTML(value.slice(last, match.index));
      const token = match[0];
      if (token.startsWith('`')) output += `<code>${escapeHTML(token.slice(1, -1))}</code>`;
      else if (token.startsWith('**') || token.startsWith('__')) output += `<strong>${inline(token.slice(2, -2), nesting + 1)}</strong>`;
      else {
        let label, target;
        if (token.startsWith('[[')) { const [path, alias] = token.slice(2, -2).split('|'); target = path; label = alias || path; }
        else { const link = token.match(/^!?\[([^\]]*)\]\(([^\s)]+)/); label = link[1]; target = link[2]; }
        const document = resolveDocumentLink(target, currentPath, documents);
        if (document) output += `<button type="button" class="text-link" data-doc="${escapeHTML(document.id)}">${escapeHTML(label)}</button>`;
        else if (/^https:\/\//i.test(target)) {
          try { const url = new URL(target); output += url.protocol === 'https:' ? `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label || url.hostname)}</a>` : escapeHTML(label); }
          catch { output += escapeHTML(label); }
        } else output += escapeHTML(label);
      }
      last = match.index + token.length;
    }
    return output + escapeHTML(value.slice(last));
  };
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
  let output = '', index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^\s*(```|~~~)/.test(line)) {
      const fence = line.trim().slice(0, 3), block = []; index++;
      while (index < lines.length && !lines[index].trim().startsWith(fence)) block.push(lines[index++]);
      index++; output += `<pre><code>${escapeHTML(block.join('\n'))}</code></pre>`; continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { const level = Math.min(heading[1].length, 4); output += `<h${level}>${inline(heading[2])}</h${level}>`; index++; continue; }
    if (/^\s*>/.test(line)) {
      const block = []; while (index < lines.length && /^\s*>/.test(lines[index])) block.push(lines[index++].replace(/^\s*>\s?/, ''));
      output += `<blockquote><p>${block.map(text => inline(text)).join('<br>')}</p></blockquote>`; continue;
    }
    if (index + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1]) && /^[\s|:\-]+$/.test(lines[index + 1])) {
      const headings = cells(line); index += 2; const rows = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(cells(lines[index++]));
      output += `<div class="table-scroll"><table><thead><tr>${headings.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; continue;
    }
    if (/^\s*([-*+]\s+|\d+[.)]\s+)/.test(line)) {
      const ordered = /^\s*\d/.test(line), tag = ordered ? 'ol' : 'ul', items = [];
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      while (index < lines.length && pattern.test(lines[index])) items.push(lines[index++].replace(pattern, ''));
      output += `<${tag}>${items.map(item => `<li>${inline(item)}</li>`).join('')}</${tag}>`; continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { output += '<hr>'; index++; continue; }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|\s*>|\s*```|\s*~~~|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[index]) && !(index + 1 < lines.length && lines[index].includes('|') && /^[\s|:\-]+$/.test(lines[index + 1]))) paragraph.push(lines[index++]);
    output += `<p>${paragraph.map(text => inline(text)).join('<br>')}</p>`;
  }
  return output;
}

// The stored note keeps its provenance. The reader already shows source cards,
// so hide only the opening template metadata, leaving quoted content intact.
export function readerMarkdown(value, title = '') {
  let body = String(value ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '').replace(/^\n+/, '');
  let heading = '';
  const firstHeading = body.match(/^#\s+([^\n]+)(?:\n|$)/);
  if (firstHeading) {
    if (firstHeading[1].trim() !== String(title).trim()) heading = firstHeading[0].trimEnd() + '\n\n';
    body = body.slice(firstHeading[0].length).replace(/^\n+/, '');
  }
  // Strip the importer envelope only when its complete fields agree on the
  // original asset and hash. A normal quoted Source line is source content.
  const imported = body.match(/^>[ \t]*Source:[ \t]*\[[^\]\n]*\]\((assets\/([a-f0-9]{64})-[^\n)]+\.original)\)[ \t]*\n>[ \t]*Collected:[ \t]*\d{4}-\d{2}-\d{2}[ \t]*\n>[ \t]*Published:[^\n]+\n[ \t]*\n-[ \t]*Original:[ \t]*\[[^\]\n]*\]\(\1\)[ \t]*\n-[ \t]*Content hash:[ \t]*\2[ \t]*\n[ \t]*\n---[ \t]*(?:\n|$)(?:[ \t]*\n)*/);
  if (imported) {
    body = body.slice(imported[0].length);
    body = body.replace(/^#\s+([^\n]+)(?:\n|$)/, (match, sourceTitle) => sourceTitle.trim() === String(title).trim() ? '' : match).replace(/^\n+/, '');
  }
  body = body.replace(/^(?:[ \t]*>[ \t]*(?:Sources|Raw|Updated):[^\n]*(?:\n|$))+/, '').replace(/^\n+/, '');
  return heading + body;
}

// Quotes come from the stored Markdown, while the reader displays formatted text.
// Keep the wording and punctuation; remove only the formatting our renderer handles.
export function quoteDisplayText(value) {
  return String(value ?? '')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/^\s*(```|~~~)[^\n]*$/gm, '')
    .replace(/\[\[([^\]\n]+)\]\]/g, (_, target) => target.split('|').slice(1).join('|') || target)
    .replace(/!?\[([^\]\n]*)\]\([^\s)]+(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\\([\\`*{}\[\]()#+.!_>\-])/g, '$1')
    .replace(/\s+/g, ' ').trim();
}

// Return text-node offsets instead of HTML so callers can mark a quote without
// replacing source markup, splitting links, or treating quoted text as code.
export function findQuoteRanges(runs, quote) {
  const needle = quoteDisplayText(quote);
  if (!needle) return [];
  let text = '';
  const offsets = [];
  const append = (character, point) => {
    if (/\s/.test(character)) {
      if (!text || text.endsWith(' ')) return;
      text += ' '; offsets.push(point); return;
    }
    text += character; offsets.push(point);
  };
  runs.forEach((run, runIndex) => {
    if (run.breakBefore) append(' ', null);
    const value = String(run.text ?? '');
    for (let index = 0; index < value.length; index++) append(value[index], { run: runIndex, index });
  });
  const start = text.indexOf(needle);
  if (start < 0) return [];
  const matched = offsets.slice(start, start + needle.length).filter(Boolean);
  if (!matched.length) return [];
  const first = matched[0], last = matched[matched.length - 1], ranges = [];
  for (let run = first.run; run <= last.run; run++) {
    const from = run === first.run ? first.index : 0;
    const to = run === last.run ? last.index + 1 : String(runs[run].text ?? '').length;
    if (to > from) ranges.push({ run, start: from, end: to });
  }
  return ranges;
}

export function graphLabelLines(value) {
  const characters = Array.from(String(value ?? '').replace(/\s+/g, ' ').trim());
  const width = text => Array.from(text).reduce((total, character) => total + (/\s/.test(character) ? .35 : /[\x20-\x7e]/.test(character) ? .55 : 1), 0);
  const lines = [];
  let remaining = characters.join('');
  while (remaining && lines.length < 2) {
    let count = 0, used = 0;
    const pending = Array.from(remaining);
    while (count < pending.length && used + width(pending[count]) <= 7) used += width(pending[count++]);
    if (count === pending.length) { lines.push(remaining); break; }
    const candidate = pending.slice(0, count).join(''), space = candidate.lastIndexOf(' ');
    if (space >= 2) count = Array.from(candidate.slice(0, space)).length;
    let line = pending.slice(0, count).join('').trimEnd();
    remaining = pending.slice(count).join('').trimStart();
    if (lines.length === 1 && remaining) {
      while (width(line) > 6) line = Array.from(line).slice(0, -1).join('').trimEnd();
      line += '…';
    }
    lines.push(line);
  }
  return lines;
}

export function providerStatusText(provider, id) {
  const name = id === 'claude' ? 'Claude Code' : 'Codex';
  if (!provider) return 'AI 연결 상태를 확인하지 못했어요. ‘다시 확인’을 눌러주세요.';
  if (!provider.installed) return `${name} CLI를 설치한 뒤 ‘다시 확인’을 눌러주세요.`;
  if (provider.authenticated === false) return `${name}에서 로그인한 뒤 ‘다시 확인’을 눌러주세요.`;
  if (provider.authenticated !== true) return `${name}의 실행 상태를 확인하지 못했어요. ‘다시 확인’을 눌러주세요.`;
  return `${name} 연결됨 · 자료를 추가하거나 위키에 질문해보세요.`;
}

export function importWarnings(result) {
  const warnings = result?.imported?.warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.flatMap(warning => {
    if (typeof warning === 'string') return warning.trim() ? [warning] : [];
    if (!warning || typeof warning.message !== 'string' || !warning.message.trim()) return [];
    const file = warning.name || warning.filename || warning.file;
    return [typeof file === 'string' && file && !warning.message.startsWith(file) ? `${file}: ${warning.message}` : warning.message];
  });
}

export async function consumeNDJSON(response, onEvent) {
  if (!response.ok) {
    let message = `요청을 처리하지 못했어요. (${response.status})`;
    try { const error = await response.json(); message = error.error || error.message || message; } catch {}
    throw new Error(message);
  }
  if (!response.body) throw new Error('응답을 받지 못했어요. 다시 시도해주세요.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '', finished = false, result;
  const process = line => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.message || '작업을 마치지 못했어요.');
    if (event.type === 'done') { finished = true; result = event.data; }
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) process(line);
      if (done) break;
    }
    if (pending.trim()) process(pending);
  } finally { reader.releaseLock(); }
  if (!finished) throw new Error('연결이 끝나기 전에 작업이 멈췄어요. 다시 시도해주세요.');
  return result;
}

if (typeof document !== 'undefined') boot();

function boot() {
  const $ = id => document.getElementById(id);
  const icon = id => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const state = { data: { docs: [], edges: [], providers: [] }, docs: new Map(), selected: null, history: [], position: -1, zoom: 1, view: 'map', fullMap: false, busy: false, abort: null, chats: new Map(), pendingQuestion: null, provider: 'codex', toastTimer: null };
  try { state.provider = localStorage.getItem('wiki-provider') || 'codex'; } catch {}
  $('provider').value = state.provider;
  const currentChat = () => {
    if (!state.chats.has(state.provider)) state.chats.set(state.provider, { messages: [], conversationId: null, suggestions: [] });
    return state.chats.get(state.provider);
  };
  const chosenProvider = () => (state.data.providers || []).find(provider => provider.id === state.provider);
  const ready = () => { const provider = chosenProvider(); return !!provider?.installed && provider.authenticated === true; };
  const markdown = (value, path = '') => renderMarkdown(value, { documents: state.data.docs, currentPath: path });
  function showPanel(name) {
    document.querySelectorAll('[data-panel-name]').forEach(element => element.classList.toggle('mobile-active', element.dataset.panelName === name));
    document.querySelectorAll('[data-panel]').forEach(element => element.setAttribute('aria-selected', String(element.dataset.panel === name)));
  }
  function toast(message) {
    clearTimeout(state.toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    state.toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
  }
  function updateControls() {
    const blocked = state.busy || !!state.data.busy;
    $('provider').disabled = blocked; $('add-files').disabled = blocked || !ready();
    $('send').disabled = blocked || !ready() || !state.data.docs.length || !$('question').value.trim();
    $('question').disabled = blocked; $('new-chat').disabled = blocked;
    document.querySelectorAll('[data-add-files]').forEach(button => { button.disabled = blocked || !ready(); });
    $('cancel').hidden = !state.busy; $('refresh-state').disabled = blocked;
  }
  function connectionStatus() {
    const provider = chosenProvider();
    $('connection-note').classList.toggle('ready', ready());
    $('connection-note').classList.toggle('error', !!provider && !ready());
    $('connection-message').textContent = providerStatusText(provider, state.provider);
    updateControls();
  }
  async function refresh() {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error('위키를 불러오지 못했어요. 서버가 실행 중인지 확인해주세요.');
    applyState(await response.json());
  }
  function applyState(data) {
    state.data = { docs: [], edges: [], providers: [], ...data };
    state.data.docs = state.data.docs.map(doc => ({ related: [], sources: [], markdown: '', summary: '', ...doc }));
    state.docs = new Map(state.data.docs.map(doc => [doc.id, doc]));
    if (!state.docs.has(state.selected)) {
      state.selected = state.data.docs.find(doc => doc.kind === 'concept')?.id || state.data.docs[0]?.id || null;
      state.history = state.selected ? [state.selected] : []; state.position = state.history.length - 1;
    }
    const subtitle = typeof data.title === 'string' ? data.title.trim() : '';
    $('wiki-title').textContent = !subtitle || /^내\s*위키$/.test(subtitle) ? '탐색과 질문' : subtitle;
    graph(); renderDocument(); renderMessages(); connectionStatus();
  }
  function graph() {
    const near = new Set(state.selected ? [state.selected] : []), selected = state.docs.get(state.selected);
    for (const id of selected?.related || []) near.add(id);
    for (const source of selected?.sources || []) near.add(source.id);
    for (const [a, b] of state.data.edges) { if (a === state.selected) near.add(b); if (b === state.selected) near.add(a); }
    const visible = state.data.docs.filter(doc => state.fullMap || near.has(doc.id));
    const others = visible.filter(doc => doc.id !== state.selected);
    const positions = new Map();
    const width = Math.max(420, Math.ceil(Math.sqrt(visible.length)) * 110), height = Math.max(540, Math.ceil(Math.sqrt(visible.length)) * 125);
    state.graphWidth = width; state.graphHeight = height;
    if (state.selected) positions.set(state.selected, { x: width / 2, y: height / 2 - 20 });
    const perRing = Math.max(6, Math.ceil(Math.sqrt(others.length) * 2.8));
    others.forEach((doc, index) => {
      const ring = Math.floor(index / perRing), count = Math.min(perRing, others.length - ring * perRing), offset = index % perRing;
      const angle = (offset / count) * Math.PI * 2 - Math.PI / 2 + ring * .23;
      const radius = 115 + ring * 95;
      positions.set(doc.id, { x: width / 2 + Math.cos(angle) * Math.min(radius, width * .38), y: height / 2 - 20 + Math.sin(angle) * Math.min(radius * 1.28, height * .38) });
    });
    const lines = state.data.edges.map(([a, b]) => {
      const one = positions.get(a), two = positions.get(b); if (!one || !two) return '';
      return `<line class="graph-edge ${a === state.selected || b === state.selected ? 'active' : ''}" x1="${one.x}" y1="${one.y}" x2="${two.x}" y2="${two.y}"/>`;
    }).join('');
    const nodes = visible.map(doc => {
      const point = positions.get(doc.id), selected = doc.id === state.selected, source = doc.kind === 'source';
      const labels = graphLabelLines(doc.title);
      return `<g class="node ${source ? 'source' : 'concept'} ${selected ? 'selected' : ''}" transform="translate(${point.x},${point.y})" role="button" tabindex="0" aria-label="${escapeHTML(doc.title)} ${source ? '자료' : '개념'} 열기" aria-pressed="${selected}" data-doc="${escapeHTML(doc.id)}"><title>${escapeHTML(doc.title)}</title><rect class="node-hit" x="-55" y="-28" width="110" height="95" rx="8"/>${selected ? '<circle class="selected-halo" r="29"/>' : ''}${source ? '<rect class="node-shape" x="-16" y="-19" width="32" height="38" rx="7"/><path class="node-icon" d="M-7-7H7M-7 0H7M-7 7H3"/>' : `<circle class="node-shape" r="${selected ? 13 : 9}"/>`}<text y="40">${labels.map((label, index) => `<tspan x="0" dy="${index ? 18 : 0}">${escapeHTML(label)}</tspan>`).join('')}</text></g>`;
    }).join('');
    $('graph').innerHTML = lines + nodes;
    $('graph-container').classList.toggle('dense', visible.length > 6);
    $('graph-container').querySelector('.empty-graph')?.remove();
    if (!visible.length) $('graph-container').insertAdjacentHTML('beforeend', '<div class="empty-graph">내 자료로 첫 위키를 만들어보세요.<br>위의 ‘자료 추가’를 눌러 시작해요.</div>');
    applyZoom();
    $('map-count').textContent = state.data.docs.length ? `${visible.length} / ${state.data.docs.length}개 문서` : '첫 자료를 기다리고 있어요.';
    $('map-scope').hidden = !state.selected || state.data.docs.length < 2;
    $('map-scope').textContent = state.fullMap ? '주변 연결만 보기' : '전체 지도 보기';
    $('map-scope').setAttribute('aria-pressed', String(state.fullMap));
    $('map-intro').textContent = state.selected ? '개념을 누르면 문서와 연결된 자료가 보여요.' : '자료가 쌓이면 개념 사이의 연결이 보여요.';
    $('map-list').innerHTML = state.data.docs.length ? state.data.docs.map(doc => `<button data-doc="${escapeHTML(doc.id)}" aria-current="${doc.id === state.selected}"><span class="kind-symbol ${doc.kind === 'source' ? 'source' : ''}">${doc.kind === 'source' ? icon('doc') : '•'}</span><span><strong>${escapeHTML(doc.title)}</strong><small>${escapeHTML(doc.summary || (doc.kind === 'source' ? '내가 추가한 자료' : '개념 노트'))}</small></span></button>`).join('') : '<p class="search-empty">자료를 추가하면 문서 목록이 생겨요.</p>';
  }
  function applyZoom() {
    const width = state.graphWidth || 420, height = state.graphHeight || 540;
    $('graph').setAttribute('viewBox', `${(width - width / state.zoom) / 2} ${(height - height / state.zoom) / 2} ${width / state.zoom} ${height / state.zoom}`);
    $('zoom-in').disabled = state.zoom >= 1.8; $('zoom-out').disabled = state.zoom <= .6;
  }
  function renderDocument(quote) {
    const doc = state.docs.get(state.selected);
    if (!doc) {
      $('document').innerHTML = '<div class="empty-document"><div class="document-kicker">내 자료로 시작하기</div><h1>흩어진 자료를<br>하나의 위키로.</h1><p>강의노트, 메모, 읽던 문서를 추가해보세요. AI가 개념별로 정리하고 자료 사이를 연결해줘요.</p><button class="primary-button" data-add-files>첫 자료 추가하기</button></div>';
      $('context-title').textContent = '위키 전체';
    } else {
      const body = readerMarkdown(doc.markdown, doc.title);
      const related = doc.related.filter(id => state.docs.has(id));
      $('document').innerHTML = `<div class="document-kicker ${doc.kind === 'source' ? 'source' : ''}"><span class="tiny-dot"></span>${doc.kind === 'source' ? '내 자료' : '개념 노트'}</div><h1 tabindex="-1" id="document-title">${escapeHTML(doc.title)}</h1>${doc.summary ? `<p class="document-summary">${escapeHTML(doc.summary)}</p>` : ''}<div class="document-rule"></div><div class="document-content">${markdown(body, doc.path)}</div>${related.length ? `<section class="document-section"><h2>연결된 개념과 자료</h2><div class="related-links">${related.map(id => `<button class="related-link" data-doc="${escapeHTML(id)}">${escapeHTML(state.docs.get(id).title)}</button>`).join('')}</div></section>` : ''}${doc.sources.length ? `<section class="document-section"><h2>이 개념이 나온 자료</h2>${doc.sources.map(source => state.docs.has(source.id) ? `<button class="source-link" data-doc="${escapeHTML(source.id)}" data-quote="${escapeHTML(source.excerpt || '')}">${icon('doc')}<span><strong>${escapeHTML(state.docs.get(source.id).title || source.label)}</strong><small>${escapeHTML(source.excerpt || source.label || '')}</small></span></button>` : '').join('')}</section>` : ''}`;
      $('context-title').textContent = doc.title;
    }
    $('history-back').disabled = state.position <= 0; $('history-forward').disabled = state.position >= state.history.length - 1;
    $('document-scroll').scrollTop = 0;
    if (quote) highlightQuote(quote);
    if (!currentChat().messages.length) renderWelcome();
  }
  function highlightQuote(quote) {
    const root = $('document').querySelector('.document-content');
    if (!root || !quote) return;
    const runs = [], boundaries = new Set(['P','DIV','H1','H2','H3','H4','H5','H6','LI','UL','OL','BLOCKQUOTE','PRE','TR','TD','TH']);
    let breakBefore = false;
    const visit = node => {
      if (node.nodeType === 3) {
        if (node.textContent) { runs.push({ node, text: node.textContent, breakBefore }); breakBefore = false; }
        return;
      }
      if (node.nodeType !== 1 || ['SCRIPT','STYLE'].includes(node.tagName)) return;
      if (node.tagName === 'BR') { breakBefore = true; return; }
      if (boundaries.has(node.tagName)) breakBefore = true;
      for (const child of node.childNodes) visit(child);
      if (boundaries.has(node.tagName)) breakBefore = true;
    };
    visit(root);
    const segments = findQuoteRanges(runs, quote);
    let firstMark;
    // Each range stays inside one text node, including when the quote crosses
    // strong, code, a link, line break or paragraph boundaries.
    for (const segment of [...segments].reverse()) {
      const range = document.createRange(), mark = document.createElement('mark');
      range.setStart(runs[segment.run].node, segment.start); range.setEnd(runs[segment.run].node, segment.end);
      range.surroundContents(mark); firstMark = mark;
    }
    if (firstMark) requestAnimationFrame(() => firstMark.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
  function showImportWarnings(result) {
    const warnings = importWarnings(result);
    $('import-warnings')?.remove();
    if (!warnings.length) return false;
    const notice = document.createElement('div'); notice.id = 'import-warnings'; notice.className = 'connection-note error'; notice.setAttribute('role', 'status');
    const body = document.createElement('div'); body.style.maxHeight = '150px'; body.style.overflow = 'auto';
    const title = document.createElement('strong'); title.textContent = '읽을 수 있는 자료는 정리했어요. 아래 파일은 확인해주세요.';
    body.append(title);
    const list = document.createElement('ul'); list.style.margin = '5px 0'; list.style.paddingLeft = '18px';
    for (const warning of warnings) { const item = document.createElement('li'); item.textContent = warning; list.append(item); }
    body.append(list); notice.append(body);
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '닫기'; dismiss.setAttribute('aria-label', '자료 추가 경고 닫기'); dismiss.addEventListener('click', () => notice.remove()); notice.append(dismiss);
    $('connection-note').after(notice);
    return true;
  }
  function navigate(id, { quote, record = true, focus = false } = {}) {
    if (!state.docs.has(id)) return;
    if (record && id !== state.selected) { state.history = state.history.slice(0, state.position + 1); state.history.push(id); state.position = state.history.length - 1; }
    state.selected = id; graph(); renderDocument(quote); showPanel('document');
    if (focus) $('document-title')?.focus({ preventScroll: true });
  }
  function renderWelcome() {
    $('chat-welcome').hidden = false;
    $('chat-welcome').innerHTML = `<div class="welcome-icon">${icon('chat')}</div><h3>읽다가 궁금해지면,<br>바로 물어보세요.</h3><p>${state.data.docs.length ? '지금 읽는 문서와 연결된 자료를<br>함께 살펴보며 질문할 수 있어요.' : '먼저 내 자료를 추가해주세요.<br>자료가 정리되면 여기에 질문할 수 있어요.'}</p>`;
  }
  function renderMessages() {
    const chat = currentChat();
    if (!chat.messages.length) renderWelcome(); else $('chat-welcome').hidden = true;
    $('messages').innerHTML = chat.messages.map(message => message.role === 'user' ? `<div class="message user"><span class="message-context">${escapeHTML(message.context || '위키 전체')}에서 질문</span><div class="bubble">${escapeHTML(message.text)}</div></div>` : `<div class="message assistant"><div class="answer-label">${icon('chat')}위키를 살펴본 답변</div><div class="answer-content">${markdown(message.text, state.docs.get(message.selectedId)?.path || '')}</div>${message.citations?.length ? `<div class="chat-citations">${message.citations.filter(citation => state.docs.has(citation.id)).map(citation => `<button class="citation" data-doc="${escapeHTML(citation.id)}" data-quote="${escapeHTML(citation.quote || '')}">${icon('doc')}${escapeHTML(state.docs.get(citation.id).title)}</button>`).join('')}</div>` : ''}</div>`).join('');
    $('followup').innerHTML = chat.suggestions?.length ? `<div class="followup-examples"><p>이어서 물어보기</p>${chat.suggestions.map(question => `<button data-question="${escapeHTML(question)}">${escapeHTML(question)}</button>`).join('')}</div>` : '';
  }
  function startOperation(message) {
    state.busy = true; state.abort = new AbortController(); $('operation-status').textContent = message; $('operation-status').hidden = false;
    $('operation-error').hidden = true; updateControls(); showPanel('chat');
  }
  function finishOperation() {
    state.busy = false; state.abort = null; $('operation-status').hidden = true; updateControls();
  }
  function showError(error, retry) {
    $('operation-error').innerHTML = `${escapeHTML(error.name === 'AbortError' ? '작업을 중단했어요.' : error.message || '다시 시도해주세요.')}${retry ? '<button id="retry-operation">다시 시도하기</button>' : ''}`;
    $('operation-error').hidden = false;
    if (retry) $('retry-operation').addEventListener('click', retry);
  }
  async function request(path, body) {
    return consumeNDJSON(await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wiki-csrf': state.data.csrfToken || '' }, body: JSON.stringify(body), signal: state.abort.signal }), event => {
      if (event.type === 'status') $('operation-status').textContent = event.message || '위키를 살펴보고 있어요.';
      if (event.type === 'delta') $('operation-status').textContent = path === '/api/import' ? '자료를 읽고 개념을 연결하고 있어요.' : '위키에서 근거를 모아 답변을 쓰고 있어요.';
    });
  }
  async function ask(question, retry = false) {
    if (state.busy || !ready() || !question.trim()) return;
    const chat = currentChat(), selectedId = state.selected;
    if (!retry) chat.messages.push({ role: 'user', text: question, context: state.docs.get(selectedId)?.title || '위키 전체' });
    state.pendingQuestion = question; renderMessages();
    startOperation('위키에서 질문과 관련된 자료를 찾고 있어요.');
    requestAnimationFrame(() => { $('chat-scroll').scrollTop = $('chat-scroll').scrollHeight; });
    try {
      const result = await request('/api/chat', { provider: state.provider, question, selectedId, ...(chat.conversationId ? { conversationId: chat.conversationId } : {}) });
      if (!result?.answer) throw new Error('답변을 받지 못했어요. 다시 시도해주세요.');
      chat.messages.push({ role: 'assistant', text: result.answer, citations: result.citations || [], selectedId });
      chat.conversationId = result.conversationId || chat.conversationId;
      chat.suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
      $('question').value = ''; state.pendingQuestion = null; renderMessages();
      requestAnimationFrame(() => { $('chat-scroll').scrollTop = $('chat-scroll').scrollHeight; });
    } catch (error) { $('question').value = question; showError(error, () => ask(question, true)); }
    finally { finishOperation(); }
  }
  function encodeFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했어요.`));
      reader.onload = () => resolve({ name: file.name, content: String(reader.result).split(',').slice(1).join(','), encoding: 'base64' }); reader.readAsDataURL(file);
    });
  }
  async function importFiles(files) {
    if (state.busy || !ready() || !files.length) return;
    startOperation(`${files.length}개 자료를 읽고 있어요.`);
    try {
      const encoded = await Promise.all(files.map(encodeFile));
      const result = await request('/api/import', { provider: state.provider, files: encoded });
      if (Array.isArray(result?.docs)) applyState({ ...state.data, ...result });
      else if (Array.isArray(result?.state?.docs)) applyState({ ...state.data, ...result.state });
      await refresh();
      const hasWarnings = showImportWarnings(result);
      toast(hasWarnings ? '일부 파일을 읽지 못했어요. 위 안내를 확인해주세요.' : '자료를 위키에 정리했어요. 개념을 눌러 살펴보세요.');
      showPanel('map');
    } catch (error) {
      // Raw files may already be stored when AI formatting fails. Refresh the
      // browser without replacing the original error or losing its retry action.
      try { await refresh(); } catch { /* Keep the original import failure. */ }
      showError(error, () => importFiles(files));
    }
    finally { $('file-input').value = ''; finishOperation(); }
  }
  function closeSearch() { $('search-results').hidden = true; $('search').setAttribute('aria-expanded', 'false'); }
  function search() {
    const query = $('search').value.trim().toLocaleLowerCase(); if (!query) { closeSearch(); return; }
    const found = state.data.docs.filter(doc => `${doc.title} ${doc.summary} ${doc.markdown}`.toLocaleLowerCase().includes(query));
    $('search-results').innerHTML = found.length ? found.slice(0, 30).map(doc => `<button class="search-result" data-search-doc="${escapeHTML(doc.id)}"><span class="kind-symbol ${doc.kind === 'source' ? 'source' : ''}">${doc.kind === 'source' ? icon('doc') : '•'}</span><span>${escapeHTML(doc.title)}<small>${escapeHTML(doc.summary)}</small></span></button>`).join('') : '<p class="search-empty">일치하는 개념이나 문서가 없어요.<br>다른 말로 검색해보세요.</p>';
    $('search-results').hidden = false; $('search').setAttribute('aria-expanded', 'true');
  }
  function selectSearch(id) { navigate(id, { focus: true }); $('search').value = ''; closeSearch(); }
  document.addEventListener('click', event => {
    const doc = event.target.closest('[data-doc]'); if (doc) { navigate(doc.dataset.doc, { quote: doc.dataset.quote }); return; }
    const question = event.target.closest('[data-question]'); if (question) { $('question').value = question.dataset.question; updateControls(); $('question').focus(); return; }
    const panel = event.target.closest('[data-panel]'); if (panel) showPanel(panel.dataset.panel);
    if (event.target.closest('[data-add-files]') && !state.busy && ready()) $('file-input').click();
    if (!event.target.closest('.search-wrap')) closeSearch();
  });
  document.addEventListener('keydown', event => {
    const node = event.target.closest('.node'); if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); navigate(node.dataset.doc, { focus: true }); }
    if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); $('search').focus(); }
    if (event.key === 'Escape') closeSearch();
  });
  $('search').addEventListener('input', search);
  $('search').addEventListener('keydown', event => { const first = $('search-results').querySelector('button'); if (first && event.key === 'ArrowDown') { event.preventDefault(); first.focus(); } if (first && event.key === 'Enter') { event.preventDefault(); selectSearch(first.dataset.searchDoc); } });
  $('search-results').addEventListener('click', event => { const result = event.target.closest('[data-search-doc]'); if (result) selectSearch(result.dataset.searchDoc); });
  $('search-results').addEventListener('keydown', event => { const items = [...$('search-results').querySelectorAll('button')], index = items.indexOf(document.activeElement); if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus(); } if (event.key === 'ArrowUp') { event.preventDefault(); if (index === 0) $('search').focus(); else items[index - 1]?.focus(); } });
  $('history-back').addEventListener('click', () => { if (state.position > 0) navigate(state.history[--state.position], { record: false }); });
  $('history-forward').addEventListener('click', () => { if (state.position < state.history.length - 1) navigate(state.history[++state.position], { record: false }); });
  function changeView(view) { state.view = view; $('graph-container').hidden = view !== 'map'; $('map-list').hidden = view !== 'list'; $('view-map').setAttribute('aria-pressed', String(view === 'map')); $('view-list').setAttribute('aria-pressed', String(view === 'list')); document.querySelector('.map-controls').hidden = view === 'list'; }
  $('view-map').addEventListener('click', () => changeView('map')); $('view-list').addEventListener('click', () => changeView('list'));
  $('map-scope').addEventListener('click', () => { state.fullMap = !state.fullMap; state.zoom = 1; graph(); });
  $('zoom-in').addEventListener('click', () => { state.zoom = Math.min(1.8, Math.round((state.zoom + .2) * 10) / 10); applyZoom(); });
  $('zoom-out').addEventListener('click', () => { state.zoom = Math.max(.6, Math.round((state.zoom - .2) * 10) / 10); applyZoom(); });
  $('zoom-reset').addEventListener('click', () => { state.zoom = 1; applyZoom(); });
  $('question').addEventListener('input', updateControls);
  $('question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('question-form').requestSubmit(); } });
  $('question-form').addEventListener('submit', event => { event.preventDefault(); const question = $('question').value.trim(); if (question) ask(question, question === state.pendingQuestion); });
  $('new-chat').addEventListener('click', () => { state.chats.set(state.provider, { messages: [], conversationId: null, suggestions: [] }); state.pendingQuestion = null; $('question').value = ''; $('operation-error').hidden = true; renderMessages(); updateControls(); toast('새 대화를 시작했어요. 위키 자료는 그대로 있어요.'); });
  $('provider').addEventListener('change', () => { state.provider = $('provider').value; state.pendingQuestion = null; try { localStorage.setItem('wiki-provider', state.provider); } catch {} $('operation-error').hidden = true; renderMessages(); connectionStatus(); });
  $('add-files').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', () => importFiles([...$('file-input').files]));
  $('cancel').addEventListener('click', () => state.abort?.abort());
  $('refresh-state').addEventListener('click', () => refresh().catch(error => { $('connection-message').textContent = error.message; $('connection-note').classList.add('error'); }));
  renderWelcome(); renderDocument(); graph(); updateControls();
  refresh().catch(error => { $('connection-message').textContent = error.message; $('connection-note').classList.add('error'); updateControls(); });
}
