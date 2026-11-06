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
    draft: { label: '未提交', tone: 'muted' },
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
    screen: 'files',
    resultOnly: false,
    rangeTarget: null,
    noticeTimer: null,
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
    removeId: '',
    selection: null,
    followReview: '',
    snapshot: '',
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

  function tableTime(value) {
    return value ? `${new Date(value).getFullYear()}-${clockOf(value, true)}` : '—';
  }

  function renderIntake() {
    dom.fileRows.innerHTML = state.records.map(file => {
      const review = state.history.find(item => item.id === file.id);
      const result = state.history.find(item => item.id === file.id && item.status === 'done');
      const id = escape(file.id);
      const approved = file.secretStatus === 'passed';
      const fileName = file.fileName || file.name;
      const name = escape(fileName);
      const type = /\.md$/i.test(fileName) ? 'MD' : 'TXT';
      const secret = SECRET_META[file.secretStatus] || SECRET_META.detecting;
      const updated = Math.max(file.uploadedAt || 0, file.updated || 0, file.reviewedAt || 0,
        file.auditedAt || 0, review?.checkedAt || 0, review?.finishedAt || 0);
      let action = '';
      if (approved && result) {
        action = `<button type="button" class="pr-material-action" data-intake-review="${escape(result.reviewId)}">查看结果</button>`;
      } else if (approved && review) {
        const label = review.status === 'running' ? '查看校对进度' : '查看状态';
        action = `<button type="button" class="pr-material-action" data-intake-review="${escape(review.reviewId)}">${label}</button>`;
      } else if (approved || file.secretStatus === 'draft') {
        const label = approved ? '开始校对' : '提交校对';
        action = `<button type="button" class="pr-material-action" data-intake-start="${id}">${label}</button>`;
      }
      return `<tr class="${approved ? '' : 'is-locked'}">
        <td><div class="wr-file-name"><span class="wr-file-icon is-doc">${type}</span><span title="${name}">${name}</span></div></td>
        <td>${file.source === 'upload' ? '本地上传' : '文字录入'}</td><td>校对文档</td><td>V${file.version || 1}.0.0</td>
        <td>${tableTime(file.uploadedAt)}</td><td><span class="wr-tag parse-${approved ? 'parsed' : 'unparsed'}">${approved ? '已解析' : '未解析'}</span></td>
        <td><div class="wr-secret-cell"><span class="wr-tag secret-${escape(file.secretStatus)}">${escape(secret.label)}</span>
          <button type="button" class="wr-eye" data-intake-secret="${id}" title="查看涉密核查详情" aria-label="查看 ${name} 的涉密核查详情">${icon('eye')}</button></div></td>
        <td>${tableTime(updated)}</td><td><div class="wr-file-actions">${action}
          <button type="button" class="is-danger" data-delete="${id}" title="删除文件" aria-label="删除 ${name}">${icon('trash')}</button></div></td>
      </tr>`;
    }).join('');
    dom.fileTable.hidden = state.records.length === 0;
    dom.filesEmpty.hidden = state.records.length > 0;
  }

  function renderDocs() {
    const keyword = dom.search.value.trim();
    const entries = state.history.filter(item => item.name.includes(keyword) || item.fileName?.includes(keyword));
    dom.list.innerHTML = entries.length ? entries.map(item => {
      const active = state.session?.reviewId === item.reviewId;
      const {label, tone} = REVIEW_META[item.status];
      return `<li class="pr-doc-row"><button type="button" class="pr-doc${active ? ' is-active' : ''}" data-review="${escape(item.reviewId)}" aria-current="${active}" title="${escape(item.name)}">
        <span class="pr-doc-icon is-upload">${icon('history')}</span>
        <span class="pr-doc-body"><span class="pr-doc-name">${escape(item.name)}${item.version > 1 ? ` · V${item.version}` : ''}${item.unread ? '<i class="pr-unread" aria-label="新结果"></i>' : ''}</span>
          <span class="pr-doc-meta is-${tone}"><i class="pr-dot is-${tone}" aria-hidden="true"></i>${label}<b>·</b>${clockOf(item.checkedAt, true)}</span></span>
      </button></li>`;
    }).join('') : `<li class="pr-list-empty">${keyword ? '没有匹配的记录' : '还没有审校记录'}</li>`;
    dom.end.hidden = entries.length === 0;
  }

  /* ---------- 渲染：文档区与拦截态 ---------- */
  function renderPage() {
    if (!dom) return;
    const record = activeRecord();
    dom.workbenchName.textContent = record ? record.fileName || record.name : '';
    if (!record) {
      dom.page.textContent = '';
      dom.guard.hidden = true;
      dom.charCount.textContent = '字数统计 0';
      return;
    }
    const text = record.originalText ?? record.text;
    if (isBlocked(record)) {
      dom.page.textContent = '';
      dom.page.setAttribute('contenteditable', 'false');
      dom.guard.hidden = false;
      dom.guard.innerHTML = guardBody(record);
    } else {
      dom.guard.hidden = true;
      if (!state.issues.length) {
        dom.page.textContent = text;
      } else {
        const parts = [];
        let cursor = 0;
        for (const issue of state.issues) {
          if (issue.start < cursor) continue;
          parts.push(escape(text.slice(cursor, issue.start)));
          const resolved = state.accepted.has(issue.id) || state.ignored.has(issue.id);
          const cls = resolved ? 'pr-hit is-ignored' : 'pr-hit';
          parts.push(`<span class="${cls}" data-hit="${issue.id}">${escape(text.slice(issue.start, issue.end))}</span>`);
          cursor = issue.end;
        }
        parts.push(escape(text.slice(cursor)));
        dom.page.innerHTML = parts.join('');
      }
    }
    dom.charCount.textContent = `字数统计 ${charCount(text)}`;
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
    dom.run.hidden = !running;
    dom.download.disabled = !record || isBlocked(record);
    dom.resultFile.textContent = REVIEW_META[state.status]?.label || '等待校对';
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
        idle: '从文件列表选择已通过涉密核查的文件开始校对。',
        done: '本次审校在所选范围内未发现需要修改的事项。',
        stopped: '本次校对已停止。',
        failed: '本次校对未能完成。',
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
    renderIntake();
    renderDocs();
    renderPage();
    renderResult();
  }

  /* ---------- 涉密检测详情弹窗 ---------- */
  function openSecret(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record) return;
    state.secretId = id;
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
      html += `<div class="pr-secret-loading" role="status"><span class="pr-spinner" aria-hidden="true"></span><h3>正在上传并审核</h3><p>${task ? '正在进行涉密核查，通过后开始校对。关闭窗口后可在文件列表查看进度。' : '正在进行涉密核查，通过后可从文件列表开始校对。'}</p></div>`;
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
    return '<button type="button" class="is-primary" data-secret-close>关闭</button>';
  }

  /* ---------- 草稿、任务与持久化 ---------- */
  function hint(text) {
    if (dom) (state.screen === 'workbench' ? dom.status : dom.intakeStatus).textContent = text;
  }

  function showScreen(screen) {
    state.screen = screen;
    dom.intake.hidden = screen === 'workbench';
    dom.intakeActions.hidden = screen !== 'files';
    dom.files.hidden = screen !== 'files';
    dom.draft.hidden = screen !== 'text';
    dom.workbench.hidden = screen !== 'workbench';
    dom.workbench.classList.toggle('is-result-only', state.resultOnly);
    dom.rail.hidden = state.resultOnly || dom.app.classList.contains('is-rail-collapsed');
    dom.railToggle.hidden = state.resultOnly;
  }

  function sync(data = store.read()) {
    state.records = data.records;
    state.history = data.history;
    const record = data.history.find(item => item.reviewId === state.selection);
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
    sync(data);
    if (!dom?.root.isConnected) return;
    if (state.screen === 'workbench' && !state.session) showScreen('files');
    renderAll();
    if (dom.secret.open) {
      const file = state.records.find(item => item.id === state.secretId);
      const following = state.history.find(item => item.reviewId === state.followReview);
      if (!file || (file.secretStatus === 'passed' && following?.id === file.id)) dom.secret.close();
      else renderSecret(file);
    }
    followSubmission();
  }

  function perform(action) {
    let result;
    try { result = action(); }
    catch (error) {
      hint(error.message || '保存失败，请稍后重试。');
      return null;
    }
    refresh();
    return result;
  }

  function visible() {
    return dom?.root.isConnected && document.visibilityState !== 'hidden'
      && !dom.root.closest('[hidden]') && state.foreground !== false;
  }

  function tick(force = false) {
    if (!store || !dom) return;
    try {
      const data = store.advance(scanSecret, detect);
      if (force || window.localStorage.getItem(store.KEY) !== state.snapshot) refresh(data);
      else if (state.screen === 'workbench' && state.status === 'running' && visible()) { sync(data); renderResult(); }
      else followSubmission();
    } catch (error) { hint(error.message || '进度更新失败，可稍后重试。'); }
  }

  function updateDraft() {
    const count = charCount(dom.draftText.value);
    dom.draftCount.textContent = `${count} 字`;
    dom.draftSubmit.disabled = count === 0;
    const dirty = count > 0 || Boolean(dom.draftTitle.value.trim());
    dom.root.dataset.autosaved = String(!dirty);
    state.onDirty(dirty);
  }

  function newDraft() {
    state.followReview = '';
    showScreen('text');
    hint('');
    dom.draftText.focus();
  }

  function backToFiles() {
    state.followReview = '';
    showScreen('files');
    hint('');
    dom.uploadButton.focus();
  }

  function openReview(id, resultOnly = false) {
    const review = state.history.find(item => item.reviewId === id);
    const file = state.records.find(item => item.id === review?.id);
    if (!review || !file) return;
    if (isBlocked(file)) { openSecret(file.id); return; }
    state.followReview = '';
    state.selection = id;
    state.resultOnly = resultOnly;
    showScreen('workbench');
    if (review.unread) perform(() => store.markRead(id));
    sync();
    renderAll();
    dom.workbenchBack.focus();
  }

  function followSubmission() {
    if (!state.followReview || state.screen !== 'files' || !visible() || dom.intakeNotice.open || dom.secret.open || dom.dialog.open || dom.confirmDelete.open) return;
    const review = state.history.find(item => item.reviewId === state.followReview);
    const file = state.records.find(item => item.id === review?.id);
    if (file?.secretStatus === 'passed' && ['running', 'done', 'failed'].includes(review.status)) {
      openReview(review.reviewId);
    }
  }

  function showIntakeNotice() {
    clearTimeout(state.noticeTimer);
    if (!visible()) return;
    dom.intakeNotice.showModal();
    state.noticeTimer = setTimeout(() => dom.intakeNotice.close(), 5000);
  }

  function upload() {
    state.followReview = '';
    dom.file.value = '';
    dom.file.click();
  }

  function onFile() {
    const file = dom.file.files?.[0];
    if (!file) return;
    state.followReview = '';
    if (!/\.(txt|md)$/i.test(file.name)) { hint('请选择 TXT 或 MD 文件。'); return; }
    const target = dom;
    const reader = new FileReader();
    target.uploadButton.disabled = true;
    reader.onload = () => {
      target.uploadButton.disabled = false;
      if (dom !== target) return;
      const saved = perform(() => store.submitFile({fileName: file.name, text: String(reader.result || ''), source: 'upload'}));
      if (saved && state.screen === 'files') showIntakeNotice();
    };
    reader.onerror = () => {
      target.uploadButton.disabled = false;
      if (dom === target) hint('文件读取失败，请重新上传。');
    };
    reader.readAsText(file, 'utf-8');
  }

  function startCheck(reviewTypes) {
    const target = state.rangeTarget;
    state.rangeTarget = null;
    if (!target) return;
    const review = perform(() => store.startReview({...target, types: reviewTypes}));
    if (!review) return;
    if (target.document) {
      dom.draftTitle.value = '';
      dom.draftText.value = '';
      updateDraft();
    }
    if (review.secretStatus === 'passed') {
      openReview(review.reviewId);
    } else {
      state.followReview = review.reviewId;
      showScreen('files');
      showIntakeNotice();
    }
  }

  function stopCheck() {
    const id = state.session?.reviewId;
    if (id) perform(() => store.stopReview(id));
  }

  function openDialog(target, types = TYPES) {
    state.rangeTarget = target;
    dom.dialog.querySelectorAll('input').forEach(input => { input.checked = types.includes(input.value); });
    dom.dialog.querySelector('[data-confirm]').disabled = false;
    dom.dialog.showModal();
  }

  function acceptIssue(id) { perform(() => store.decide(state.session.reviewId, id, true)); }
  function ignoreIssue(id) { perform(() => store.decide(state.session.reviewId, id, false)); }
  function acceptAll() { acceptIssue('all'); }
  function ignoreAll() { ignoreIssue('all'); }

  function askDelete(id) {
    const file = state.records.find(item => item.id === id);
    if (!file) return;
    const reviews = state.history.filter(item => item.id === id).length;
    state.removeId = id;
    dom.deleteText.textContent = reviews
      ? `「${file.name}」有 ${reviews} 条审校记录，删除后文件和记录一并移除，无法恢复。`
      : `「${file.name}」删除后无法恢复。`;
    dom.confirmDelete.showModal();
  }

  function removeFile() {
    const id = state.removeId;
    state.removeId = '';
    dom.confirmDelete.close();
    if (id && perform(() => store.remove(id))) {
      hint('已删除该文件。');
      dom.uploadButton.focus();
    }
  }

  function submitAudit(id) { perform(() => store.audit(id, 'submitted')); }
  function approveAudit(id) { perform(() => store.audit(id, 'passed')); tick(); }
  function rejectAudit(id) { perform(() => store.audit(id, 'rejected')); }
  function closeSecret() { dom.secret.close(); }

  function build(root) {
    root.classList.toggle('proofread-workspace', true);
    root.innerHTML = `
      <section class="pr-intake" data-intake aria-labelledby="prIntakeTitle">
        <header class="pr-intake-head">
          <div><h1 id="prIntakeTitle">纠错校对</h1><p>上传本地文件，或粘贴、手动输入文字。</p></div>
          <div class="pr-intake-actions" data-intake-actions>
            <button type="button" class="secondary-button" data-new>${icon('pen')}粘贴或输入文字</button>
            <button type="button" class="primary-button" data-upload>${icon('upload')}上传本地文件</button>
          </div>
        </header>
        <section class="pr-material-table" data-files aria-labelledby="prFilesTitle">
          <div class="pr-intake-table-heading"><h2 id="prFilesTitle">文件列表</h2><span>支持 TXT、MD</span></div>
          <div class="wr-file-table-wrap" data-file-table tabindex="0" role="region" aria-label="校对文件列表">
            <table class="wr-file-table">
              <thead><tr><th scope="col">文件名</th><th scope="col">文件来源</th><th scope="col">文档类型</th><th scope="col">版本号</th><th scope="col">创建时间</th><th scope="col">解析状态</th><th scope="col">涉密审查状态</th><th scope="col">最近更新</th><th scope="col">操作</th></tr></thead>
              <tbody data-intake-table></tbody>
            </table>
          </div>
          <p class="pr-intake-empty" data-files-empty hidden>还没有校对文件</p>
        </section>
        <form class="pr-intake-card pr-intake-editor" data-intake-editor hidden>
          <header class="pr-intake-toolbar"><h2>录入正文</h2><button type="button" class="pr-intake-link" data-intake-back>返回文件列表</button></header>
          <div class="pr-draft">
            <label class="pr-draft-title"><span class="sr-only">文档名称</span><input type="text" data-draft-title maxlength="100" placeholder="文档名称（可选）" /></label>
            <label class="pr-draft-body"><span class="sr-only">校对正文</span><textarea data-draft-text placeholder="粘贴或输入需要校对的文字" spellcheck="false" rows="8"></textarea></label>
          </div>
          <footer class="pr-intake-editor-foot"><span data-draft-count>0 字</span><button class="primary-button" type="submit" data-intake-submit disabled>提交校对</button></footer>
        </form>
        <p class="pr-inline-status" data-intake-status role="status"></p>
      </section>
      <section class="pr-workbench" data-workbench hidden aria-label="校对工作区">
        <header class="pr-workbench-head">
          <button class="pr-intake-back" type="button" data-intake-back>${icon('back')}返回文件列表</button>
          <h1 data-workbench-name></h1>
        </header>
        <div class="pr-app tool-workspace-frame">
        <aside class="pr-rail" id="proofreadRail" aria-label="审校记录">
          <div class="pr-brand">
            <span class="pr-logo" aria-hidden="true">${icon('history')}</span>
            <div><h2>审校记录</h2><p>纠错校对</p></div>
          </div>
          <div class="pr-panel">
            <label class="pr-search">${icon('search')}<input type="search" data-search aria-label="搜索审校记录" placeholder="搜索审校记录" /></label>
            <ul class="pr-list" data-list></ul>
            <p class="pr-end" data-end>没有更多了</p>
          </div>
        </aside>

        <section class="pr-editor" aria-label="原文">
          <button class="pr-rail-toggle" type="button" data-toggle-rail aria-controls="proofreadRail" aria-expanded="true" title="收起列表" aria-label="收起列表">
            <svg viewBox="0 0 12 36" width="12" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path class="pr-rail-grip" d="M6 5v26"/>
              <path class="pr-rail-chevron" d="M8 5 4 18l4 13"/>
            </svg>
          </button>
          <header class="pr-editor-head">
            <div class="pr-document-heading"><h2>原文</h2></div>
            <div class="pr-doc-actions">
              <button class="pr-doc-action" type="button" data-download>${icon('download')}下载原文</button>
            </div>
          </header>
          <div class="pr-canvas">
            <div class="pr-page" data-doc role="region" aria-label="文档正文" tabindex="0" contenteditable="false"></div>
            <div class="pr-guard" data-guard hidden></div>
          </div>
          <footer class="pr-status">
            <span data-char>字数统计 0</span>
          </footer>
        </section>

        <aside class="pr-result" aria-label="审校结果">
          <header class="pr-result-head">
            <div><h2>校对结果</h2><span data-result-file>等待校对</span></div>
            <div class="pr-result-actions">
              <button class="pr-run" type="button" data-run hidden>停止审校</button>
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
      </section>

      <dialog class="pr-dialog" data-intake-notice aria-labelledby="prNoticeTitle">
        <h2 id="prNoticeTitle">文件录入须知</h2>
        <div class="pr-dialog-body">
          <p>严禁录入或上传涉密文档。提交后，系统将进行涉密核查。发现疑似涉密内容时，须经专人审核通过后，方可入库并开始校对。</p>
        </div>
        <div class="pr-dialog-foot">
          <span class="pr-demo-hint">5 秒后自动关闭</span>
          <button type="button" class="is-primary" data-notice-close>关闭</button>
        </div>
      </dialog>

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

      <dialog class="pr-dialog pr-confirm" data-confirm-delete aria-labelledby="prDeleteTitle">
        <h2 id="prDeleteTitle">删除文件</h2>
        <div class="pr-dialog-body"><p class="pr-confirm-text" data-delete-text></p></div>
        <div class="pr-dialog-foot">
          <button type="button" data-delete-cancel>取消</button>
          <button type="button" class="is-danger" data-delete-ok>删除</button>
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
      intake: root.querySelector('[data-intake]'),
      intakeActions: root.querySelector('[data-intake-actions]'),
      files: root.querySelector('[data-files]'),
      fileRows: root.querySelector('[data-intake-table]'),
      fileTable: root.querySelector('[data-file-table]'),
      filesEmpty: root.querySelector('[data-files-empty]'),
      intakeStatus: root.querySelector('[data-intake-status]'),
      intakeNotice: root.querySelector('[data-intake-notice]'),
      workbench: root.querySelector('[data-workbench]'),
      app: root.querySelector('.pr-app'),
      workbenchName: root.querySelector('[data-workbench-name]'),
      workbenchBack: root.querySelector('[data-workbench] [data-intake-back]'),
      rail: root.querySelector('#proofreadRail'),
      railToggle: root.querySelector('[data-toggle-rail]'),
      page: root.querySelector('[data-doc]'),
      draft: root.querySelector('[data-intake-editor]'),
      draftTitle: root.querySelector('[data-draft-title]'),
      draftText: root.querySelector('[data-draft-text]'),
      draftCount: root.querySelector('[data-draft-count]'),
      draftSubmit: root.querySelector('[data-intake-submit]'),
      guard: root.querySelector('[data-guard]'),
      uploadButton: root.querySelector('[data-upload]'),
      download: root.querySelector('[data-download]'),
      list: root.querySelector('[data-list]'),
      search: root.querySelector('[data-search]'),
      end: root.querySelector('[data-end]'),
      run: root.querySelector('[data-run]'),
      resultFile: root.querySelector('[data-result-file]'),
      summary: root.querySelector('[data-summary]'),
      count: root.querySelector('[data-count]'),
      bulk: root.querySelector('[data-bulk]'),
      groups: root.querySelector('[data-groups]'),
      charCount: root.querySelector('[data-char]'),
      status: root.querySelector('[data-status]'),
      dialog: root.querySelector('[data-dialog]'),
      confirmDelete: root.querySelector('[data-confirm-delete]'),
      deleteText: root.querySelector('[data-delete-text]'),
      secret: root.querySelector('[data-secret]'),
      secretTitle: root.querySelector('[data-secret-title]'),
      secretBody: root.querySelector('[data-secret-body]'),
      secretFoot: root.querySelector('[data-secret-foot]'),
      file: root.querySelector('[data-file]'),
    };
  }

  function bind() {
    dom.root.querySelector('[data-new]').addEventListener('click', newDraft);
    dom.root.querySelectorAll('[data-intake-back]').forEach(button => button.addEventListener('click', backToFiles));
    dom.draft.addEventListener('input', updateDraft);
    dom.draft.addEventListener('submit', event => {
      event.preventDefault();
      if (!dom.draftText.value.trim()) return;
      const document = {name: dom.draftTitle.value, text: dom.draftText.value, source: 'text'};
      openDialog({document});
    });
    dom.intakeNotice.querySelector('[data-notice-close]').addEventListener('click', () => dom.intakeNotice.close());
    dom.intakeNotice.addEventListener('close', () => { clearTimeout(state.noticeTimer); followSubmission(); });
    dom.railToggle.addEventListener('click', () => {
      const open = dom.rail.hidden;
      dom.rail.hidden = !open;
      dom.app.classList.toggle('is-rail-collapsed', !open);
      dom.railToggle.setAttribute('aria-expanded', String(open));
      dom.railToggle.setAttribute('aria-label', open ? '收起列表' : '展开列表');
      dom.railToggle.title = open ? '收起列表' : '展开列表';
    });
    dom.search.addEventListener('input', renderDocs);
    dom.list.addEventListener('click', event => {
      const button = event.target.closest('[data-review]');
      if (button) openReview(button.dataset.review);
    });
    dom.fileRows.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      const {intakeStart, intakeReview, intakeSecret, delete: remove} = button.dataset;
      if (intakeStart) {
        state.followReview = '';
        openDialog({fileId: intakeStart});
      } else if (intakeReview) {
        const review = state.history.find(item => item.reviewId === intakeReview);
        openReview(intakeReview, review?.status !== 'running');
      } else if (intakeSecret) {
        openSecret(intakeSecret);
      } else if (remove) {
        askDelete(remove);
      }
    });
    dom.guard.addEventListener('click', event => {
      if (event.target.closest('[data-guard-detail]') && state.session) openSecret(state.session.id);
    });
    dom.run.addEventListener('click', stopCheck);
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

    dom.uploadButton.addEventListener('click', upload);
    dom.file.addEventListener('change', onFile);
    dom.root.querySelector('[data-download]').addEventListener('click', () => {
      const record = activeRecord();
      if (!record || isBlocked(record)) return;
      const text = record.originalText ?? record.text;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${record.name || '校对文档'}-原文.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

    const confirmOptions = dom.dialog.querySelector('[data-confirm]');
    dom.dialog.addEventListener('change', () => {
      confirmOptions.disabled = !dom.dialog.querySelector('input:checked');
    });
    dom.dialog.querySelector('[data-cancel]').addEventListener('click', () => { state.rangeTarget = null; dom.dialog.close(); });
    dom.dialog.addEventListener('cancel', () => { state.rangeTarget = null; });
    confirmOptions.addEventListener('click', () => {
      const reviewTypes = Array.from(dom.dialog.querySelectorAll('input:checked'), input => input.value);
      dom.dialog.close();
      startCheck(reviewTypes);
    });

    dom.confirmDelete.querySelector('[data-delete-cancel]').addEventListener('click', () => {
      state.removeId = '';
      dom.confirmDelete.close();
    });
    dom.confirmDelete.querySelector('[data-delete-ok]').addEventListener('click', removeFile);
    dom.confirmDelete.addEventListener('cancel', () => { state.removeId = ''; });

    dom.secret.addEventListener('close', followSubmission);
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
    });
  }

  function render(target, onDirty = () => {}) {
    state.onDirty = onDirty;
    build(target);
    bind();
    clearInterval(state.timer);
    clearTimeout(state.noticeTimer);
    state.rangeTarget = null;
    state.resultOnly = false;
    state.followReview = '';
    state.selection = null;
    state.foreground = true;
    showScreen('files');
    const now = Date.now();
    const records = [
      ['项目周会纪要', SAMPLE, 'passed'],
      ['船舶设备维护简报', '截止目前，设备按装和调试已完成，，请各班组核对维护记录。', 'passed'],
      ['试验计划草稿', '演示材料：下周拟召开型号研制协调会议。', 'submitted'],
      ['资料移交清单', '演示材料：内部资料移交前请核对目录。', 'hit'],
      ['海试记录摘要', '海试期间按计划完成各项检侧，待复核后归档。', 'passed'],
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
      target.dataset.autosaved = 'true';
      sync(store.advance(scanSecret, detect));
      renderAll();
      state.timer = setInterval(tick, 400);
    } catch (error) { hint(error.message || '无法读取审校数据，请检查浏览器存储空间。'); }
  }

  function deactivate() {
    state.foreground = false;
    state.followReview = '';
    state.rangeTarget = null;
    clearTimeout(state.noticeTimer);
    dom?.intakeNotice.close();
    dom?.secret.close();
    dom?.dialog.close();
    dom?.confirmDelete.close();
  }

  function resume() {
    state.foreground = true;
    tick(true);
  }

  window.addEventListener?.('storage', event => { if (event.key === store?.KEY) tick(); });
  window.BaigeProofreadTool = { render, resume, deactivate, detect, scanSecret, SAMPLE, SECRET_META };
})();
