(() => {
  "use strict";
  if (window.__baigeAiBallInited) return;
  window.__baigeAiBallInited = true;

  const ENTRIES_KEY = "qb-entries";
  const POS_KEY = "qb-pos";
  const KBS_KEY = "qb-kbs";
  const MAX_ENTRIES = 6;
  const groups = [
    { id: "knowledge-research", label: "知识与研究", description: "问答、知识与专业研究", ids: ["qa", "knowledge", "writing", "library", "intel", "analysis"] },
    { id: "tools-platforms", label: "工具与平台", description: "资料处理与专业平台", ids: ["smart-tools", "frontier", "digital", "datasets", "platform", "data-platform"] },
  ];
  const profiles = {
    qa: { summary: "围绕问题展开对话，探索信息与数据。", tone: "blue" },
    knowledge: { summary: "把常用知识汇集到一个入口。", tone: "purple" },
    writing: { summary: "从主题与框架出发，组织专业表达。", tone: "purple" },
    library: { summary: "集中查阅文库资源，积累专业资料。", tone: "blue" },
    intel: { summary: "关注研究领域与行业信息。", tone: "teal" },
    analysis: { summary: "让资料分析有清晰的工作入口。", tone: "teal" },
    "smart-tools": { summary: "翻译、识别、写作与研究辅助工具。", tone: "blue" },
    frontier: { summary: "探索前沿工具与研究服务。", tone: "teal" },
    digital: { summary: "查看数智系统相关入口。", tone: "teal" },
    datasets: { summary: "船海全链条八大数据集，可直接查阅。", tone: "teal" },
    platform: { summary: "面向智能能力的开发与管理。", tone: "blue" },
    "data-platform": { summary: "汇集数据标注、采集与管理入口。", tone: "blue" },
  };
  const childProfiles = {
    qa: {
      "对话": { description: "围绕问题展开交流，辅助梳理资料与思路。", icon: "chat" },
      "智能问数": { description: "通过自然语言，提出业务数据问题。", icon: "chart" },
    },
    library: {
      "文库首页": { description: "浏览文库分类、检索文档并进入阅读器。", icon: "book" },
    },
    frontier: {
      "全球鹰": { description: "关注全球动态与行业信息的服务入口。", icon: "globe" },
      "智研通": { description: "面向专业研究的信息与服务入口。", icon: "compass" },
    },
    "data-platform": {
      "数据标注平台": { description: "面向数据标注任务的工作入口。", icon: "tag" },
      "爬虫平台": { description: "面向数据采集任务的工作入口。", icon: "bug" },
      "数据中台": { description: "集中管理与使用数据的工作入口。", icon: "server" },
    },
    digital: {
      "标准编制": { description: "辅助整理标准结构、编制内容与条款。", icon: "standard" },
      "专利编制": { description: "辅助梳理专利技术方案与申请材料，形成编制思路。", icon: "file" },
    },
  };
  const toolTone = { "文档处理": "blue", "写作创作": "purple", "研究辅助": "teal" };

  function buildDirectoryEntries() {
    const navigation = Array.isArray(window.BaigeData?.navigation) ? window.BaigeData.navigation : [];
    const tools = Array.isArray(window.BaigeData?.tools) ? window.BaigeData.tools : [];
    const canOpen = window.BaigePermissions?.canOpen || (() => true);
    const entries = groups.flatMap((group) => group.ids.flatMap((route) => {
      const item = navigation.find((entry) => entry.id === route);
      if (!item) return [];
      const profile = profiles[route] || { summary: item.label, tone: "blue" };
      const base = { route, group: group.id, tone: profile.tone, parent: item.label };
      if (route === "smart-tools") {
        return tools.map((tool) => ({
          ...base,
          child: tool.name,
          name: tool.name,
          description: tool.description,
          icon: tool.name === "提示词生成" ? "bulb" : tool.icon,
          tone: toolTone[tool.group] || "blue",
        }));
      }
      if (item.children?.length && item.subnav !== false) {
        return item.children.map((name) => ({
          ...base,
          child: name,
          name,
          description: childProfiles[route]?.[name]?.description || profile.summary,
          icon: childProfiles[route]?.[name]?.icon || item.icon,
        }));
      }
      return [{
        ...base,
        child: "",
        name: item.label,
        description: profile.summary,
        icon: item.icon,
      }];
    })).map((entry) => ({
      ...entry,
      id: `${entry.route}:${entry.child}`,
      allowed: canOpen(entry.route, entry.child),
    }));
    return entries.filter((entry) => entry.allowed);
  }

  const allEntries = buildDirectoryEntries();
  const allFeatures = new Map(allEntries.map((item) => [item.id, item]));
  const DEFAULT_ENTRIES = ["qa:对话", "smart-tools:文献伴读", "writing:", "smart-tools:文档翻译", "smart-tools:纠错校对", "smart-tools:PPT生成"];
  const LEGACY_IDS = {
    qa: "qa:对话",
    doc: "smart-tools:文献伴读",
    write: "writing:",
    trans: "smart-tools:文档翻译",
    proof: "smart-tools:纠错校对",
    ppt: "smart-tools:PPT生成",
  };

  function defaultEntries() {
    const defaults = DEFAULT_ENTRIES.filter((id) => allFeatures.has(id));
    return defaults.length ? defaults : allEntries.slice(0, MAX_ENTRIES).map((entry) => entry.id);
  }

  function normalizeEntries(list) {
    const ids = (Array.isArray(list) ? list : []).map((id) => LEGACY_IDS[id] || id);
    return [...new Set(ids)].filter((id) => allFeatures.has(id)).slice(0, MAX_ENTRIES);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function readEntries() {
    try {
      const saved = JSON.parse(localStorage.getItem(ENTRIES_KEY) || "null");
      const normalized = normalizeEntries(saved);
      if (normalized.length) return normalized;
    } catch { /* fall through */ }
    return defaultEntries();
  }

  function writeEntries(entries) {
    try { localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries)); } catch { /* file:// */ }
  }

  function readPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) return value;
    } catch { /* ignore */ }
    return null;
  }

  function writePosition(left, top) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: left, y: top })); } catch { /* file:// */ }
  }

  function svg(path, className = "") {
    return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  }

  /* ---- 悬浮球与快捷面板 ---- */
  const ball = document.createElement("button");
  ball.type = "button";
  ball.className = "qb-ball";
  ball.id = "qbBall";
  ball.setAttribute("aria-label", "AI 快捷入口");
  ball.setAttribute("aria-haspopup", "dialog");
  ball.setAttribute("aria-expanded", "false");
  ball.setAttribute("aria-controls", "qbPanel");
  ball.innerHTML = svg("M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z");
  document.body.append(ball);

  const panel = document.createElement("div");
  panel.id = "qbPanel";
  panel.className = "qb-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "AI 快捷入口");
  document.body.append(panel);

  let entries = readEntries();
  let panelOpen = false;

  function clampPosition(left, top) {
    const width = ball.offsetWidth || 52;
    const height = ball.offsetHeight || 52;
    return {
      left: Math.min(Math.max(6, left), Math.max(6, window.innerWidth - width - 6)),
      top: Math.min(Math.max(6, top), Math.max(6, window.innerHeight - height - 6)),
    };
  }

  function setBallPosition(left, top, persist = false) {
    const next = clampPosition(left, top);
    ball.style.left = `${next.left}px`;
    ball.style.top = `${next.top}px`;
    if (persist) writePosition(next.left, next.top);
  }

  function placeBall() {
    const saved = readPosition();
    if (saved) {
      setBallPosition(saved.x, saved.y);
      return;
    }
    setBallPosition(window.innerWidth - 80, window.innerHeight - 88);
  }

  function entryGraphic(entry) {
    return window.BaigeDirectoryIcons?.icon(entry.icon) || window.BaigeUI?.icon(entry.icon) || "";
  }

  function itemHtml(item) {
    return `<button class="qb-item" type="button" data-qb-item="${escapeHtml(item.id)}" data-tone="${escapeHtml(item.tone)}" aria-label="${escapeHtml(item.name)}"><span class="qb-ic">${entryGraphic(item)}</span><span>${escapeHtml(item.name)}</span></button>`;
  }

  function renderPanel() {
    const visible = allEntries.filter((entry) => entries.includes(entry.id));
    panel.innerHTML = `<div class="qb-grid">${visible.map(itemHtml).join("")}</div>${visible.length ? "" : '<div class="qb-empty">暂无可展示的快捷入口</div>'}<button class="qb-manage" type="button" id="qbManage">管理入口</button>`;
  }

  function positionPanel() {
    const ballRect = ball.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 280;
    const panelHeight = panel.offsetHeight || 220;
    let left = ballRect.left + ballRect.width / 2 - panelWidth / 2;
    left = Math.min(Math.max(8, left), window.innerWidth - panelWidth - 8);
    let top = ballRect.top - panelHeight - 12;
    if (top < 8) top = ballRect.bottom + 12;
    top = Math.min(Math.max(8, top), window.innerHeight - panelHeight - 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function setPanel(open) {
    panelOpen = Boolean(open);
    if (panelOpen) {
      renderPanel();
      panel.hidden = false;
      panel.classList.add("is-open");
      positionPanel();
    } else {
      panel.hidden = true;
      panel.classList.remove("is-open");
    }
    ball.setAttribute("aria-expanded", String(panelOpen));
  }

  function togglePanel() {
    setPanel(!panelOpen);
  }

  function closePanel() {
    setPanel(false);
  }

  function navigate(route, child = "") {
    closePanel();
    const hash = `#${route}${child ? `/${encodeURIComponent(child)}` : ""}`;
    if (window.location.hash === hash) return;
    window.location.hash = hash;
  }

  panel.addEventListener("click", (event) => {
    if (event.target.closest("#qbManage")) {
      closePanel();
      openSettings();
      return;
    }
    const item = event.target.closest("[data-qb-item]");
    if (!item) return;
    const id = item.dataset.qbItem;
    const feature = allFeatures.get(id);
    if (!feature) return;
    if (id === "qa:对话") openQuickQa();
    else navigate(feature.route, feature.child);
  });

  /* ---- 拖拽与位置记忆 ---- */
  let drag = null;
  let suppressClick = false;
  ball.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { startX: event.clientX, startY: event.clientY, left: ball.offsetLeft, top: ball.offsetTop, moved: false };
    ball.setPointerCapture?.(event.pointerId);
  });
  ball.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) <= 4) return;
    drag.moved = true;
    ball.classList.add("is-dragging");
    setBallPosition(drag.left + dx, drag.top + dy);
  });
  function endDrag() {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    ball.classList.remove("is-dragging");
    if (moved) {
      suppressClick = true;
      closePanel();
      writePosition(ball.offsetLeft, ball.offsetTop);
      window.setTimeout(() => { suppressClick = false; }, 0);
    }
  }
  ball.addEventListener("pointerup", endDrag);
  ball.addEventListener("pointercancel", endDrag);
  ball.addEventListener("click", () => {
    if (suppressClick) { suppressClick = false; return; }
    togglePanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!qa.hidden) { closeQuickQa(); return; }
    if (panelOpen) closePanel();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!panelOpen) return;
    if (panel.contains(event.target) || ball.contains(event.target)) return;
    closePanel();
  });

  window.addEventListener("resize", () => {
    setBallPosition(ball.offsetLeft, ball.offsetTop);
    if (panelOpen) positionPanel();
    positionQuickQa();
  });

  /* ---- 悬浮问答窗 ---- */
  const qa = document.createElement("section");
  qa.id = "qbQa";
  qa.className = "qb-qa";
  qa.hidden = true;
  qa.setAttribute("role", "dialog");
  qa.setAttribute("aria-label", "AI 知识问答");
  qa.innerHTML = `
    <header class="qb-qa-head">
      <span class="qb-avatar">${svg("M4 4h16v12H8l-4 4zM8 8h8v2H8z")}</span>
      <span><b>知识问答</b><small id="qbSub">基于平台知识库回答</small></span>
      <button class="qb-qa-close" type="button" id="qbQaClose" aria-label="关闭知识问答">✕</button>
    </header>
    <div class="qb-qa-stream" id="qbStream"><div class="qb-msg is-a">你好，我是知识问答助手。可以问我平台知识库中的内容，例如「船舶绿色化转型有哪些关键技术？」</div></div>
    <div class="qb-qa-input">
      <button class="qb-mode" type="button" id="qbModeGeneral">通用问答</button>
      <button class="qb-mode is-active" type="button" id="qbModeKnowledge">知识问答</button>
      <input id="qbInput" type="text" placeholder="请输入您的问题…" aria-label="输入问题" />
      <button class="qb-send" type="button" id="qbSend" aria-label="发送">${svg("M2 21l21-9L2 3v7l15 2-15 2z")}</button>
    </div>
    <div class="qb-kb" id="qbKb" hidden>
      <div class="qb-kb-head"><b>选择知识库</b><button class="qb-kb-close" type="button" id="qbKbClose" aria-label="关闭">✕</button></div>
      <div class="qb-kb-search"><input id="qbKbSearch" type="search" placeholder="搜索知识库" autocomplete="off" /></div>
      <div class="qb-kb-list" id="qbKbList"></div>
      <div class="qb-kb-foot"><button class="qb-btn" type="button" id="qbKbCancel">取消</button><button class="qb-btn is-primary" type="button" id="qbKbOk">确认</button></div>
    </div>`;
  document.body.append(qa);

  const kbGroups = (() => {
    const bases = Array.isArray(window.BaigeData?.knowledgeBases) ? window.BaigeData.knowledgeBases : [];
    if (!bases.length) {
      return [
        { label: "企业知识库", items: [{ id: "kb1", name: "test02" }, { id: "kb2", name: "test" }] },
        { label: "部门知识库", items: [{ id: "kb3", name: "研发知识库" }, { id: "kb4", name: "技术文档库" }] },
      ];
    }
    const scopeLabels = { 行业: "行业知识库", 企业: "企业知识库", 部门: "部门知识库" };
    const groups = new Map();
    bases.forEach((base) => {
      const label = scopeLabels[base.scope] || "其他知识库";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ id: base.id, name: base.name });
    });
    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  })();
  const allKnowledge = kbGroups.flatMap((group) => group.items);
  let quickMode = "knowledge";
  let selectedKbs = [];
  let draftKbs = [];
  try {
    const saved = JSON.parse(localStorage.getItem(KBS_KEY) || "null");
    selectedKbs = Array.isArray(saved) ? saved.filter((id) => allKnowledge.some((item) => item.id === id)) : [];
  } catch { selectedKbs = []; }
  if (!selectedKbs.length && allKnowledge[0]) selectedKbs = [allKnowledge[0].id];

  function selectedNames() {
    return allKnowledge.filter((item) => selectedKbs.includes(item.id)).map((item) => item.name);
  }

  function updateQuickSub() {
    const sub = qa.querySelector("#qbSub");
    if (!sub) return;
    sub.textContent = quickMode === "knowledge"
      ? (selectedKbs.length ? `基于 ${selectedKbs.length} 个知识库回答` : "点击「知识问答」选择知识库")
      : "通用模型直接回答";
  }

  function renderKbList() {
    const input = qa.querySelector("#qbKbSearch");
    const keyword = (input?.value || "").trim().toLowerCase();
    const html = kbGroups.map((group) => {
      const items = group.items.filter((item) => !keyword || item.name.toLowerCase().includes(keyword));
      if (!items.length) return "";
      return `<div class="qb-kb-group">${escapeHtml(group.label)}</div>${items.map((item) => `<label class="qb-kb-row"><input type="checkbox" data-qb-kb="${escapeHtml(item.id)}"${draftKbs.includes(item.id) ? " checked" : ""} />${svg("M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z")}<span>${escapeHtml(item.name)}</span></label>`).join("")}`;
    }).join("");
    qa.querySelector("#qbKbList").innerHTML = html || '<div class="qb-kb-empty">未找到匹配的知识库</div>';
  }

  function setKbOpen(open) {
    const popover = qa.querySelector("#qbKb");
    popover.hidden = !open;
    if (open) {
      draftKbs = selectedKbs.slice();
      const search = qa.querySelector("#qbKbSearch");
      if (search) search.value = "";
      renderKbList();
      qa.querySelector("#qbKbSearch")?.focus({ preventScroll: true });
    }
  }

  function setQuickMode(mode) {
    quickMode = mode;
    qa.querySelector("#qbModeGeneral").classList.toggle("is-active", mode === "general");
    qa.querySelector("#qbModeKnowledge").classList.toggle("is-active", mode === "knowledge");
    if (mode === "general") setKbOpen(false);
    updateQuickSub();
  }

  qa.querySelector("#qbModeGeneral").addEventListener("click", () => setQuickMode("general"));
  qa.querySelector("#qbModeKnowledge").addEventListener("click", () => {
    setQuickMode("knowledge");
    setKbOpen(qa.querySelector("#qbKb").hidden);
  });
  qa.querySelector("#qbKbClose").addEventListener("click", () => setKbOpen(false));
  qa.querySelector("#qbKbCancel").addEventListener("click", () => setKbOpen(false));
  qa.querySelector("#qbKbSearch").addEventListener("input", renderKbList);
  qa.querySelector("#qbKbList").addEventListener("change", (event) => {
    const input = event.target.closest("[data-qb-kb]");
    if (!input) return;
    const id = input.dataset.qbKb;
    if (input.checked && !draftKbs.includes(id)) draftKbs.push(id);
    if (!input.checked) draftKbs = draftKbs.filter((item) => item !== id);
  });
  qa.querySelector("#qbKbOk").addEventListener("click", () => {
    selectedKbs = draftKbs.slice();
    try { localStorage.setItem(KBS_KEY, JSON.stringify(selectedKbs)); } catch { /* file:// */ }
    setKbOpen(false);
    updateQuickSub();
  });
  qa.querySelector("#qbQaClose").addEventListener("click", closeQuickQa);

  function positionQuickQa() {
    if (qa.hidden) return;
    const width = qa.offsetWidth;
    const height = qa.offsetHeight;
    qa.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 16, window.innerWidth - width - 26))}px`;
    qa.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 16, window.innerHeight - height - 30))}px`;
    qa.style.right = "auto";
    qa.style.bottom = "auto";
  }

  function openQuickQa() {
    closePanel();
    qa.hidden = false;
    ball.style.display = "none";
    positionQuickQa();
    setQuickMode(quickMode);
    qa.querySelector("#qbInput")?.focus({ preventScroll: true });
  }

  function closeQuickQa() {
    qa.hidden = true;
    setKbOpen(false);
    ball.style.display = "";
  }

  function answerFor(question) {
    if (quickMode === "knowledge") {
      const names = selectedNames();
      if (!names.length) return "当前未选择知识库。请点击输入框左侧的「知识问答」按钮，在弹窗中勾选要检索的知识库后再提问。";
      if (/关键|数据/.test(question)) return `已在【${names.join("、")}】中检索：2026 年全球新接订单约 8,500 万载重吨，同比增长约 12%；替代燃料动力订单占比突破 40%，绿色化是新订单的确定性主线。`;
      if (/转型|绿色|技术/.test(question)) return `根据【${names.join("、")}】：船舶绿色化转型的关键技术路径包括替代燃料动力系统、能效提升、碳捕集与碳边境合规，以及船岸协同的智能运维。`;
      return `已收到您的问题「${question}」。原型演示：正式环境将在【${names.join("、")}】内做检索回答并标注引文出处。`;
    }
    if (/写作|ppt|翻译|校对/.test(question)) return "该能力在悬浮球快捷入口中提供：点击对应入口即可跳转到相应功能页面使用。";
    return `已收到您的问题「${question}」。通用问答模式由通用模型直接回答，不检索知识库。`;
  }

  function sendQuick() {
    const input = qa.querySelector("#qbInput");
    const stream = qa.querySelector("#qbStream");
    const question = (input.value || "").trim();
    if (!question) return;
    input.value = "";
    stream.insertAdjacentHTML("beforeend", `<div class="qb-msg is-q">${escapeHtml(question)}</div><div class="qb-msg is-a" id="qbTyping">正在检索知识库…</div>`);
    stream.scrollTop = stream.scrollHeight;
    window.setTimeout(() => {
      qa.querySelector("#qbTyping")?.remove();
      stream.insertAdjacentHTML("beforeend", `<div class="qb-msg is-a">${escapeHtml(answerFor(question))}</div>`);
      stream.scrollTop = stream.scrollHeight;
    }, 600);
  }
  qa.querySelector("#qbSend").addEventListener("click", sendQuick);
  qa.querySelector("#qbInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) sendQuick();
  });

  /* ---- 快捷入口设置 ---- */
  const settings = document.createElement("dialog");
  settings.className = "qb-settings";
  settings.setAttribute("aria-labelledby", "qbSettingsTitle");
  settings.innerHTML = `
    <div class="qb-settings-head"><h2 id="qbSettingsTitle">快捷入口设置</h2><button class="qb-settings-close" type="button" data-qb-settings-close aria-label="关闭">×</button></div>
    <div class="qb-settings-body">
      <p class="qb-settings-note">按首页「全部功能」的分类和图标展示，仅列出当前有权限的功能。可选 1—6 项，保存后全站生效。</p>
      <div class="qb-settings-list" id="qbSettingsList"></div>
      <p class="qb-settings-count" id="qbSettingsCount"></p>
    </div>
    <div class="qb-settings-foot"><button class="qb-btn qb-reset" type="button" id="qbSettingsReset">恢复默认</button><button class="qb-btn" type="button" data-qb-settings-close>取消</button><button class="qb-btn is-primary" type="button" id="qbSettingsSave">保存入口设置</button></div>`;
  document.body.append(settings);

  let draftOn = new Set(DEFAULT_ENTRIES);

  function settingsRow(item) {
    const checked = draftOn.has(item.id);
    const count = draftOn.size;
    const disabled = (!checked && count >= MAX_ENTRIES) || (checked && count <= 1);
    return `<label class="qb-settings-row" data-tone="${escapeHtml(item.tone)}" title="${escapeHtml(item.description)}">
      <input type="checkbox" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} data-qb-setting="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}" />
      <span class="qb-setting-ic">${entryGraphic(item)}</span>
      <span class="qb-setting-name">${escapeHtml(item.name)}</span>
    </label>`;
  }

  function renderSettings() {
    const list = settings.querySelector("#qbSettingsList");
    list.innerHTML = groups.map((group) => {
      const items = allEntries.filter((entry) => entry.group === group.id);
      if (!items.length) return "";
      return `<section class="qb-settings-group"><h3>${escapeHtml(group.label)}<span>${escapeHtml(group.description)}</span></h3><div class="qb-settings-grid">${items.map(settingsRow).join("")}</div></section>`;
    }).join("") || '<p class="qb-settings-empty">当前没有可配置的快捷入口。</p>';
    settings.querySelector("#qbSettingsCount").textContent = `已选 ${draftOn.size} / ${MAX_ENTRIES} 个快捷入口`;
  }

  function openSettings() {
    const saved = normalizeEntries(readEntries());
    draftOn = new Set(saved.length ? saved : defaultEntries());
    renderSettings();
    if (!settings.open) settings.showModal();
    settings.querySelector("#qbSettingsSave")?.focus({ preventScroll: true });
  }

  settings.addEventListener("change", (event) => {
    const input = event.target.closest("[data-qb-setting]");
    if (!input) return;
    const id = input.dataset.qbSetting;
    if (input.checked) {
      if (draftOn.size >= MAX_ENTRIES) { input.checked = false; return; }
      draftOn.add(id);
    } else {
      if (draftOn.size <= 1) { input.checked = true; return; }
      draftOn.delete(id);
    }
    renderSettings();
  });
  settings.addEventListener("click", (event) => {
    if (event.target.closest("[data-qb-settings-close]")) { settings.close(); return; }
    if (event.target.closest("#qbSettingsReset")) {
      draftOn = new Set(defaultEntries());
      renderSettings();
      return;
    }
    if (event.target.closest("#qbSettingsSave")) {
      if (draftOn.size < 1 || draftOn.size > MAX_ENTRIES) return;
      entries = allEntries.filter((entry) => draftOn.has(entry.id)).map((entry) => entry.id).slice(0, MAX_ENTRIES);
      writeEntries(entries);
      renderPanel();
      settings.close();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (qa.hidden || !qa.querySelector("#qbKb").hidden && !qa.querySelector("#qbKb").contains(event.target)) {
      if (!qa.hidden && !qa.contains(event.target)) closeQuickQa();
    }
  });

  window.BaigeAiBall = Object.freeze({ openSettings, openQuickQa, closeQuickQa });

  placeBall();
  renderPanel();
  updateQuickSub();
})();
