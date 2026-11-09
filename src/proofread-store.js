(() => {
  'use strict';

  const KEY = 'baige.proofread.v1';
  const TYPES = ['错别字', '标点', '语法'];
  const DETECT_MS = 2600;
  const REVIEW_MS = 3000;
  const FILE_EXTENSION = /\.(txt|md|pdf|docx?|xlsx?)$/i;
  const pending = ['detecting', 'hit', 'submitted', 'running'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function restoreOriginal(review) {
    if (typeof review.originalText !== 'string' || typeof review.text !== 'string' || review.text === review.originalText) return;
    // 旧记录按原文顺序存放问题，只有前方采纳的修改会移动后续位置。
    const accepted = new Set(review.accepted);
    let shift = 0;
    for (const issue of review.issues || []) {
      issue.start -= shift;
      issue.end -= shift;
      if (accepted.has(issue.id)) shift += issue.suggestion.length - (issue.end - issue.start);
    }
    review.text = review.originalText;
  }

  function documentParts(review) {
    // 所有位置以原文为准，采纳前文的修改不会移动后面的建议。
    const original = review.originalText ?? review.text ?? '';
    const accepted = new Set(review.accepted);
    const ignored = new Set(review.ignored);
    const parts = [];
    let cursor = 0;
    for (const issue of review.issues || []) {
      if (issue.start < cursor) continue;
      const applied = accepted.has(issue.id);
      parts.push({text: original.slice(cursor, issue.start)});
      parts.push({
        id: issue.id,
        text: applied ? issue.suggestion : original.slice(issue.start, issue.end),
        tone: applied ? ' is-accepted' : ignored.has(issue.id) ? ' is-ignored' : '',
      });
      cursor = issue.end;
    }
    parts.push({text: original.slice(cursor)});
    return parts;
  }

  function read(key = KEY) {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {version: 1, records: [], history: []};
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.records) || !Array.isArray(data.history)) {
      throw new Error(key === KEY ? '审校数据无法读取，请保留当前内容后重试。' : '文档核查数据无法读取，请重试。');
    }
    data.history.forEach(restoreOriginal);
    return data;
  }

  function change(action, key = KEY) {
    const data = read(key);
    const result = action(data);
    window.localStorage.setItem(key, JSON.stringify(data));
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

  // 保留旧草稿入口，新上传流程使用 submitFile。
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

  function prepareFile(document) {
    const {name = '', fileName = '', text, source} = document || {};
    if (typeof text !== 'string' || !text.trim()) throw new Error('请先输入需要审校的正文。');
    if (typeof name !== 'string' || typeof fileName !== 'string' || !['text', 'upload'].includes(source)
      || (source === 'upload' && !fileName.trim())) throw new Error('文档信息不完整，请重新提交。');
    const title = name.trim() || fileName.replace(FILE_EXTENSION, '').trim() || text.trim().split(/\r?\n/)[0].slice(0, 24);
    return {
      id: uid('doc'), name: title, fileName: fileName || `${title}.txt`, text, source,
      secretStatus: 'draft', keywords: [], version: 1, uploadedAt: Date.now(),
    };
  }

  function beginDetection(file) {
    file.secretStatus = 'detecting';
    file.detectAt = Date.now() + DETECT_MS;
  }

  function submitFile(document, key = KEY) {
    return change(data => {
      const file = prepareFile(document);
      beginDetection(file);
      data.records.unshift(file);
      return file;
    }, key);
  }

  function failFile(fileName, reason, key = KEY) {
    return change(data => {
      const file = {
        id: uid('doc'), name: fileName.replace(FILE_EXTENSION, ''), fileName,
        text: '', source: 'upload', secretStatus: 'failed', keywords: [],
        version: 1, uploadedAt: Date.now(), auditReason: reason,
      };
      data.records.unshift(file);
      return file;
    }, key);
  }

  function startReview({fileId, types, document}) {
    if (!Array.isArray(types) || !types.length || types.some(type => !TYPES.includes(type))) throw new Error('请至少选择一项审校范围。');
    const newDocument = document !== undefined;
    if (newDocument && fileId) throw new Error('请重新选择需要审校的文档。');
    return change(data => {
      const file = newDocument ? prepareFile(document) : data.records.find(item => item.id === fileId);
      if (!file || !file.text.trim()) throw new Error('请先输入需要审校的正文。');
      const existing = data.history.find(item => item.id === file.id);
      if (existing && pending.includes(existing.status)) return existing;
      if (!['draft', 'passed'].includes(file.secretStatus)) {
        throw new Error('请先完成该文档的涉密审核。');
      }
      if (existing) throw new Error('该文件已有校对记录，请在文件列表中查看。');
      if (!file.name.trim() || (!newDocument && file.secretStatus === 'draft' && file.name === '未命名审校')) {
        file.name = file.text.trim().split(/\r?\n/)[0].slice(0, 24);
      }
      file.fileName ||= `${file.name}.txt`;
      if (file.secretStatus === 'draft') beginDetection(file);
      if (newDocument) data.records.unshift(file);
      const running = file.secretStatus === 'passed';
      const review = {
        id: file.id, reviewId: uid('review'), name: file.name, fileName: file.fileName,
        version: file.version, source: file.source, originalText: file.text, text: file.text,
        secretStatus: file.secretStatus, checkedAt: Date.now(), status: running ? 'running' : 'detecting',
        startedAt: running ? Date.now() : 0, finishAt: running ? Date.now() + REVIEW_MS : 0,
        reviewTypes: types.slice(), issues: [], accepted: [], ignored: [], unread: false,
      };
      data.history.unshift(review);
      return review;
    });
  }

  function confirmResult(reviewId, decisions) {
    return change(data => {
      const review = data.history.find(item => item.reviewId === reviewId);
      if (review?.status !== 'done') throw new Error('请在校对完成后确认结果。');
      const file = data.records.find(item => item.id === review.id);
      if (file?.secretStatus !== 'passed') throw new Error('请先完成原文的涉密核查。');
      if (review.output) return review.output;

      if (decisions !== undefined) {
        const {accepted, ignored} = decisions ?? {};
        if (!Array.isArray(accepted) || !Array.isArray(ignored)) throw new Error('审校选择无效，请重新确认。');
        const ids = [...accepted, ...ignored];
        const validIds = new Set((review.issues || []).map(issue => issue.id));
        if (new Set(ids).size !== ids.length || ids.some(id => !validIds.has(id))) {
          throw new Error('审校选择无效，请重新确认。');
        }
        review.accepted = [...accepted];
        review.ignored = [...ignored];
      }

      const name = (review.name || file.name || file.fileName || '').replace(FILE_EXTENSION, '').trim() || '校对文档';
      const now = Date.now();
      const output = {
        name, fileName: `${name}.txt`, text: documentParts(review).map(part => part.text).join(''),
        source: 'result', uploadedAt: now, updated: now,
        version: review.version || file.version || 1, keywords: [],
      };
      beginDetection(output);
      review.output = output;
      return output;
    });
  }

  function completeDetection(file, scanSecret, now) {
    if (file.secretStatus !== 'detecting' || file.detectAt > now) return false;
    file.keywords = scanSecret(file.fileName, file.text);
    file.secretStatus = file.keywords.length ? 'hit' : 'passed';
    file.reviewedAt = file.detectAt;
    return true;
  }

  function advanceFileAudits(records, scanSecret, now) {
    let changed = false;
    for (const file of records) {
      if (completeDetection(file, scanSecret, now)) changed = true;
    }
    return changed;
  }

  // 演示任务以持久化的阶段时间恢复，页面关闭期间无需依赖活动计时器。
  function advance(scanSecret, detect, now = Date.now()) {
    const data = read();
    let changed = advanceFileAudits(data.records, scanSecret, now);
    for (const review of data.history) {
      if (review.output && completeDetection(review.output, scanSecret, now)) {
        review.output.updated = review.output.reviewedAt;
        changed = true;
      }
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

  function audit(id, status, reviewId = '', key = KEY) {
    return change(data => {
      const file = reviewId
        ? data.history.find(item => item.id === id && item.reviewId === reviewId)?.output
        : data.records.find(item => item.id === id);
      const allowed = file?.secretStatus === 'hit' ? ['submitted'] : file?.secretStatus === 'submitted' ? ['passed', 'rejected'] : [];
      if (!allowed.includes(status)) throw new Error('当前文档的审核状态已更新，请重新查看。');
      file.secretStatus = status;
      file.auditedAt = Date.now();
      if (reviewId) file.updated = file.auditedAt;
      if (status === 'rejected') file.auditReason = '模拟人工审核未通过，请核对文档保密范围。';
      return file;
    }, key);
  }

  function decide(reviewId, issueId, accepted) {
    return change(data => {
      const review = data.history.find(item => item.reviewId === reviewId);
      if (review?.status !== 'done') return review;
      if (review.output) throw new Error('校对结果已确认，不能再修改。');
      const issues = issueId === 'all' ? review.issues : review.issues.filter(item => item.id === issueId);
      for (const issue of issues) {
        if (review.accepted.includes(issue.id) || review.ignored.includes(issue.id)) continue;
        if (accepted) review.accepted.push(issue.id);
        else review.ignored.push(issue.id);
      }
      return review;
    });
  }

  function undoDecision(reviewId, issueId) {
    return change(data => {
      const review = data.history.find(item => item.reviewId === reviewId);
      if (review?.status !== 'done') return null;
      if (review.output) throw new Error('校对结果已确认，不能再修改。');
      const decisions = review.accepted.includes(issueId) ? review.accepted : review.ignored;
      const index = decisions.indexOf(issueId);
      if (index === -1) return null;
      decisions.splice(index, 1);
      return review;
    });
  }

  // 删除文件时连同它的审校记录一并清除，避免留下无法打开的孤儿记录。
  function remove(id, key = KEY) {
    return change(data => {
      const index = data.records.findIndex(item => item.id === id);
      if (index < 0) return null;
      const [file] = data.records.splice(index, 1);
      data.history = data.history.filter(item => item.id !== id);
      return file;
    }, key);
  }

  function markRead(id) {
    return change(data => {
      const review = data.history.find(item => item.reviewId === id);
      if (review) review.unread = false;
    });
  }

  function createFileAuditStore(key, scanSecret) {
    return Object.freeze({
      list() {
        const data = read(key);
        if (advanceFileAudits(data.records, scanSecret, Date.now())) {
          window.localStorage.setItem(key, JSON.stringify(data));
        }
        return data.records;
      },
      submitFile: document => submitFile(document, key),
      failFile: (fileName, reason) => failFile(fileName, reason, key),
      audit: (id, status) => audit(id, status, '', key),
      remove: id => remove(id, key),
    });
  }

  window.BaigeProofreadStore = Object.freeze({
    KEY, read, initialize, createDraft, saveDraft, addUpload, submitFile, failFile, startReview,
    documentParts, confirmResult, advance, stopReview, audit, decide, undoDecision, remove, markRead, REVIEW_MS,
    createFileAuditStore,
  });
})();
