(() => {
  'use strict';

  const KEY = 'baige.proofread.v1';
  const TYPES = ['错别字', '标点', '语法'];
  const DETECT_MS = 2600;
  const REVIEW_MS = 3000;
  const pending = ['detecting', 'hit', 'submitted', 'running'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function read() {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {version: 1, records: [], history: []};
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.records) || !Array.isArray(data.history)) {
      throw new Error('审校数据无法读取，请保留当前内容后重试。');
    }
    return data;
  }

  function change(action) {
    const data = read();
    const result = action(data);
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return copy(result ?? null);
  }

  function initialize(records, history) {
    if (window.localStorage.getItem(KEY)) return read();
    return change(data => {
      data.records = records;
      data.history = history;
      return data;
    });
  }

  function createDraft() {
    return change(data => {
      const draft = {
        id: uid('doc'), name: '未命名审校', fileName: '', text: '', source: 'text',
        secretStatus: 'draft', keywords: [], version: 1, uploadedAt: Date.now(),
      };
      data.records.unshift(draft);
      return draft;
    });
  }

  function saveDraft(id, name, text) {
    return change(data => {
      const draft = data.records.find(item => item.id === id);
      if (!draft || draft.secretStatus !== 'draft') throw new Error('提交后的文档已锁定。');
      Object.assign(draft, {name: name.trim() || '未命名审校', text, updated: Date.now()});
      return draft;
    });
  }

  // 上传只落在本地草稿：用户点击「开始审校」时才提交并触发涉密审核。
  function addUpload(name, text) {
    return change(data => {
      const file = {
        id: uid('doc'), name: name.replace(/\.(txt|md)$/i, ''), fileName: name,
        text, source: 'upload', secretStatus: 'draft', keywords: [], version: 1,
        uploadedAt: Date.now(),
      };
      data.records.unshift(file);
      return file;
    });
  }

  function startReview({fileId, reviewId, types}) {
    if (!types?.length || types.some(type => !TYPES.includes(type))) throw new Error('请至少选择一项审校范围。');
    return change(data => {
      const prior = reviewId && data.history.find(item => item.reviewId === reviewId);
      let file = data.records.find(item => item.id === (prior?.id || fileId));
      if (!file || !file.text.trim()) throw new Error('请先输入需要审校的正文。');
      const existing = data.history.find(item => pending.includes(item.status)
        && (item.id === file.id || (prior && item.parentReviewId === reviewId && item.originalText === prior.text)));
      if (existing) return existing;
      if (prior && prior.text !== file.text) {
        const documentId = file.documentId || file.id;
        const version = Math.max(...data.records.filter(item => (item.documentId || item.id) === documentId).map(item => item.version)) + 1;
        file = {
          ...file, id: uid('doc'), documentId, text: prior.text, version,
          parentId: file.id, secretStatus: 'draft', keywords: [], uploadedAt: Date.now(),
        };
        data.records.unshift(file);
      }
      if (!['draft', 'passed', 'detecting'].includes(file.secretStatus)) {
        throw new Error('请先完成该文档的涉密审核。');
      }
      if (!file.name.trim() || file.name === '未命名审校') file.name = file.text.trim().split('\n')[0].slice(0, 24);
      file.fileName ||= `${file.name}.txt`;
      if (file.secretStatus === 'draft') {
        file.secretStatus = 'detecting';
        file.detectAt = Date.now() + DETECT_MS;
      }
      const running = file.secretStatus === 'passed';
      const review = {
        id: file.id, reviewId: uid('review'), name: file.name, fileName: file.fileName,
        parentReviewId: reviewId || '',
        version: file.version, source: file.source, originalText: file.text, text: file.text,
        secretStatus: file.secretStatus, checkedAt: Date.now(), status: running ? 'running' : 'detecting',
        startedAt: running ? Date.now() : 0, finishAt: running ? Date.now() + REVIEW_MS : 0,
        reviewTypes: types.slice(), issues: [], accepted: [], ignored: [], unread: false,
      };
      data.history.unshift(review);
      return review;
    });
  }

  // 演示任务以持久化的阶段时间恢复，页面关闭期间无需依赖活动计时器。
  function advance(scanSecret, detect, now = Date.now()) {
    const data = read();
    let changed = false;
    for (const file of data.records) {
      if (file.secretStatus !== 'detecting' || file.detectAt > now) continue;
      file.keywords = scanSecret(file.fileName, file.text);
      file.secretStatus = file.keywords.length ? 'hit' : 'passed';
      file.reviewedAt = file.detectAt;
      changed = true;
    }
    for (const review of data.history) {
      const file = data.records.find(item => item.id === review.id);
      if (['detecting', 'hit', 'submitted'].includes(review.status) && file) {
        if (file.secretStatus !== review.secretStatus) {
          review.secretStatus = file.secretStatus;
          review.status = file.secretStatus === 'passed' ? 'running' : file.secretStatus;
          changed = true;
          if (review.status === 'running') {
            review.startedAt = file.auditedAt || file.reviewedAt;
            review.finishAt = review.startedAt + REVIEW_MS;
          }
        }
      }
      if (review.status !== 'running' || review.finishAt > now) continue;
      try {
        review.issues = detect(review.originalText, review.reviewTypes);
        review.status = 'done';
      } catch {
        review.status = 'failed';
      }
      review.finishedAt = now;
      review.unread = true;
      changed = true;
    }
    if (changed) window.localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  }

  function stopReview(id) {
    return change(data => {
      const review = data.history.find(item => item.reviewId === id);
      if (review && pending.includes(review.status)) review.status = 'stopped';
      return review;
    });
  }

  function audit(id, status) {
    return change(data => {
      const file = data.records.find(item => item.id === id);
      const allowed = file?.secretStatus === 'hit' ? ['submitted'] : file?.secretStatus === 'submitted' ? ['passed', 'rejected'] : [];
      if (!allowed.includes(status)) throw new Error('当前文档的审核状态已更新，请重新查看。');
      file.secretStatus = status;
      file.auditedAt = Date.now();
      if (status === 'rejected') file.auditReason = '模拟人工审核未通过，请核对文档保密范围。';
      return file;
    });
  }

  function decide(reviewId, issueId, accepted) {
    return change(data => {
      const review = data.history.find(item => item.reviewId === reviewId);
      if (review?.status !== 'done') return review;
      const issues = issueId === 'all' ? review.issues : review.issues.filter(item => item.id === issueId);
      for (const issue of issues) {
        if (review.accepted.includes(issue.id) || review.ignored.includes(issue.id)) continue;
        if (!accepted) { review.ignored.push(issue.id); continue; }
        const delta = issue.suggestion.length - (issue.end - issue.start);
        review.text = review.text.slice(0, issue.start) + issue.suggestion + review.text.slice(issue.end);
        review.accepted.push(issue.id);
        for (const later of review.issues) {
          if (later !== issue && later.start >= issue.end) { later.start += delta; later.end += delta; }
        }
      }
      return review;
    });
  }

  // 删除文件时连同它的审校记录一并清除，避免留下无法打开的孤儿记录。
  function remove(id) {
    return change(data => {
      const index = data.records.findIndex(item => item.id === id);
      if (index < 0) return null;
      const [file] = data.records.splice(index, 1);
      data.history = data.history.filter(item => item.id !== id);
      return file;
    });
  }

  function markRead(id) {
    return change(data => {
      const review = data.history.find(item => item.reviewId === id);
      if (review) review.unread = false;
    });
  }

  window.BaigeProofreadStore = Object.freeze({
    KEY, read, initialize, createDraft, saveDraft, addUpload, startReview,
    advance, stopReview, audit, decide, remove, markRead, REVIEW_MS,
  });
})();
