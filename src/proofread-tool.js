(() => {
  'use strict';

  const { icon, escapeHtml: escape } = window.BaigeUI;

  /* ---------- 演示词库：真实审校由后端模型完成，这里用规则模拟 ---------- */
  const DICT = [
    ['工做', '工作', '错别字'],
    ['严各', '严格', '错别字'],
    ['确宝', '确保', '错别字'],
    ['准却', '准确', '错别字'],
    ['会仪', '会议', '错别字'],
    ['准奋', '准备', '错别字'],
    ['按装', '安装', '错别字'],
    ['在坐', '在座', '错别字'],
    ['截止目前', '截至目前', '语法'],
    ['其它', '其他', '语法'],
    ['做出决定', '作出决定', '语法'],
  ];

  const PUNCT = [
    { find: /，{2,}/g, make: () => ['，', '标点'], label: '重复逗号' },
    { find: /。{2,}/g, make: () => ['。', '标点'], label: '重复句号' },
    { find: /,(?=[\u4e00-\u9fa5])/g, make: () => ['，', '标点'], label: '英文逗号' },
  ];

  /* ---------- 涉密关键词：演示规则，正式环境由后端模型判定 ---------- */
  const SECRET_WORDS = ['绝密', '机密', '秘密', '涉密', '型号', '研制', '内部资料', '军品'];
  const SECRET_SCAN_LIMIT = 2000;

  const SAMPLE = [
    '各部门需要对本年度的工做进行严各的审校，确宝各项数据准却无误。',
    '会议决定在十一月三日召开专题会仪，请提前准奋相关材料。',
    '截止目前，安装调试工作已经完成，其它事项另行通知。',
  ].join('\n');

  const TYPES = ['错别字', '标点', '语法'];

  /* 与百舸文库后台一致的四档审查状态；本地新建的文档不参与检测。 */
  const SECRET_META = {
    none: { label: '无需检测', tone: 'muted' },
    detecting: { label: '检测中', tone: 'info' },
    passed: { label: '已通过', tone: 'success' },
    hit: { label: '涉密可疑', tone: 'warning' },
    submitted: { label: '审核中', tone: 'warning' },
  };

  const BLOCKED = ['detecting', 'hit', 'submitted'];

  const state = {
    records: [],
    activeId: '',
    view: 'history',
    issues: [],
    ignored: new Set(),
    accepted: new Set(),
    status: 'idle',
    progress: 0,
    timer: null,
    seq: 0,
    newCount: 0,
    secretId: '',
  };

  let dom = null;

  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${++state.seq}`;

  function newRecord() {
    state.newCount += 1;
    return {
      id: uid('rec'),
      name: `新建审校 ${state.newCount}`,
      text: '',
      updated: Date.now(),
      source: 'new',
      fileName: '',
      uploadedAt: 0,
      secretStatus: 'none',
      keywords: [],
      reviewedAt: 0,
      auditedAt: 0,
    };
  }

  function activeRecord() {
    return state.records.find((item) => item.id === state.activeId) || state.records[0];
  }

  function isBlocked(record) {
    return Boolean(record) && BLOCKED.includes(record.secretStatus);
  }

  const charCount = (text) => text.replace(/\s/g, '').length;

  function clockOf(value) {
    if (!value) return '—';
    const date = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /* ---------- 审校规则 ---------- */
  function detect(text) {
    const hits = [];
    for (const [wrong, right, type] of DICT) {
      let from = 0;
      while (true) {
        const at = text.indexOf(wrong, from);
        if (at < 0) break;
        hits.push({ start: at, end: at + wrong.length, word: wrong, suggestion: right, type });
        from = at + wrong.length;
      }
    }
    for (const rule of PUNCT) {
      rule.find.lastIndex = 0;
      let m;
      while ((m = rule.find.exec(text))) {
        const [right, type] = rule.make(m[0]);
        hits.push({ start: m.index, end: m.index + m[0].length, word: m[0], suggestion: right, type });
        if (m.index === rule.find.lastIndex) rule.find.lastIndex++;
      }
    }
    hits.sort((a, b) => a.start - b.start);
    return hits.map((hit, index) => ({ ...hit, id: `i${index}`, no: String(index + 1).padStart(2, '0') }));
  }

  /* ---------- 涉密检测 ---------- */
  function scanSecret(fileName, text) {
    const haystack = `${fileName}\n${text.slice(0, SECRET_SCAN_LIMIT)}`;
    return SECRET_WORDS.filter((word) => haystack.includes(word));
  }

  function statusTag(status) {
    const meta = SECRET_META[status] || SECRET_META.none;
    return `<span class="pr-tag is-${meta.tone}"><i aria-hidden="true"></i>${escape(meta.label)}</span>`;
  }

  /* ---------- 渲染：文档列表 ---------- */
  function renderDocs() {
    if (!dom) return;
    const keyword = dom.search.value.trim();
    const list = state.records.filter((item) => item.name.includes(keyword) || item.fileName.includes(keyword));
    if (!list.length) {
      dom.list.innerHTML = `<li class="pr-list-empty">${keyword ? '没有匹配的对话' : '还没有审校对话，上传文件或新建审校开始'}</li>`;
      dom.end.hidden = true;
      return;
    }
    dom.list.innerHTML = list
      .map((item) => {
        const blocked = isBlocked(item);
        const tone = (SECRET_META[item.secretStatus] || SECRET_META.none).tone;
        const meta = item.source === 'upload' ? SECRET_META[item.secretStatus].label : '本地新建';
        return `<li><button type="button" class="pr-doc${item.id === state.activeId ? ' is-active' : ''}${item.secretStatus === 'hit' ? ' is-alert' : ''}" data-record="${item.id}" title="${escape(item.name)}">
          <span class="pr-doc-icon is-${item.source === 'upload' ? 'upload' : 'new'}">${item.source === 'upload' ? escape((item.fileName.split('.').pop() || 'DOC').toUpperCase().slice(0, 4)) : '新'}</span>
          <span class="pr-doc-body">
            <span class="pr-doc-name">${escape(item.name)}</span>
            <span class="pr-doc-meta is-${tone}"><i class="pr-dot is-${tone}" aria-hidden="true"></i>${escape(meta)}<b>·</b>${clockOf(item.uploadedAt || item.updated)}</span>
          </span>
        </button></li>`;
      })
      .join('');
    dom.end.hidden = false;
  }

  /* ---------- 渲染：左栏（视图切换 + 当前文档） ---------- */
  function renderRail() {
    if (!dom) return;
    const record = activeRecord();
    dom.switchRoot.querySelectorAll('[data-view]').forEach((button) => {
      const on = button.dataset.view === state.view;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', String(on));
    });
    dom.panelHistory.hidden = state.view !== 'history';
    dom.panelEditor.hidden = state.view !== 'editor';

    if (!record) {
      dom.docCard.innerHTML = '<p class="pr-card-empty">还没有打开的文档</p>';
      return;
    }
    const canDetail = record.source === 'upload';
    dom.docCard.innerHTML = `
      <div class="pr-card-head">
        <span class="pr-doc-icon is-${record.source === 'upload' ? 'upload' : 'new'}">${record.source === 'upload' ? escape((record.fileName.split('.').pop() || 'DOC').toUpperCase().slice(0, 4)) : '新'}</span>
        <div class="pr-card-title"><strong>${escape(record.name)}</strong>${record.source === 'upload' ? statusTag(record.secretStatus) : '<span class="pr-tag is-muted"><i aria-hidden="true"></i>本地新建</span>'}</div>
      </div>
      <dl class="pr-card-facts">
        <div><dt>来源</dt><dd>${record.source === 'upload' ? '本地上传' : '本地新建'}</dd></div>
        <div><dt>字数</dt><dd>${charCount(record.text)}</dd></div>
        <div><dt>${record.source === 'upload' ? '上传' : '创建'}</dt><dd>${clockOf(record.uploadedAt || record.updated)}</dd></div>
      </dl>
      ${record.keywords.length ? `<p class="pr-card-hit">命中关键词：${record.keywords.map((word) => escape(word)).join('、')}</p>` : ''}
      ${canDetail ? '<button class="pr-card-link" type="button" data-card-detail>查看涉密检测详情</button>' : ''}
    `;
  }

  /* ---------- 渲染：文档区与拦截态 ---------- */
  function renderPage() {
    if (!dom) return;
    const record = activeRecord();
    if (!record) {
      dom.page.textContent = '';
      dom.docName.textContent = '未选择文档';
      dom.guard.hidden = true;
      dom.charCount.textContent = '字数统计 0';
      return;
    }
    dom.docName.textContent = record.name;
    const blocked = isBlocked(record);

    if (blocked) {
      dom.page.textContent = '';
      dom.page.setAttribute('contenteditable', 'false');
      dom.guard.hidden = false;
      dom.guard.innerHTML = guardBody(record);
    } else {
      dom.page.setAttribute('contenteditable', 'true');
      dom.guard.hidden = true;
      const text = record.text;
      if (!state.issues.length) {
        dom.page.textContent = text;
      } else {
        const parts = [];
        let cursor = 0;
        for (const issue of state.issues) {
          if (issue.start < cursor) continue;
          parts.push(escape(text.slice(cursor, issue.start)));
          const cls = state.ignored.has(issue.id) ? 'pr-hit is-ignored' : 'pr-hit';
          parts.push(`<span class="${cls}" data-hit="${issue.id}">${escape(text.slice(issue.start, issue.end))}</span>`);
          cursor = issue.end;
        }
        parts.push(escape(text.slice(cursor)));
        dom.page.innerHTML = parts.join('');
      }
    }
    dom.charCount.textContent = `字数统计 ${charCount(record.text)}`;
  }

  function guardBody(record) {
    if (record.secretStatus === 'detecting') {
      return `<div class="pr-guard-box"><span class="pr-spinner" aria-hidden="true"></span><h3>正在检测涉密内容</h3><p>检测完成前文档不会载入编辑区，通常只需几秒。</p></div>`;
    }
    if (record.secretStatus === 'hit') {
      return `<div class="pr-guard-box is-alert"><span class="pr-guard-mark" aria-hidden="true">!</span><h3>未通过涉密检测</h3><p>命中关键词：${record.keywords.map((word) => `<b>${escape(word)}</b>`).join('、')}。文档已暂停载入。</p><button class="pr-guard-btn" type="button" data-guard-detail>查看涉密检测详情</button></div>`;
    }
    return `<div class="pr-guard-box is-warn"><span class="pr-guard-mark" aria-hidden="true">${icon('history')}</span><h3>等待管理员审核</h3><p>已提交至百舸文库审核中心，通过后才能开始校审。</p><button class="pr-guard-btn" type="button" data-guard-detail>查看审核进度</button></div>`;
  }

  function renderResult() {
    if (!dom) return;
    const record = activeRecord();
    const running = state.status === 'running';
    dom.run.textContent = running ? '停止审校' : '开始审校';
    dom.run.disabled = state.status === 'checking' || isBlocked(record) || !record;

    const pending = state.issues.filter((issue) => !state.ignored.has(issue.id) && !state.accepted.has(issue.id));
    const hasIssues = state.issues.length > 0;
    dom.summary.hidden = !hasIssues && !running;
    dom.count.textContent = `共 ${state.issues.length} 个事项`;
    dom.bulk.hidden = !hasIssues;

    if (running) {
      dom.groups.innerHTML = `<div class="pr-progress"><p>文档审校中，请耐心等待。</p><p>文档审校需要一些时间，您无需在此等候，请稍后查看！</p><div class="pr-bar"><span style="width:${state.progress}%"></span></div><p>已完成 ${state.progress}%</p></div>`;
      return;
    }
    if (isBlocked(record)) {
      const copy = record.secretStatus === 'detecting' ? '涉密检测中，暂不能审校' : record.secretStatus === 'submitted' ? '等待管理员审核，暂不能审校' : '文档未通过涉密检测，暂不能审校';
      dom.groups.innerHTML = `<div class="pr-empty">${icon('shield')}<p>${copy}</p></div>`;
      return;
    }
    if (!hasIssues) {
      dom.groups.innerHTML = `<div class="pr-empty">${icon('file')}<p>审校结果将在这里显示</p></div>`;
      return;
    }

    const groups = TYPES.map((type) => ({ type, items: state.issues.filter((issue) => issue.type === type) })).filter((g) => g.items.length);
    dom.groups.innerHTML = groups
      .map(
        (group) => `<h4 class="pr-group-title">${escape(group.type)}(${group.items.length})</h4>${group.items
          .map((issue) => {
            const done = state.accepted.has(issue.id);
            const ignored = state.ignored.has(issue.id);
            const cls = done ? 'pr-issue is-accepted' : ignored ? 'pr-issue is-ignored' : 'pr-issue';
            return `<article class="${cls}" data-issue="${issue.id}">
              <span class="pr-issue-num">${issue.no}</span>
              <div class="pr-diff"><del>${escape(issue.word)}</del><span class="arrow">→</span><ins>${escape(issue.suggestion)}</ins></div>
              <p class="pr-issue-type">错误类型：${escape(issue.type)}${done ? ' · 已采纳' : ignored ? ' · 已忽略' : ''}</p>
              ${
                done || ignored
                  ? ''
                  : `<div class="pr-issue-actions"><button type="button" data-accept="${issue.id}">采纳</button><button type="button" data-ignore="${issue.id}">忽略</button></div>`
              }
            </article>`;
          })
          .join('')}`
      )
      .join('');
    if (!pending.length) dom.count.textContent = `共 ${state.issues.length} 个事项 · 全部处理完成`;
  }

  function renderAll() {
    renderDocs();
    renderRail();
    renderPage();
    renderResult();
  }

  /* ---------- 涉密检测详情弹窗 ---------- */
  function openSecret(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record || record.source !== 'upload') return;
    state.secretId = id;
    const meta = SECRET_META[record.secretStatus] || SECRET_META.none;
    dom.secretTitle.textContent = `涉密检测详情 — ${meta.label}`;
    dom.secretBody.innerHTML = secretBody(record);
    dom.secretFoot.innerHTML = secretFoot(record);
    dom.secret.showModal();
  }

  function secretBody(record) {
    const risky = record.secretStatus === 'hit' || record.secretStatus === 'submitted';
    let html = '';
    if (risky) {
      html += `<div class="pr-alert">
        <span class="pr-alert-mark" aria-hidden="true">!</span>
        <div>
          <strong>检测到涉密内容</strong>
          <p>该文件包含敏感关键词，请取消上传，或继续提交管理员审核。</p>
          <div class="pr-alert-kw"><span>命中关键词</span>${record.keywords.map((word) => `<b>${escape(word)}</b>`).join('')}</div>
        </div>
      </div>`;
    }
    html += `<dl class="pr-facts">
      <div><dt>文件名</dt><dd>${escape(record.fileName || record.name)}</dd></div>
      <div><dt>来源</dt><dd>本地上传 · ${charCount(record.text)} 字</dd></div>
      <div><dt>上传时间</dt><dd>${clockOf(record.uploadedAt)}</dd></div>
      <div><dt>涉密审查状态</dt><dd>${statusTag(record.secretStatus)}</dd></div>
    </dl>
    <h3 class="pr-timeline-title">流转记录</h3>
    <ol class="pr-timeline">${timeline(record)}</ol>`;
    return html;
  }

  function timeline(record) {
    const rows = [
      `<li class="is-done"><i aria-hidden="true"></i><div><p>用户发起上传</p><span>${clockOf(record.uploadedAt)}</span></div></li>`,
    ];
    if (record.secretStatus === 'detecting') {
      rows.push(`<li class="is-doing"><i aria-hidden="true"></i><div><p>系统涉密检测中</p><span>检测完成前文档不会载入编辑区</span></div></li>`);
      return rows.join('');
    }
    const kw = record.keywords.length ? `命中关键词：${record.keywords.join('、')}` : '未命中敏感关键词';
    rows.push(
      `<li class="${record.keywords.length ? 'is-warn' : 'is-done'}"><i aria-hidden="true"></i><div><p>${record.keywords.length ? '系统检测到涉密内容' : '系统涉密检测通过'}</p><span>${clockOf(record.reviewedAt)} · ${kw}</span></div></li>`
    );
    if (record.secretStatus === 'hit') {
      rows.push(`<li class="is-doing"><i aria-hidden="true"></i><div><p>涉密可疑，等待处理</p><span>可取消上传，或提交管理员审核</span></div></li>`);
    } else if (record.secretStatus === 'submitted') {
      rows.push(`<li class="is-doing"><i aria-hidden="true"></i><div><p>已提交管理员审核</p><span>审核通过后方可开始校审</span></div></li>`);
    } else if (record.secretStatus === 'passed') {
      rows.push(`<li class="is-done"><i aria-hidden="true"></i><div><p>允许进入校审</p><span>文档已载入编辑区</span></div></li>`);
    }
    return rows.join('');
  }

  function secretFoot(record) {
    if (record.secretStatus === 'hit') {
      return `<button type="button" class="is-ghost" data-secret-cancel>取消上传</button><button type="button" class="is-primary" data-secret-submit>继续上传并提交审核</button>`;
    }
    if (record.secretStatus === 'submitted') {
      return `<span class="pr-demo-hint">演示：审核由百舸文库审核中心完成</span><button type="button" class="is-ghost" data-secret-close>关闭</button><button type="button" class="is-primary" data-secret-approve>模拟审核通过</button>`;
    }
    return `<button type="button" class="is-ghost" data-secret-close>关闭</button><button type="button" class="is-primary" data-secret-open>打开文档</button>`;
  }

  /* ---------- 行为 ---------- */
  function setStatus(next) {
    state.status = next;
    renderResult();
  }

  function stopTimer() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function hint(text) {
    if (!dom) return;
    dom.status.textContent = text;
    clearTimeout(hint.timer);
    hint.timer = setTimeout(() => {
      dom.status.textContent = '';
    }, 3200);
  }

  function switchView(next) {
    state.view = next;
    renderRail();
  }

  function openDoc(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record) return;
    if (record.secretStatus === 'hit' || record.secretStatus === 'submitted') {
      state.activeId = id;
      state.issues = [];
      state.ignored = new Set();
      state.accepted = new Set();
      state.view = 'editor';
      renderAll();
      openSecret(id);
      return;
    }
    if (record.secretStatus === 'detecting') {
      hint('文档正在检测涉密内容，请稍候。');
      return;
    }
    state.activeId = id;
    state.issues = [];
    state.ignored = new Set();
    state.accepted = new Set();
    state.view = 'editor';
    renderAll();
  }

  function createRecord() {
    if (state.status === 'running') {
      hint('审校进行中，请先停止审校。');
      return;
    }
    const record = newRecord();
    state.records.unshift(record);
    state.activeId = record.id;
    state.issues = [];
    state.ignored = new Set();
    state.accepted = new Set();
    state.view = 'editor';
    renderAll();
    dom.page.focus();
  }

  function upload() {
    dom.file.value = '';
    dom.file.click();
  }

  function onFile() {
    const file = dom.file.files?.[0];
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) {
      hint('原型仅支持 TXT / MD 文本演示，其余格式待接入。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const record = {
        id: uid('rec'),
        name: file.name.replace(/\.(txt|md)$/i, ''),
        text,
        updated: Date.now(),
        source: 'upload',
        fileName: file.name,
        uploadedAt: Date.now(),
        secretStatus: 'detecting',
        keywords: [],
        reviewedAt: 0,
        auditedAt: 0,
      };
      state.records.unshift(record);
      state.activeId = record.id;
      state.issues = [];
      state.ignored = new Set();
      state.accepted = new Set();
      state.view = 'history';
      renderAll();

      setTimeout(() => {
        const keywords = scanSecret(file.name, text);
        record.keywords = keywords;
        record.reviewedAt = Date.now();
        record.secretStatus = keywords.length ? 'hit' : 'passed';
        if (record.secretStatus === 'passed') {
          hint('涉密检测通过，点击列表中的文件开始审校。');
          renderAll();
        } else {
          renderAll();
          if (state.activeId === record.id) openSecret(record.id);
        }
      }, 1400);
    };
    reader.readAsText(file, 'utf-8');
  }

  function startCheck() {
    const record = activeRecord();
    if (!record || isBlocked(record)) {
      hint('当前文档未通过涉密检测，暂不能审校。');
      return;
    }
    const text = dom.page.innerText.replace(/\u00a0/g, ' ');
    record.text = text;
    state.issues = detect(text);
    state.ignored = new Set();
    state.accepted = new Set();
    state.progress = 0;
    setStatus('running');
    renderPage();
    stopTimer();
    state.timer = setInterval(() => {
      state.progress = Math.min(100, state.progress + 8);
      if (state.progress >= 100) {
        stopTimer();
        state.issues = detect(record.text);
        setStatus('done');
        renderPage();
        if (state.issues.length) dom.summary.scrollIntoView({ block: 'nearest' });
        return;
      }
      renderResult();
    }, 130);
  }

  function openDialog() {
    if (state.status === 'running') {
      stopTimer();
      setStatus('done');
      return;
    }
    const record = activeRecord();
    if (!record || isBlocked(record)) {
      hint('当前文档未通过涉密检测，暂不能审校。');
      return;
    }
    dom.dialog.showModal();
  }

  function acceptIssue(id) {
    const issue = state.issues.find((item) => item.id === id);
    if (!issue || state.accepted.has(id)) return;
    const record = activeRecord();
    const ignoredKeys = new Set(
      state.issues.filter((item) => state.ignored.has(item.id)).map((item) => `${item.word}|${item.type}`)
    );
    record.text = record.text.slice(0, issue.start) + issue.suggestion + record.text.slice(issue.end);
    state.issues = detect(record.text);
    state.ignored = new Set(
      state.issues.filter((item) => ignoredKeys.has(`${item.word}|${item.type}`)).map((item) => item.id)
    );
    state.accepted = new Set();
    renderPage();
    renderResult();
    renderRail();
  }

  function ignoreIssue(id) {
    state.ignored.add(id);
    renderPage();
    renderResult();
  }

  function acceptAll() {
    const record = activeRecord();
    const targets = state.issues.filter((issue) => !state.ignored.has(issue.id));
    for (const issue of [...targets].sort((a, b) => b.start - a.start)) {
      record.text = record.text.slice(0, issue.start) + issue.suggestion + record.text.slice(issue.end);
    }
    state.issues = [];
    state.ignored = new Set();
    state.accepted = new Set();
    renderPage();
    renderResult();
    renderRail();
  }

  function ignoreAll() {
    for (const issue of state.issues) state.ignored.add(issue.id);
    renderPage();
    renderResult();
  }

  function submitAudit(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record) return;
    record.secretStatus = 'submitted';
    dom.secret.close();
    renderAll();
    hint('已提交至百舸文库审核中心，审核通过后可开始校审。');
  }

  function approveAudit(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record) return;
    record.secretStatus = 'passed';
    record.auditedAt = Date.now();
    dom.secret.close();
    if (state.activeId === record.id) state.view = 'editor';
    renderAll();
    hint('管理员已审核通过，可以开始校审。');
  }

  function cancelUpload(id) {
    const index = state.records.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [removed] = state.records.splice(index, 1);
    dom.secret.close();
    const next = state.records.find((item) => !isBlocked(item));
    if (state.activeId === removed.id) {
      if (next) {
        state.activeId = next.id;
      } else {
        const fresh = newRecord();
        state.records.unshift(fresh);
        state.activeId = fresh.id;
      }
      state.issues = [];
      state.ignored = new Set();
      state.accepted = new Set();
    }
    renderAll();
    hint('已取消上传，文件未进入校审。');
  }

  function build(root) {
    root.innerHTML = `
      <button class="tool-back-link" type="button" data-shortcut="smart-tools"><span data-icon="back" aria-hidden="true"></span>返回工具目录</button>
      <div class="pr-app">
        <aside class="pr-rail">
          <div class="pr-brand">
            <span class="pr-logo" aria-hidden="true">${icon('check')}</span>
            <div><h2>审校助手</h2><p>文字校对应用</p></div>
          </div>
          <p class="pr-intro">这是一个文字审校助手，可以协助你进行文档的编写，对你的文档进行精准的校对，很大程度上缩短了人工审核的时间，降低了出错率。</p>

          <div class="pr-switch" role="tablist" aria-label="文档视图">
            <button class="pr-switch-btn" type="button" role="tab" data-view="history" aria-selected="true" title="查看历史审校对话">${icon('history')}<span>历史对话</span></button>
            <button class="pr-switch-btn" type="button" role="tab" data-view="editor" aria-selected="false" title="直接新建一份空文档">${icon('newchat')}<span>新建审校</span></button>
          </div>

          <div class="pr-panel" data-panel="history">
            <label class="pr-search">${icon('search')}<span class="sr-only">搜索文档</span><input type="search" placeholder="搜索对话或文件名" data-search /></label>
            <ul class="pr-list" data-list></ul>
            <p class="pr-end" data-end>没有更多了</p>
          </div>

          <div class="pr-panel pr-panel-editor" data-panel="editor" hidden>
            <div data-doc-card></div>
          </div>
        </aside>

        <section class="pr-editor">
          <header class="pr-editor-head">
            <span class="pr-doc-name" data-doc-name>新建审校</span>
            <div class="pr-doc-actions">
              <button class="pr-doc-action" type="button" data-upload><span aria-hidden="true">↑</span><span>上传文档</span></button>
              <button class="pr-doc-action" type="button" data-download><span aria-hidden="true">↓</span><span>下载</span></button>
            </div>
          </header>
          <div class="pr-toolbar" aria-hidden="true">
            <b>文件</b><span>开始</span><span>插入</span><span>绘图</span><span>布局</span><span>引用</span><span>协作</span><span>保护</span><span>视图</span>
            <span class="pr-tools">${icon('search')}${icon('chat')}${icon('grid')}</span>
          </div>
          <div class="pr-canvas">
            <div class="pr-page" contenteditable="true" spellcheck="false" data-doc role="textbox" aria-multiline="true" aria-label="文档编辑区"></div>
            <div class="pr-guard" data-guard hidden></div>
          </div>
          <footer class="pr-status">
            <span>第 1 页 共 1 页</span>
            <span data-char>字数统计 0</span>
            <span>中文（中国）</span>
            <span>缩放 100%</span>
            <span data-status role="status"></span>
          </footer>
        </section>

        <aside class="pr-result">
          <button class="pr-run" type="button" data-run>开始审校</button>
          <div class="pr-summary" data-summary hidden>
            <span data-count>共 0 个事项</span>
            <div class="pr-bulk" data-bulk hidden><button type="button" data-accept-all>全部采纳</button><button type="button" data-ignore-all>全部忽略</button></div>
          </div>
          <div class="pr-groups" data-groups></div>
        </aside>
      </div>

      <dialog class="pr-dialog" data-dialog aria-labelledby="prDialogTitle">
        <h2 id="prDialogTitle">审核配置</h2>
        <div class="pr-dialog-body">
          <div class="pr-options"><span>审核项</span>
            ${TYPES.map((type) => `<label><input type="checkbox" checked value="${type}" />${type}审校</label>`).join('')}
          </div>
        </div>
        <div class="pr-dialog-foot">
          <button type="button" data-cancel>取消</button>
          <button type="button" data-confirm>开始审校</button>
        </div>
      </dialog>

      <dialog class="pr-secret" data-secret aria-labelledby="prSecretTitle">
        <header class="pr-secret-head">
          <h2 id="prSecretTitle" data-secret-title>涉密检测详情</h2>
          <button type="button" class="pr-secret-close" data-secret-x aria-label="关闭">${icon('close')}</button>
        </header>
        <div class="pr-secret-body" data-secret-body></div>
        <footer class="pr-secret-foot" data-secret-foot></footer>
      </dialog>

      <input type="file" accept=".txt,.md,text/plain" hidden data-file />
    `;

    dom = {
      root,
      page: root.querySelector('[data-doc]'),
      guard: root.querySelector('[data-guard]'),
      docName: root.querySelector('[data-doc-name]'),
      switchRoot: root.querySelector('.pr-switch'),
      panelHistory: root.querySelector('[data-panel="history"]'),
      panelEditor: root.querySelector('[data-panel="editor"]'),
      docCard: root.querySelector('[data-doc-card]'),
      list: root.querySelector('[data-list]'),
      search: root.querySelector('[data-search]'),
      end: root.querySelector('[data-end]'),
      run: root.querySelector('[data-run]'),
      summary: root.querySelector('[data-summary]'),
      count: root.querySelector('[data-count]'),
      bulk: root.querySelector('[data-bulk]'),
      groups: root.querySelector('[data-groups]'),
      charCount: root.querySelector('[data-char]'),
      status: root.querySelector('[data-status]'),
      dialog: root.querySelector('[data-dialog]'),
      secret: root.querySelector('[data-secret]'),
      secretTitle: root.querySelector('[data-secret-title]'),
      secretBody: root.querySelector('[data-secret-body]'),
      secretFoot: root.querySelector('[data-secret-foot]'),
      file: root.querySelector('[data-file]'),
    };
  }

  function bind() {
    dom.switchRoot.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      if (button.dataset.view === 'editor') {
        createRecord();
        return;
      }
      switchView('history');
    });

    dom.search.addEventListener('input', renderDocs);
    dom.list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-record]');
      if (button) openDoc(button.dataset.record);
    });

    dom.docCard.addEventListener('click', (event) => {
      if (!event.target.closest('[data-card-detail]')) return;
      const record = activeRecord();
      if (record) openSecret(record.id);
    });

    dom.guard.addEventListener('click', (event) => {
      if (!event.target.closest('[data-guard-detail]')) return;
      const record = activeRecord();
      if (record) openSecret(record.id);
    });

    dom.page.addEventListener('input', () => {
      const record = activeRecord();
      if (!record || isBlocked(record)) return;
      record.text = dom.page.innerText.replace(/\u00a0/g, ' ');
      record.updated = Date.now();
      dom.charCount.textContent = `字数统计 ${charCount(record.text)}`;
    });

    dom.run.addEventListener('click', openDialog);
    dom.groups.addEventListener('click', (event) => {
      const accept = event.target.closest('[data-accept]');
      if (accept) {
        acceptIssue(accept.dataset.accept);
        return;
      }
      const ignore = event.target.closest('[data-ignore]');
      if (ignore) {
        ignoreIssue(ignore.dataset.ignore);
        return;
      }
      const hit = event.target.closest('[data-hit]');
      if (hit) {
        const card = dom.groups.querySelector(`[data-issue="${hit.dataset.hit}"]`);
        card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
    dom.page.addEventListener('click', (event) => {
      const hit = event.target.closest('[data-hit]');
      if (!hit) return;
      const card = dom.groups.querySelector(`[data-issue="${hit.dataset.hit}"]`);
      card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    dom.bulk.querySelector('[data-accept-all]').addEventListener('click', acceptAll);
    dom.bulk.querySelector('[data-ignore-all]').addEventListener('click', ignoreAll);

    dom.root.querySelector('[data-upload]').addEventListener('click', upload);
    dom.file.addEventListener('change', onFile);
    dom.root.querySelector('[data-download]').addEventListener('click', () => {
      const record = activeRecord();
      if (!record || isBlocked(record)) return;
      const blob = new Blob([record.text], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${record.name || '审校文档'}.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

    dom.dialog.querySelector('[data-cancel]').addEventListener('click', () => dom.dialog.close());
    dom.dialog.querySelector('[data-confirm]').addEventListener('click', () => {
      dom.dialog.close();
      startCheck();
    });

    dom.secret.addEventListener('click', (event) => {
      const id = state.secretId;
      if (event.target.closest('[data-secret-x]') || event.target.closest('[data-secret-close]') || event.target === dom.secret) {
        dom.secret.close();
        return;
      }
      if (event.target.closest('[data-secret-submit]')) {
        submitAudit(id);
        return;
      }
      if (event.target.closest('[data-secret-approve]')) {
        approveAudit(id);
        return;
      }
      if (event.target.closest('[data-secret-cancel]')) {
        cancelUpload(id);
        return;
      }
      if (event.target.closest('[data-secret-open]')) {
        const record = state.records.find((item) => item.id === id);
        dom.secret.close();
        if (record) {
          state.activeId = record.id;
          state.view = 'editor';
          renderAll();
        }
      }
    });
  }

  function render(target) {
    build(target);
    bind();
    const seeded = newRecord();
    seeded.text = SAMPLE;
    state.records = [seeded];
    state.activeId = seeded.id;
    state.view = 'history';
    renderAll();
  }

  window.BaigeProofreadTool = { render, detect, scanSecret, SAMPLE, SECRET_META };
})();
