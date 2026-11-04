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

  /* 与百舸文库后台一致的四档审查状态。 */
  const SECRET_META = {
    detecting: { label: '检测中', tone: 'info' },
    passed: { label: '已通过', tone: 'success' },
    hit: { label: '涉密可疑', tone: 'warning' },
    submitted: { label: '审核中', tone: 'warning' },
  };

  const REVIEW_META = {
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
  };

  let dom = null;

  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${++state.seq}`;

  function activeRecord() {
    return state.session;
  }

  function isBlocked(record) {
    return Boolean(record) && record.secretStatus !== 'passed';
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
    const haystack = `${fileName}\n${text.slice(0, SECRET_SCAN_LIMIT)}`;
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
      .filter(item => item.name.includes(keyword) || item.fileName.includes(keyword));
    if (!list.length) {
      const message = keyword ? '没有匹配的记录' : history ? '还没有审校记录' : '上传文件，通过涉密审核后即可预览';
      dom.list.innerHTML = `<li class="pr-list-empty">${message}</li>`;
      dom.end.hidden = true;
      return;
    }
    dom.list.innerHTML = list.map(item => {
      const { label, tone } = history ? REVIEW_META[item.status] : SECRET_META[item.secretStatus];
      const selected = history ? state.session?.reviewId === item.reviewId : !state.session?.reviewId && state.session?.id === item.id;
      return `<li><button type="button" class="pr-doc${selected ? ' is-active' : ''}${item.secretStatus === 'hit' ? ' is-alert' : ''}" ${history ? 'data-review' : 'data-record'}="${history ? item.reviewId : item.id}" aria-current="${selected}" title="${escape(item.name)}">
        <span class="pr-doc-icon is-upload">${icon(history ? 'history' : 'file')}</span>
        <span class="pr-doc-body"><span class="pr-doc-name">${escape(item.name)}</span>
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
    dom.search.placeholder = state.view === 'files' ? '搜索文件名' : '搜索审校记录';
    dom.search.setAttribute('aria-label', dom.search.placeholder);
  }

  /* ---------- 渲染：文档区与拦截态 ---------- */
  function renderPage() {
    if (!dom) return;
    const record = activeRecord();
    if (!record) {
      dom.page.textContent = '';
      dom.docName.textContent = '请选择已通过涉密审核的文件';
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
      dom.guard.hidden = true;
      const text = record.text;
      if (!state.issues.length) {
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
    dom.run.textContent = running ? '停止审校' : record?.reviewId ? '重新审校' : '开始审校';
    dom.run.disabled = !record || isBlocked(record);
    dom.download.disabled = !record || isBlocked(record);
    dom.resultFile.textContent = record
      ? `${REVIEW_META[state.status]?.label || '待审校'} · ${record.name}`
      : '选择审校记录或已通过审核的文件';
    dom.resultFile.title = dom.resultFile.textContent;

    const pending = state.issues.filter((issue) => !state.ignored.has(issue.id) && !state.accepted.has(issue.id));
    const hasIssues = state.issues.length > 0;
    dom.summary.hidden = !hasIssues;
    dom.count.textContent = `共 ${state.issues.length} 个事项`;
    dom.bulk.hidden = !hasIssues || running;
    dom.bulk.querySelectorAll('button').forEach(button => { button.disabled = pending.length === 0; });

    if (running) {
      dom.groups.innerHTML = `<div class="pr-progress"><p>正在检查文档，完成后会在这里显示修改建议。</p><div class="pr-bar" role="progressbar" aria-label="审校进度" aria-valuenow="${state.progress}"><span style="width:${state.progress}%"></span></div><p>已完成 ${state.progress}%</p></div>`;
      return;
    }
    if (isBlocked(record)) {
      const copy = record.secretStatus === 'detecting' ? '涉密检测中，暂不能审校' : record.secretStatus === 'submitted' ? '等待管理员审核，暂不能审校' : '文档未通过涉密检测，暂不能审校';
      dom.groups.innerHTML = `<div class="pr-empty">${icon('shield')}<p>${copy}</p></div>`;
      return;
    }
    if (!hasIssues) {
      const messages = {
        idle: record ? '确认文档原文后，点击「开始审校」选择审校范围。' : '选择审校记录查看结果，或从「文件选择」预览原文。',
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
    const meta = SECRET_META[record.secretStatus] || SECRET_META.detecting;
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
      rows.push(`<li class="is-doing"><i aria-hidden="true"></i><div><p>已提交管理员审核</p><span>审核通过后可预览并开始审校</span></div></li>`);
    } else if (record.secretStatus === 'passed') {
      rows.push(`<li class="is-done"><i aria-hidden="true"></i><div><p>允许预览与审校</p><span>可打开文档查看原文</span></div></li>`);
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
    return `<button type="button" class="is-ghost" data-secret-close>关闭</button><button type="button" class="is-primary" data-secret-open>预览原文</button>`;
  }

  /* ---------- 行为 ---------- */
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
    dom.search.value = '';
    renderRail();
    renderDocs();
  }

  function openDoc(id) {
    const record = state.records.find(item => item.id === id);
    if (!record || state.status === 'running') {
      if (record) hint('请等待当前审校完成，或先停止审校。');
      return;
    }
    if (isBlocked(record)) {
      if (record.secretStatus === 'detecting') hint('文档正在检测涉密内容，请稍候。');
      else openSecret(id);
      return;
    }
    state.session = {...record, reviewTypes: TYPES.slice()};
    state.issues = [];
    state.ignored = new Set();
    state.accepted = new Set();
    state.status = 'idle';
    renderAll();
  }

  function openReview(id) {
    if (state.session?.reviewId === id) return;
    if (state.status === 'running') {
      hint('请等待当前审校完成，或先停止审校。');
      return;
    }
    const review = state.history.find(item => item.reviewId === id);
    if (!review) return;
    state.session = {...review};
    state.issues = review.issues.slice();
    state.ignored = new Set(review.ignored);
    state.accepted = new Set(review.accepted);
    state.status = review.status;
    renderAll();
  }

  function saveReview() {
    const record = state.session;
    if (!record?.reviewId) return;
    const review = {...record, status: state.status, issues: state.issues.slice(), ignored: [...state.ignored], accepted: [...state.accepted]};
    const index = state.history.findIndex(item => item.reviewId === review.reviewId);
    if (index < 0) state.history.unshift(review);
    else state.history[index] = review;
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
      switchView('files');

      setTimeout(() => {
        const keywords = scanSecret(file.name, text);
        record.keywords = keywords;
        record.reviewedAt = Date.now();
        record.secretStatus = keywords.length ? 'hit' : 'passed';
        if (!state.records.includes(record)) return;
        if (record.secretStatus === 'passed') {
          hint('涉密检测通过，点击列表中的文件预览原文。');
          renderAll();
        } else {
          renderDocs();
          if (!dom.secret.open && state.view === 'files') openSecret(record.id);
        }
      }, 1400);
    };
    reader.onerror = () => hint('文件读取失败，请重新上传。');
    reader.readAsText(file, 'utf-8');
  }

  function startCheck(reviewTypes = state.session?.reviewTypes) {
    if (state.status === 'running' || !reviewTypes?.length) return;
    const current = activeRecord();
    const source = state.records.find(item => item.id === current?.id);
    if (source?.secretStatus !== 'passed') {
      hint('当前文档未通过涉密检测，暂不能审校。');
      return;
    }
    const record = {
      ...source,
      text: current.text,
      reviewId: uid('review'),
      checkedAt: Date.now(),
      reviewTypes: reviewTypes.slice(),
    };
    state.session = record;
    state.issues = [];
    state.ignored = new Set();
    state.accepted = new Set();
    state.progress = 0;
    state.status = 'running';
    saveReview();
    state.view = 'history';
    dom.search.value = '';
    renderAll();
    state.timer = setInterval(() => {
      state.progress = Math.min(100, state.progress + 8);
      if (state.progress < 100) {
        renderResult();
        return;
      }
      try {
        state.issues = detect(record.text, record.reviewTypes);
      } catch (error) {
        console.error('审校失败', error);
        finishCheck('failed');
        return;
      }
      finishCheck('done');
    }, 130);
  }

  function finishCheck(status) {
    stopTimer();
    state.status = status;
    dom.status.textContent = '';
    saveReview();
    renderAll();
  }

  function stopCheck() {
    if (state.status === 'running') finishCheck('stopped');
  }

  function openDialog() {
    dom.dialog.querySelectorAll('input').forEach(input => {
      input.checked = state.session.reviewTypes.includes(input.value);
    });
    dom.dialog.querySelector('[data-confirm]').disabled = false;
    dom.dialog.showModal();
  }

  function applySuggestion(id) {
    const issue = state.issues.find(item => item.id === id);
    if (!issue || state.accepted.has(id) || state.ignored.has(id)) return;
    const record = activeRecord();
    const lengthChange = issue.suggestion.length - (issue.end - issue.start);
    record.text = record.text.slice(0, issue.start) + issue.suggestion + record.text.slice(issue.end);
    state.accepted.add(id);
    state.issues = state.issues.map(item => item.start >= issue.end
      ? {...item, start: item.start + lengthChange, end: item.end + lengthChange}
      : item);
  }

  function refreshReview() {
    renderPage();
    renderResult();
    saveReview();
  }

  function acceptIssue(id) {
    if (state.status !== 'done') return;
    applySuggestion(id);
    refreshReview();
  }

  function ignoreIssue(id) {
    if (state.status !== 'done' || state.accepted.has(id)) return;
    state.ignored.add(id);
    refreshReview();
  }

  function acceptAll() {
    if (state.status !== 'done') return;
    state.issues.forEach(issue => applySuggestion(issue.id));
    refreshReview();
  }

  function ignoreAll() {
    if (state.status !== 'done') return;
    state.issues.forEach(issue => {
      if (!state.accepted.has(issue.id)) state.ignored.add(issue.id);
    });
    refreshReview();
  }

  function submitAudit(id) {
    const record = state.records.find((item) => item.id === id);
    if (record?.secretStatus !== 'hit') return;
    record.secretStatus = 'submitted';
    dom.secret.close();
    renderAll();
    hint('已提交至百舸文库审核中心，审核通过后可预览。');
  }

  function approveAudit(id) {
    const record = state.records.find((item) => item.id === id);
    if (record?.secretStatus !== 'submitted') return;
    record.secretStatus = 'passed';
    record.auditedAt = Date.now();
    dom.secret.close();
    renderAll();
    hint('管理员已审核通过，点击列表中的文件预览原文。');
  }

  function cancelUpload(id) {
    const index = state.records.findIndex((item) => item.id === id);
    if (index < 0) return;
    state.records.splice(index, 1);
    dom.secret.close();
    renderAll();
    hint('已取消上传，文件未进入校审。');
  }

  function build(root) {
    root.classList.add('proofread-workspace');
    root.innerHTML = `
      <div class="pr-app">
        <aside class="pr-rail" id="proofreadRail" aria-label="审校记录与文件">
          <div class="pr-brand">
            <span class="pr-logo" aria-hidden="true">${icon('check')}</span>
            <div><h2>审校助手</h2><p>纠错校对</p></div>
          </div>

          <div class="pr-switch" role="tablist" aria-label="文档视图">
            <button class="pr-switch-btn" type="button" role="tab" data-view="history" aria-selected="true">${icon('history')}<span>审校记录</span></button>
            <button class="pr-switch-btn" type="button" role="tab" data-view="files" aria-selected="false">${icon('folder')}<span>文件选择</span></button>
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
            <div class="pr-document-heading"><h2>文档预览</h2><span class="pr-doc-name" data-doc-name>未选择文档</span></div>
            <div class="pr-doc-actions">
              <button class="pr-doc-action" type="button" data-download><span aria-hidden="true">↓</span><span>下载</span></button>
            </div>
          </header>
          <div class="pr-canvas">
            <div class="pr-page" data-doc role="region" aria-label="文档正文" tabindex="0"></div>
            <div class="pr-guard" data-guard hidden></div>
          </div>
          <footer class="pr-status">
            <span data-char>字数统计 0</span>
          </footer>
        </section>

        <aside class="pr-result" aria-label="审校结果">
          <header class="pr-result-head">
            <div><h2>审校结果</h2><span data-result-file>选择审校记录或已通过审核的文件</span></div>
            <div class="pr-result-actions">
              <button class="pr-run" type="button" data-run>开始审校</button>
            </div>
          </header>
          <p class="pr-inline-status" data-status role="status"></p>
          <div class="pr-summary" data-summary hidden>
            <span data-count>共 0 个事项</span>
            <div class="pr-bulk" data-bulk hidden><button type="button" data-accept-all>全部采纳</button><button type="button" data-ignore-all>全部忽略</button></div>
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
      guard: root.querySelector('[data-guard]'),
      docName: root.querySelector('[data-doc-name]'),
      switchRoot: root.querySelector('.pr-switch'),
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
      secret: root.querySelector('[data-secret]'),
      secretTitle: root.querySelector('[data-secret-title]'),
      secretBody: root.querySelector('[data-secret-body]'),
      secretFoot: root.querySelector('[data-secret-foot]'),
      file: root.querySelector('[data-file]'),
    };
  }

  function bind() {
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
      const blob = new Blob([record.text], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${record.name || '审校文档'}.txt`;
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
        if (record) openDoc(record.id);
      }
    });
  }

  function render(target) {
    build(target);
    bind();
    stopTimer();
    const now = Date.now();
    state.records = [
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
        source: 'upload', keywords: scanSecret(fileName, text),
      };
    });
    state.history = [
      [state.records[0], SAMPLE, 30],
      [state.records[1], state.records[1].text, 65],
      [state.records[0], '请各部门严各核对会仪材料，确宝记录完整。', 120],
    ].map(([record, text, minutesAgo]) => ({
      ...record, text, reviewId: uid('review'), checkedAt: now - minutesAgo * 60000,
      status: 'done', reviewTypes: TYPES.slice(), issues: detect(text), ignored: [], accepted: [],
    }));
    state.session = null;
    state.view = 'history';
    state.status = 'idle';
    state.issues = [];
    state.ignored = new Set();
    state.accepted = new Set();
    openReview(state.history[0].reviewId);
  }

  window.BaigeProofreadTool = { render, detect, scanSecret, SAMPLE, SECRET_META };
})();
