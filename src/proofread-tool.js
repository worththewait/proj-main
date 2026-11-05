(() => {
  'use strict';

  const { icon, escapeHtml: escape } = window.BaigeUI;
  const store = window.BaigeProofreadStore;

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

  const SAMPLE = [
    '各部门需要对本年度的工做进行严各的审校，确宝各项数据准却无误。',
    '会议决定在十一月三日召开专题会仪，请提前准奋相关材料。',
    '截止目前，安装调试工作已经完成，其它事项另行通知。',
  ].join('\n');

  const TYPES = ['错别字', '标点', '语法'];

  /* 与百舸文库后台一致的四档审查状态。 */
  const SECRET_META = {
    draft: { label: '本地未提交', tone: 'muted' },
    detecting: { label: '检测中', tone: 'info' },
    passed: { label: '已通过', tone: 'success' },
    hit: { label: '涉密可疑', tone: 'warning' },
    submitted: { label: '审核中', tone: 'warning' },
    rejected: { label: '已驳回', tone: 'danger' },
  };

  const REVIEW_META = {
    detecting: { label: '涉密检测中', tone: 'info' },
    hit: { label: '涉密可疑', tone: 'warning' },
    submitted: { label: '等待人工审核', tone: 'warning' },
    rejected: { label: '审核已驳回', tone: 'danger' },
    running: { label: '审校中', tone: 'info' },
    done: { label: '已完成', tone: 'success' },
    stopped: { label: '已停止', tone: 'muted' },
    failed: { label: '审校失败', tone: 'danger' },
  };

  const state = {
    records: [],
    view: 'history',
    history: [],
    session: null,
    issues: [],
    ignored: new Set(),
    accepted: new Set(),
    status: 'idle',
    progress: 0,
    timer: null,
    seq: 0,
    secretId: '',
    selection: null,
    followReview: '',
    original: false,
    snapshot: '',
    unsaved: false,
    onDirty() {},
  };

  let dom = null;

  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${++state.seq}`;

  function activeRecord() {
    return state.session;
  }

  function isBlocked(record) {
    return Boolean(record) && !['passed', 'draft'].includes(record.secretStatus);
  }

  const charCount = (text) => text.replace(/\s/g, '').length;

  function clockOf(value, showSeconds = false) {
    if (!value) return '—';
    const date = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    const minute = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return showSeconds ? `${minute}:${pad(date.getSeconds())}` : minute;
  }

  /* ---------- 审校规则 ---------- */
  function detect(text, types = TYPES) {
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
    return hits.filter(hit => types.includes(hit.type))
      .map((hit, index) => ({ ...hit, id: `i${index}`, no: String(index + 1).padStart(2, '0') }));
  }

  /* ---------- 涉密检测 ---------- */
  function scanSecret(fileName, text) {
    const haystack = `${fileName}\n${text}`;
    return SECRET_WORDS.filter((word) => haystack.includes(word));
  }

  function statusTag(status) {
    const meta = SECRET_META[status] || SECRET_META.detecting;
    return `<span class="pr-tag is-${meta.tone}"><i aria-hidden="true"></i>${escape(meta.label)}</span>`;
  }

  /* ---------- 渲染：文档列表 ---------- */
  function renderDocs() {
    if (!dom) return;
    const keyword = dom.search.value.trim();
    const history = state.view === 'history';
    const list = (history ? state.history : state.records)
      .filter(item => item.name.includes(keyword) || item.fileName?.includes(keyword));
    if (!list.length) {
      const message = keyword ? '没有匹配的记录' : history ? '还没有审校记录' : '新建审校或上传文件开始使用';
      dom.list.innerHTML = `<li class="pr-list-empty">${message}</li>`;
      dom.end.hidden = true;
      return;
    }
    dom.list.innerHTML = list.map(item => {
      const { label, tone } = history ? REVIEW_META[item.status] : SECRET_META[item.secretStatus];
      const selected = history ? state.session?.reviewId === item.reviewId : !state.session?.reviewId && state.session?.id === item.id;
      return `<li><button type="button" class="pr-doc${selected ? ' is-active' : ''}${item.secretStatus === 'hit' ? ' is-alert' : ''}" ${history ? 'data-review' : 'data-record'}="${history ? item.reviewId : item.id}" aria-current="${selected}" title="${escape(item.name)}">
        <span class="pr-doc-icon is-upload">${icon(history ? 'history' : 'file')}</span>
        <span class="pr-doc-body"><span class="pr-doc-name">${escape(item.name)}${item.version > 1 ? ` · V${item.version}` : ''}${history && item.unread ? '<i class="pr-unread" aria-label="新结果"></i>' : ''}</span>
          <span class="pr-doc-meta is-${tone}"><i class="pr-dot is-${tone}" aria-hidden="true"></i>${label}<b>·</b>${clockOf(history ? item.checkedAt : item.uploadedAt, history)}</span></span>
      </button></li>`;
    }).join('');
    dom.end.hidden = false;
  }

  /* ---------- 渲染：左栏（视图切换 + 当前文档） ---------- */
  function renderRail() {
    if (!dom) return;
    dom.switchRoot.querySelectorAll('[data-view]').forEach(button => {
      const on = button.dataset.view === state.view;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', String(on));
    });
    dom.uploadButton.hidden = state.view !== 'files';
    dom.notice.hidden = !state.history.some(item => item.unread);
    dom.search.placeholder = state.view === 'files' ? '搜索文件名' : '搜索审校记录';
    dom.search.setAttribute('aria-label', dom.search.placeholder);
  }

  /* ---------- 渲染：文档区与拦截态 ---------- */
  function renderPage() {
    if (!dom) return;
    const record = activeRecord();
    const draft = record?.secretStatus === 'draft';
    dom.draft.hidden = !draft;
    dom.page.hidden = draft;
    const reviewed = Boolean(record?.reviewId) && ['done', 'stopped'].includes(record?.status);
    dom.originalToggle.hidden = !reviewed;
    dom.originalToggle.textContent = state.original ? '查看修订稿' : '查看原文';
    dom.editorTitle.textContent = draft ? (record.source === 'upload' ? '本地文件' : '新建审校') : reviewed ? (state.original ? '原文' : '修订稿') : '文档预览';
    dom.saveState.textContent = state.unsaved ? '保存失败，请重试' : draft ? '' : record ? '正文已锁定' : '';
    dom.saveRetry.hidden = !state.unsaved;
    if (draft) {
      dom.draftTitle.value = record.name === '未命名审校' ? '' : record.name;
      dom.draftText.value = record.text;
      dom.guard.hidden = true;
      dom.docName.textContent = record.source === 'upload'
        ? '文件仅保存在本地，点击「开始审校」后上传并做涉密审核'
        : '输入或粘贴正文，提交后仅可通过审校建议修订';
      dom.charCount.textContent = `字数统计 ${charCount(record.text)}`;
      return;
    }
    if (!record) {
      dom.page.textContent = '';
      dom.docName.textContent = '请选择已通过涉密审核的文件';
      dom.guard.hidden = true;
      dom.charCount.textContent = '字数统计 0';
      return;
    }
    dom.docName.textContent = record.name;
    const blocked = isBlocked(record) && !record.reviewId;

    if (blocked) {
      dom.page.textContent = '';
      dom.page.setAttribute('contenteditable', 'false');
      dom.guard.hidden = false;
      dom.guard.innerHTML = guardBody(record);
    } else {
      dom.guard.hidden = true;
      const text = state.original && record.originalText !== undefined ? record.originalText : record.text;
      if (!state.issues.length || state.original) {
        dom.page.textContent = text;
      } else {
        const parts = [];
        let cursor = 0;
        for (const issue of state.issues) {
          if (state.accepted.has(issue.id) || issue.start < cursor) continue;
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
    const pending = ['detecting', 'hit', 'submitted', 'running'].includes(state.status);
    dom.run.textContent = running ? '停止审校' : isBlocked(record) ? '查看审核详情' : record?.reviewId ? '重新审校' : '开始审校';
    dom.run.disabled = !record || !record.text.trim() || state.unsaved;
    dom.download.disabled = !record || isBlocked(record) || record.secretStatus === 'draft';
    dom.stop.hidden = !pending || running;
    dom.resultFile.textContent = record
      ? `${REVIEW_META[state.status]?.label || '待审校'} · ${record.name}`
      : '选择审校记录或已通过审核的文件';
    dom.resultFile.title = dom.resultFile.textContent;

    const remaining = state.issues.filter((issue) => !state.ignored.has(issue.id) && !state.accepted.has(issue.id));
    const hasIssues = state.issues.length > 0;
    dom.summary.hidden = !hasIssues;
    dom.count.textContent = `共 ${state.issues.length} 个事项`;
    dom.bulk.hidden = !hasIssues || running;
    dom.bulk.querySelectorAll('button').forEach(button => { button.disabled = remaining.length === 0; });

    if (running) {
      dom.groups.innerHTML = `<div class="pr-progress"><p>正在检查文档，完成后会在这里显示修改建议。</p><div class="pr-bar" role="progressbar" aria-label="审校进度" aria-valuenow="${state.progress}"><span style="width:${state.progress}%"></span></div><p>已完成 ${state.progress}%</p></div>`;
      return;
    }
    if (isBlocked(record)) {
      const copy = state.status === 'stopped' ? '本轮任务已取消，文档审核仍可从详情中查看。' : record.secretStatus === 'detecting' ? '正在进行涉密检测，审核通过后自动审校。可关闭窗口，稍后从审校记录查看。' : record.secretStatus === 'submitted' ? '等待管理员审核，通过后自动继续审校。' : record.secretStatus === 'rejected' ? '人工审核已驳回，请查看审核详情。' : '检测到涉密可疑内容，请查看详情并提交人工审核。';
      dom.groups.innerHTML = `<p class="pr-review-hint">${copy}</p>`;
      return;
    }
    if (!hasIssues) {
      const messages = {
        idle: !record ? '选择审校记录查看结果，或从「文件选择」预览原文。'
          : record.secretStatus === 'draft' && !record.reviewId ? '文件仅保存在本地，点击「开始审校」后上传并做涉密审核。'
          : '确认文档原文后，点击「开始审校」选择审校范围。',
        done: '本次审校在所选范围内未发现需要修改的事项。',
        stopped: '本次审校已停止。重新审校会创建一条新记录。',
        failed: '本次审校未完成，请点击「重新审校」。',
      };
      const message = messages[state.status];
      dom.groups.innerHTML = state.status === 'done'
        ? `<div class="pr-empty">${icon('check')}<p>${message}</p></div>`
        : `<p class="pr-review-hint">${message}</p>`;
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
              <p class="pr-issue-type">错误类型：${escape(issue.type)}${done ? ' · 已采纳' : ignored ? ' · 未采纳' : ''}</p>
              ${
                done || ignored
                  ? ''
                  : `<div class="pr-issue-actions"><button type="button" data-accept="${issue.id}">采纳</button><button type="button" data-ignore="${issue.id}">不采纳</button></div>`
              }
            </article>`;
          })
          .join('')}`
      )
      .join('');
    if (!remaining.length) dom.count.textContent = `共 ${state.issues.length} 个事项 · 全部处理完成`;
  }

  function renderAll() {
    renderDocs();
    renderRail();
    renderPage();
    renderResult();
  }

  /* ---------- 涉密检测详情弹窗 ---------- */
  function openSecret(id, followReview = '') {
    const record = state.records.find((item) => item.id === id);
    if (!record) return;
    state.secretId = id;
    state.followReview = followReview;
    renderSecret(record);
    dom.secret.showModal();
  }

  function renderSecret(record) {
    const meta = SECRET_META[record.secretStatus] || SECRET_META.detecting;
    dom.secretTitle.textContent = `涉密检测详情 — ${meta.label}`;
    dom.secretBody.innerHTML = secretBody(record);
    dom.secretFoot.innerHTML = secretFoot(record);
  }

  function secretBody(record) {
    const risky = record.secretStatus === 'hit' || record.secretStatus === 'submitted';
    let html = '';
    if (record.secretStatus === 'detecting') {
      const task = state.history.find(item => item.id === record.id && item.status === 'detecting');
      html += `<div class="pr-secret-loading" role="status"><span class="pr-spinner" aria-hidden="true"></span><h3>正在上传并审核</h3><p>${task ? '文件已提交至服务器，正在做涉密审核；通过后自动开始审校。可关闭弹窗，稍后从审校记录查看进度和结果。' : '文件已提交至服务器，正在做涉密审核；通过后可在文件列表预览并开始审校。'}</p></div>`;
    }
    if (risky) {
      html += `<div class="pr-alert">
        <span class="pr-alert-mark" aria-hidden="true">!</span>
        <div>
          <strong>检测到涉密内容</strong>
          <p>该文件包含敏感关键词，可提交管理员审核。</p>
          <div class="pr-alert-kw"><span>命中关键词</span>${record.keywords.map((word) => `<b>${escape(word)}</b>`).join('')}</div>
        </div>
      </div>`;
    }
    if (record.secretStatus === 'rejected') {
      html += `<div class="pr-alert"><div><strong>人工审核未通过</strong><p>${escape(record.auditReason || '该文档未获准进入审校。')}</p></div></div>`;
    }
    html += `<dl class="pr-facts">
      <div><dt>文件名</dt><dd>${escape(record.fileName || record.name)}</dd></div>
      <div><dt>来源</dt><dd>${record.source === 'upload' ? '本地上传' : '新建审校'} · V${record.version || 1} · ${charCount(record.text)} 字</dd></div>
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
    if (record.secretStatus === 'draft') {
      rows.push(`<li class="is-doing"><i aria-hidden="true"></i><div><p>待提交审核</p><span>文件仅保存在本地，点击「开始审校」后上传</span></div></li>`);
      return rows.join('');
    }
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
      rows.push(`<li class="is-doing"><i aria-hidden="true"></i><div><p>已提交管理员审核</p><span>审核通过后可预览并开始审校</span></div></li>`);
    } else if (record.secretStatus === 'passed') {
      rows.push(`<li class="is-done"><i aria-hidden="true"></i><div><p>允许预览与审校</p><span>可打开文档查看原文</span></div></li>`);
    }
    return rows.join('');
  }

  function secretFoot(record) {
    if (record.secretStatus === 'detecting') {
      return '<button type="button" class="is-primary" data-secret-close>后台继续</button>';
    }
    if (record.secretStatus === 'hit') {
      return `<button type="button" class="is-ghost" data-secret-close>稍后处理</button><button type="button" class="is-primary" data-secret-submit>提交人工审核</button>`;
    }
    if (record.secretStatus === 'submitted') {
      return `<span class="pr-demo-hint">人工审核演示</span><button type="button" class="is-ghost" data-secret-close>关闭</button><button type="button" class="is-ghost" data-secret-reject>模拟驳回</button><button type="button" class="is-primary" data-secret-approve>模拟审核通过</button>`;
    }
    if (record.secretStatus === 'rejected') return '<p class="pr-demo-hint">人工审核未通过，当前文档无法进入审校。</p><button type="button" class="is-ghost" data-secret-close>关闭</button>';
    return `<button type="button" class="is-ghost" data-secret-close>关闭</button><button type="button" class="is-primary" data-secret-open>预览原文</button>`;
  }

  /* ---------- 草稿、任务与持久化 ---------- */
  function hint(text) {
    if (dom) dom.status.textContent = text;
  }

  function remember() {
    window.localStorage.setItem('baige.proofread.selection', JSON.stringify({selection: state.selection, view: state.view}));
  }

  function sync(data = store.read()) {
    state.records = data.records;
    state.history = data.history;
    const record = state.selection?.kind === 'review'
      ? data.history.find(item => item.reviewId === state.selection.id)
      : data.records.find(item => item.id === state.selection?.id);
    const file = data.records.find(item => item.id === record?.id);
    state.session = record ? {...record, secretStatus: file?.secretStatus || record.secretStatus} : null;
    state.status = record?.status || 'idle';
    state.issues = record?.issues || [];
    state.accepted = new Set(record?.accepted || []);
    state.ignored = new Set(record?.ignored || []);
    state.progress = state.status === 'running'
      ? Math.min(99, Math.max(0, Math.floor((Date.now() - record.startedAt) / store.REVIEW_MS * 100))) : 0;
    state.snapshot = window.localStorage.getItem(store.KEY);
  }

  function refresh(data) {
    const prior = state.session?.reviewId;
    const editing = state.session?.secretStatus === 'draft';
    sync(data);
    if (!dom?.root.isConnected) return;
    renderDocs();
    renderRail();
    if (!editing || state.session?.secretStatus !== 'draft') renderPage();
    renderResult();
    if (dom.secret.open) {
      const file = state.records.find(item => item.id === state.secretId);
      if (file?.secretStatus === 'passed' && state.followReview && visible()) {
        state.selection = {kind: 'review', id: state.followReview};
        state.view = 'history';
        closeSecret();
        remember();
        sync();
        renderAll();
      } else if (file) renderSecret(file);
    }
    if (prior && state.status === 'done' && state.history.find(item => item.reviewId === prior)?.unread) {
      hint('审校已完成，结果已保存。');
    }
  }

  function perform(action) {
    try {
      const result = action();
      refresh(store.advance(scanSecret, detect));
      renderAll();
      return result;
    } catch (error) {
      hint(error.message || '保存失败，请稍后重试。');
      return null;
    }
  }

  function visible() {
    return dom?.root.isConnected && document.visibilityState !== 'hidden'
      && !dom.root.closest('[hidden]') && state.foreground !== false;
  }

  function tick() {
    if (!store || state.unsaved) return;
    try {
      const data = store.advance(scanSecret, detect);
      if (window.localStorage.getItem(store.KEY) !== state.snapshot) refresh(data);
      else if (state.status === 'running' && visible()) { sync(data); renderResult(); }
    } catch (error) { hint(error.message || '进度更新失败，可稍后重试。'); }
  }

  function saveDraft() {
    try {
      const draft = store.saveDraft(state.session.id, dom.draftTitle.value, dom.draftText.value);
      state.unsaved = false;
      dom.root.dataset.autosaved = 'true';
      state.onDirty(false);
      sync();
      dom.saveState.textContent = '';
      dom.saveRetry.hidden = true;
      dom.charCount.textContent = `字数统计 ${charCount(draft.text)}`;
      renderDocs();
      renderResult();
      return true;
    } catch {
      state.unsaved = true;
      dom.root.dataset.autosaved = 'false';
      state.onDirty(true);
      dom.saveState.textContent = '保存失败，当前内容仍保留，请重试';
      dom.saveRetry.hidden = false;
      renderResult();
      return false;
    }
  }

  function canLeaveDraft() {
    return !state.unsaved || saveDraft();
  }

  function select(kind, id) {
    state.selection = {kind, id};
    state.original = false;
    try { remember(); } catch { hint('页面位置保存失败，文档内容已单独保存。'); }
    sync();
    renderAll();
  }

  function newDraft() {
    if (!canLeaveDraft()) return;
    const draft = perform(() => store.createDraft());
    if (!draft) return;
    state.view = 'files';
    select('file', draft.id);
    dom.draftText.focus();
  }

  function switchView(next) {
    state.view = next;
    dom.search.value = '';
    try { remember(); } catch { hint('列表位置保存失败。'); }
    renderRail();
    renderDocs();
  }

  function openDoc(id) {
    if (!canLeaveDraft()) return;
    const file = state.records.find(item => item.id === id);
    if (!file) return;
    const current = state.history.find(item => item.id === id && ['detecting', 'hit', 'submitted', 'running'].includes(item.status));
    if (current) { openReview(current.reviewId); return; }
    select('file', id);
    if (isBlocked(file)) openSecret(id);
  }

  function openReview(id) {
    if (!canLeaveDraft()) return;
    perform(() => store.markRead(id));
    state.view = 'history';
    select('review', id);
  }

  function upload() {
    dom.file.value = '';
    dom.file.click();
  }

  function onFile() {
    const file = dom.file.files?.[0];
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) { hint('原型支持 TXT / MD 文本。'); return; }
    const selection = JSON.stringify(state.selection);
    const reader = new FileReader();
    reader.onload = () => {
      const record = perform(() => store.addUpload(file.name, String(reader.result || '')));
      if (!record) return;
      if (JSON.stringify(state.selection) !== selection) { hint('文件已上传，可从文件列表查看检测进度。'); return; }
      state.view = 'files';
      select('file', record.id);
    };
    reader.onerror = () => hint('文件读取失败，请重新上传。');
    reader.readAsText(file, 'utf-8');
  }

  function startCheck(reviewTypes) {
    const record = activeRecord();
    if (!record || state.unsaved) return;
    const review = perform(() => store.startReview({
      fileId: record.id, reviewId: record.reviewId, types: reviewTypes,
    }));
    if (!review) return;
    state.view = 'history';
    select('review', review.reviewId);
    if (isBlocked(state.session)) openSecret(review.id, review.reviewId);
  }

  function stopCheck() {
    const id = state.session?.reviewId;
    if (!id) return;
    perform(() => store.stopReview(id));
    closeSecret();
  }

  function openDialog() {
    dom.dialog.querySelectorAll('input').forEach(input => {
      input.checked = (state.session.reviewTypes || TYPES).includes(input.value);
    });
    dom.dialog.querySelector('[data-confirm]').disabled = false;
    dom.dialog.showModal();
  }

  function acceptIssue(id) { perform(() => store.decide(state.session.reviewId, id, true)); }
  function ignoreIssue(id) { perform(() => store.decide(state.session.reviewId, id, false)); }
  function acceptAll() { acceptIssue('all'); }
  function ignoreAll() { ignoreIssue('all'); }

  function submitAudit(id) { perform(() => store.audit(id, 'submitted')); }
  function approveAudit(id) { perform(() => store.audit(id, 'passed')); tick(); }
  function rejectAudit(id) { perform(() => store.audit(id, 'rejected')); }
  function closeSecret() {
    state.followReview = '';
    dom.secret.close();
  }

  function build(root) {
    root.classList.toggle('proofread-workspace', true);
    root.innerHTML = `
      <div class="pr-app tool-workspace-frame">
        <aside class="pr-rail" id="proofreadRail" aria-label="审校记录与文件">
          <div class="pr-brand">
            <span class="pr-logo" aria-hidden="true">${icon('check')}</span>
            <div><h2>审校助手</h2><p>纠错校对</p></div>
          </div>
          <button type="button" class="secondary-button pr-new" data-new>${icon('newchat')}新建审校</button>
          <button type="button" class="pr-completion" data-notice hidden>有新的审校结果 · 点击查看</button>

          <div class="pr-switch" role="tablist" aria-label="文档视图">
            <button class="pr-switch-btn" type="button" role="tab" data-view="history" aria-selected="true">${icon('history')}<span>审校记录</span></button>
            <button class="pr-switch-btn" type="button" role="tab" data-view="files" aria-selected="false">${icon('folder')}<span>文件列表</span></button>
          </div>
          <div class="pr-panel">
            <button class="secondary-button pr-upload" type="button" data-upload>${icon('file')}上传文件</button>
            <label class="pr-search">${icon('search')}<input type="search" data-search aria-label="搜索审校记录" /></label>
            <ul class="pr-list" data-list></ul>
            <p class="pr-end" data-end>没有更多了</p>
          </div>
        </aside>

        <section class="pr-editor" aria-label="文档预览">
          <button class="pr-rail-toggle" type="button" data-toggle-rail aria-controls="proofreadRail" aria-expanded="true" title="收起列表" aria-label="收起列表">
            <svg viewBox="0 0 12 36" width="12" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path class="pr-rail-grip" d="M6 5v26"/>
              <path class="pr-rail-chevron" d="M8 5 4 18l4 13"/>
            </svg>
          </button>
          <header class="pr-editor-head">
            <div class="pr-document-heading"><h2 data-editor-title>文档预览</h2><span class="pr-doc-name" data-doc-name>未选择文档</span></div>
            <div class="pr-doc-actions">
              <button class="pr-doc-action" type="button" data-original hidden>查看原文</button>
              <button class="pr-doc-action" type="button" data-download><span aria-hidden="true">↓</span><span>下载</span></button>
            </div>
          </header>
          <div class="pr-canvas">
            <div class="pr-draft" data-draft hidden>
              <label class="pr-draft-title"><span class="sr-only">文档名称</span><input type="text" data-draft-title maxlength="100" placeholder="文档名称（可选）" /></label>
              <label class="pr-draft-body"><span class="sr-only">审校正文</span><textarea data-draft-text placeholder="在这里输入或粘贴需要审校的正文…" spellcheck="false"></textarea></label>
            </div>
            <div class="pr-page" data-doc role="region" aria-label="文档正文" tabindex="0" contenteditable="false"></div>
            <div class="pr-guard" data-guard hidden></div>
          </div>
          <footer class="pr-status">
            <span data-char>字数统计 0</span>
            <span data-save-state role="status"></span>
            <button type="button" class="pr-doc-action" data-retry-save hidden>重试保存</button>
          </footer>
        </section>

        <aside class="pr-result" aria-label="审校结果">
          <header class="pr-result-head">
            <div><h2>审校结果</h2><span data-result-file>选择审校记录或已通过审核的文件</span></div>
            <div class="pr-result-actions">
              <button class="pr-run" type="button" data-run>开始审校</button>
              <button class="pr-stop" type="button" data-stop hidden>取消任务</button>
            </div>
          </header>
          <p class="pr-inline-status" data-status role="status"></p>
          <div class="pr-summary" data-summary hidden>
            <span data-count>共 0 个事项</span>
            <div class="pr-bulk" data-bulk hidden><button type="button" data-accept-all>全部采纳</button><button type="button" data-ignore-all>全部不采纳</button></div>
          </div>
          <div class="pr-groups" data-groups></div>
        </aside>
      </div>

      <dialog class="pr-dialog" data-dialog aria-labelledby="prDialogTitle">
        <h2 id="prDialogTitle">审校范围</h2>
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
      draft: root.querySelector('[data-draft]'),
      draftTitle: root.querySelector('[data-draft-title]'),
      draftText: root.querySelector('[data-draft-text]'),
      saveState: root.querySelector('[data-save-state]'),
      saveRetry: root.querySelector('[data-retry-save]'),
      editorTitle: root.querySelector('[data-editor-title]'),
      originalToggle: root.querySelector('[data-original]'),
      notice: root.querySelector('[data-notice]'),
      guard: root.querySelector('[data-guard]'),
      docName: root.querySelector('[data-doc-name]'),
      switchRoot: root.querySelector('.pr-switch'),
      uploadButton: root.querySelector('[data-upload]'),
      download: root.querySelector('[data-download]'),
      list: root.querySelector('[data-list]'),
      search: root.querySelector('[data-search]'),
      end: root.querySelector('[data-end]'),
      run: root.querySelector('[data-run]'),
      stop: root.querySelector('[data-stop]'),
      resultFile: root.querySelector('[data-result-file]'),
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
    dom.root.querySelector('[data-new]').addEventListener('click', newDraft);
    dom.saveRetry.addEventListener('click', saveDraft);
    dom.draft.addEventListener('input', saveDraft);
    dom.originalToggle.addEventListener('click', () => { state.original = !state.original; renderPage(); });
    dom.notice.addEventListener('click', () => {
      const review = state.history.find(item => item.unread);
      if (review) openReview(review.reviewId);
    });
    dom.stop.addEventListener('click', stopCheck);
    dom.secret.addEventListener('cancel', () => { state.followReview = ''; });
    const app = dom.root.querySelector('.pr-app');
    const rail = dom.root.querySelector('#proofreadRail');
    const toggle = dom.root.querySelector('[data-toggle-rail]');
    toggle.addEventListener('click', () => {
      const open = rail.hidden;
      rail.hidden = !open;
      app.classList.toggle('is-rail-collapsed', !open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '收起列表' : '展开列表');
      toggle.title = open ? '收起列表' : '展开列表';
    });
    dom.switchRoot.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      switchView(button.dataset.view);
    });

    dom.search.addEventListener('input', renderDocs);
    dom.list.addEventListener('click', event => {
      const file = event.target.closest('[data-record]');
      const review = event.target.closest('[data-review]');
      if (file) openDoc(file.dataset.record);
      if (review) openReview(review.dataset.review);
    });

    dom.guard.addEventListener('click', (event) => {
      if (!event.target.closest('[data-guard-detail]')) return;
      const record = activeRecord();
      if (record) openSecret(record.id);
    });

    dom.run.addEventListener('click', () => {
      if (state.status === 'running') stopCheck();
      else if (isBlocked(state.session)) openSecret(state.session.id,
        ['detecting', 'hit', 'submitted'].includes(state.status) ? state.session.reviewId : '');
      else openDialog();
    });
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
      const text = state.original ? record.originalText : record.text;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const suffix = record.reviewId ? (state.original ? '-原文' : '-修订稿') : '';
      link.download = `${record.name || '审校文档'}${suffix}.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

    const confirmOptions = dom.dialog.querySelector('[data-confirm]');
    dom.dialog.addEventListener('change', () => {
      confirmOptions.disabled = !dom.dialog.querySelector('input:checked');
    });
    dom.dialog.querySelector('[data-cancel]').addEventListener('click', () => dom.dialog.close());
    confirmOptions.addEventListener('click', () => {
      const reviewTypes = Array.from(dom.dialog.querySelectorAll('input:checked'), input => input.value);
      dom.dialog.close();
      startCheck(reviewTypes);
    });

    dom.secret.addEventListener('click', (event) => {
      const id = state.secretId;
      if (event.target.closest('[data-secret-x]') || event.target.closest('[data-secret-close]') || event.target === dom.secret) {
        closeSecret();
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
      if (event.target.closest('[data-secret-reject]')) {
        rejectAudit(id);
        return;
      }
      if (event.target.closest('[data-secret-open]')) {
        const record = state.records.find((item) => item.id === id);
        closeSecret();
        if (record) openDoc(record.id);
      }
    });
  }

  function render(target, onDirty = () => {}) {
    state.onDirty = onDirty;
    build(target);
    bind();
    clearInterval(state.timer);
    const now = Date.now();
    const records = [
      ['项目周会纪要', SAMPLE, 'passed'],
      ['船舶设备维护简报', '截止目前，设备按装和调试已完成，，请各班组核对维护记录。', 'passed'],
      ['试验计划草稿', '演示材料：下周拟召开型号研制协调会议。', 'submitted'],
      ['资料移交清单', '演示材料：内部资料移交前请核对目录。', 'hit'],
    ].map(([name, text, secretStatus], index) => {
      const uploadedAt = now - (index + 1) * 3600000;
      const fileName = `${name}.txt`;
      return {
        id: uid('rec'), name, text, secretStatus, fileName, uploadedAt,
        updated: uploadedAt, reviewedAt: uploadedAt + 1500, auditedAt: 0,
        source: 'upload', version: 1, keywords: scanSecret(fileName, text),
      };
    });
    const history = [
      [records[0], SAMPLE, 30],
      [records[1], records[1].text, 65],
      [records[0], '请各部门严各核对会仪材料，确宝记录完整。', 120],
    ].map(([record, text, minutesAgo]) => ({
      ...record, text, originalText: text, reviewId: uid('review'), checkedAt: now - minutesAgo * 60000,
      status: 'done', reviewTypes: TYPES.slice(), issues: detect(text), ignored: [], accepted: [],
    }));
    try {
      store.initialize(records, history);
      const selection = JSON.parse(window.localStorage.getItem('baige.proofread.selection') || 'null');
      state.selection = selection?.selection || {kind: 'review', id: history[0].reviewId};
      state.view = selection?.view || 'history';
      state.unsaved = false;
      state.foreground = true;
      state.original = false;
      state.followReview = '';
      target.dataset.autosaved = 'true';
      sync(store.advance(scanSecret, detect));
      if (!state.session && state.history.length) state.selection = {kind: 'review', id: state.history[0].reviewId};
      sync();
      renderAll();
      state.timer = setInterval(tick, 400);
    } catch (error) { hint(error.message || '无法读取审校数据，请检查浏览器存储空间。'); }
  }

  function deactivate() {
    state.foreground = false;
    state.followReview = '';
    dom?.secret.close();
    dom?.dialog.close();
  }

  function resume() {
    state.foreground = true;
    tick();
  }

  window.addEventListener?.('storage', event => { if (event.key === store?.KEY) tick(); });
  window.BaigeProofreadTool = { render, resume, deactivate, detect, scanSecret, SAMPLE, SECRET_META };
})();
