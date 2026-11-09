(() => {
  "use strict";

  const { icon, escapeHtml } = window.BaigeUI;
  const maxSteps = 24;
  const stepSeparator = /\n|[→⇒;；]|->/u;
  const examples = {
    repair: "先接收报修申请，再安排维修，最后确认结果。",
    inspection: "先核对检验材料。如果材料齐全，就安排现场检验；否则，通知申请人补充。",
  };

  function parseSteps(source) {
    const lines = source.split(stepSeparator).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("请至少输入两个步骤，每行写一个步骤，或用 → 分隔。");
    if (lines.length > maxSteps) throw new Error(`一次最多生成 ${maxSteps} 个步骤。`);

    const edges = [];
    const nodes = lines.map((line, index) => {
      const step = index + 1;
      const fail = (message) => { throw new Error(`第 ${step} 步：${message}`); };
      const [rawLabel, ...rules] = line.split(/[|｜]/u).map((part) => part.trim());
      const prefix = rawLabel.match(/^(?:步骤\s*)?(\d+)(?:\.(?!\d)|[．、)）:：])\s*/u);
      if (prefix && Number(prefix[1]) !== step) fail(`请按顺序编号，此步应为 ${step}。`);
      const label = rawLabel.slice(prefix?.[0].length || 0).replace(/^[-*]\s+/u, "");
      if (!label) fail("请填写步骤内容。");

      const links = new Map();
      for (const rule of rules) {
        const match = rule.match(/^(是|否|下一步)\s*[:：]\s*(\d+)$/u);
        const name = match?.[1] || rule;
        if ((!match && rule !== "结束") || links.has(name)) {
          fail("请使用「是: 3 | 否: 4」、「下一步: 5」或「结束」。");
        }
        const to = match ? Number(match[2]) - 1 : null;
        if (match && (to < 0 || to >= lines.length || to === index)) {
          fail(`不能指向第 ${match[2]} 步，请填写其他有效的步骤编号。`);
        }
        links.set(name, to);
      }

      const decision = links.has("是") || links.has("否");
      const limit = decision ? 24 : 40;
      if (Array.from(label).length > limit) fail(`步骤内容请缩短到 ${limit} 个字以内。`);
      if (decision) {
        if (links.size !== 2 || !links.has("是") || !links.has("否")) {
          fail("判断步骤需要同时填写「是」和「否」的去向。");
        }
        if (links.get("是") === links.get("否")) fail("「是」和「否」请选择不同的步骤。");
        for (const name of ["是", "否"]) edges.push({ from: index, to: links.get(name), label: name });
        return { label, kind: "decision" };
      }

      if (links.size > 1) fail("「下一步」和「结束」只能选一种。");
      if (links.has("结束") || (step === lines.length && !links.has("下一步"))) return { label, kind: "end" };
      edges.push({ from: index, to: links.get("下一步") ?? step, label: "" });
      return { label, kind: index === 0 ? "start" : "step" };
    });

    const reachable = new Set([0]);
    for (const node of reachable) {
      for (const edge of edges) if (edge.from === node) reachable.add(edge.to);
    }
    const orphan = nodes.findIndex((_, index) => !reachable.has(index));
    if (orphan !== -1) throw new Error(`第 ${orphan + 1} 步：当前流程无法到达此步，请检查前一步或判断分支的去向。`);
    return { nodes, edges };
  }

  function buildSvg({ nodes, edges }) {
    // Forward links determine rows. Return links use the margins and never move a row.
    const levels = nodes.map(() => 0);
    nodes.forEach((_, index) => {
      for (const edge of edges) {
        if (edge.from === index && edge.to > index) {
          levels[edge.to] = Math.max(levels[edge.to], levels[index] + 1);
        }
      }
    });
    const rows = Array.from({ length: Math.max(...levels) + 1 }, () => []);
    nodes.forEach((node, index) => rows[levels[index]].push({ ...node, index }));
    const columnWidth = 232;
    const gutter = 28 + edges.filter(({ from, to }) => levels[to] - levels[from] !== 1).length * 9;
    const width = Math.max(498, Math.max(...rows.map((row) => row.length)) * columnWidth + gutter * 2);
    const height = (rows.length - 1) * 128 + 160;
    const positions = [];
    rows.forEach((row, level) => row.forEach((node, column) => {
      positions[node.index] = {
        ...node, level,
        x: width / 2 + (column - (row.length - 1) / 2) * columnWidth,
        y: 80 + level * 128,
        halfHeight: node.kind === "decision" ? 42 : 36,
      };
    }));

    let outerLane = 0;
    const connectors = edges.map(({ from, to, label }) => {
      const start = positions[from];
      const end = positions[to];
      const top = end.y - end.halfHeight;
      const side = label === "是" ? -1 : 1;
      const branch = Boolean(label);
      const sx = branch ? start.x + 108 * side : start.x;
      const sy = branch ? start.y : start.y + start.halfHeight;
      const turnY = start.y + (label === "是" ? 55 : 62);
      let path = `M${sx} ${sy}`;
      let textX = sx;
      let textY = sy - 15;
      if (end.level - start.level === 1) {
        const elbow = branch ? sx + 14 * side : sx;
        path += ` H${elbow} V${turnY} H${end.x} V${top}`;
        textX = elbow;
      } else {
        const rail = side === -1 ? 22 + outerLane * 9 : width - 22 - outerLane * 9;
        outerLane += 1;
        const elbow = branch ? sx + 14 * side : sx;
        path += ` H${elbow} V${turnY} H${rail} V${top - 12} H${end.x} V${top}`;
        textX = elbow;
      }
      const annotation = branch
        ? `<rect x="${textX - 12}" y="${textY - 10}" width="24" height="20" rx="5" fill="#fff" stroke="#CBD5E5"/><text x="${textX}" y="${textY}" fill="#445169" font-size="12" dominant-baseline="central">${label}</text>`
        : "";
      return `<path d="${path}" fill="none" stroke="#667795" stroke-width="1.7" stroke-linejoin="round" marker-end="url(#fc-arrow)"/>${annotation}`;
    }).join("");

    const shapes = positions.map(({ kind, label, x, y, halfHeight }) => {
      const decision = kind === "decision";
      const terminal = kind === "start" || kind === "end";
      const shape = decision
        ? `<polygon points="${x},${y - halfHeight} ${x + 108},${y} ${x},${y + halfHeight} ${x - 108},${y}" fill="#E8EFFF" stroke="#789AF8"/>`
        : `<rect x="${x - 92}" y="${y - halfHeight}" width="184" height="${2 * halfHeight}" rx="${terminal ? 24 : 10}" fill="${terminal ? "#EDF2FB" : "#FFFFFF"}" stroke="${terminal ? "#9BB2E1" : "#CBD5E5"}"/>`;
      const chars = Array.from(label);
      const perLine = decision ? 8 : 12;
      const textLines = [];
      for (let start = 0; start < chars.length; start += perLine) textLines.push(chars.slice(start, start + perLine).join(""));
      const text = textLines.map((part, index) => `<text x="${x}" y="${y + (index - (textLines.length - 1) / 2) * 16}" fill="#1D2433" font-size="14" font-weight="${decision || terminal ? 600 : 500}" dominant-baseline="central">${escapeHtml(part)}</text>`).join("");
      return `<g><title>${escapeHtml(label)}</title>${shape}${text}</g>`;
    }).join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="流程图" text-anchor="middle" font-family="system-ui, sans-serif"><defs><marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0l10 5-10 5Z" fill="#667795"/></marker></defs>${connectors}${shapes}</svg>`;
  }

  function download(blob, extension) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `流程图.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function savePng(svg, onError) {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const scale = Math.min(2, 4096 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      if (!context) { onError(); return; }
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => { if (blob) download(blob, "png"); else onError(); }, "image/png");
    };
    image.onerror = () => { URL.revokeObjectURL(url); onError(); };
    image.src = url;
  }

  const emptyPreview = `<div class="fc-empty"><span>${icon("flowchart")}</span><strong>流程图将在这里显示</strong><p>描述你的流程，或点击左侧示例试试。</p></div>`;

  function render(root, onDirty) {
    root.innerHTML = `<div class="fc-workspace">
      <form class="fc-panel fc-editor" data-fc-form>
        <header class="fc-head">
          <span class="fc-tool-icon">${icon("flowchart")}</span>
          <div><h2>流程图生成</h2><p>把流程描述变成可下载的图</p></div>
        </header>
        <div class="fc-input-label"><label for="fc-input">描述你的流程</label>
          <button class="fc-text-action" type="button" data-fc-clear hidden>清空</button></div>
        <textarea id="fc-input" data-fc-input maxlength="2400" aria-describedby="fc-input-help fc-input-error" placeholder="例如：先接收报修申请，再安排维修，最后确认结果。"></textarea>
        <p id="fc-input-help" class="fc-guide">可以写一段话，也可以逐行列出步骤。</p>
        <p id="fc-input-error" class="fc-error" data-fc-error role="alert" hidden></p>
        <footer class="fc-editor-actions">
          <button class="fc-btn fc-primary" type="submit" data-fc-generate disabled>生成流程图</button>
        </footer>
        <div class="fc-examples" aria-label="流程示例">
          <span>试个示例</span>
          <button class="fc-btn" type="button" data-fc-example="repair">设备报修</button>
          <button class="fc-btn" type="button" data-fc-example="inspection">材料核查</button>
        </div>
      </form>
      <section class="fc-panel fc-preview" aria-label="流程图预览">
        <header class="fc-head fc-preview-head">
          <div><h2>流程图预览</h2><p data-fc-status role="status">生成后可查看并下载</p></div>
          <div class="fc-preview-actions" data-fc-downloads hidden>
            <button class="fc-btn" type="button" data-fc-png aria-label="下载 PNG" disabled>${icon("download")} PNG</button>
            <button class="fc-btn" type="button" data-fc-export aria-label="下载 SVG" disabled>SVG</button>
          </div>
        </header>
        <div class="fc-stage" data-fc-stage tabindex="0" aria-label="流程图画布">${emptyPreview}</div>
      </section>
    </div>`;
    const field = (name) => root.querySelector(`[data-fc-${name}]`);
    const input = field("input");
    const stage = field("stage");
    const status = field("status");
    const error = field("error");
    let generatedSource = "";
    let generatedSvg = "";
    let summary = "";

    function setError(message = "") {
      error.textContent = message;
      error.hidden = !message;
      input.setAttribute("aria-invalid", String(Boolean(message)));
    }

    function updateControls() {
      const dirty = input.value.trim() !== generatedSource;
      field("generate").disabled = !input.value.trim() || Boolean(generatedSvg && !dirty);
      field("generate").textContent = generatedSvg ? "更新流程图" : "生成流程图";
      field("clear").hidden = !input.value;
      field("downloads").hidden = !generatedSvg;
      field("png").disabled = field("export").disabled = !generatedSvg || dirty;
      status.textContent = generatedSvg && dirty ? "描述已修改，更新后可下载" : summary || "生成后可查看并下载";
      onDirty?.(dirty);
    }

    function generate() {
      const source = input.value.trim();
      if (!source) return;
      try {
        const graph = /[|｜]/u.test(source) ? parseSteps(source) : window.BaigeFlowchartInput.parse(source);
        generatedSvg = buildSvg(graph);
        generatedSource = source;
        const decisions = graph.nodes.filter(({ kind }) => kind === "decision").length;
        summary = `${graph.nodes.length} 个步骤${decisions ? ` · ${decisions} 个判断` : ""}`;
        stage.innerHTML = generatedSvg;
        stage.scrollTo(0, 0);
        setError();
        updateControls();
      } catch (exception) {
        setError(exception.message);
        input.focus();
      }
    }

    input.addEventListener("input", () => { setError(); updateControls(); });
    field("form").addEventListener("submit", (event) => {
      event.preventDefault();
      generate();
    });
    root.querySelectorAll("[data-fc-example]").forEach((button) => button.addEventListener("click", () => {
      const text = examples[button.dataset.fcExample];
      if (input.value.trim() && input.value.trim() !== generatedSource && !window.confirm("用示例替换当前描述？")) return;
      input.value = text;
      generate();
    }));
    field("clear").addEventListener("click", () => {
      input.value = generatedSource = generatedSvg = summary = "";
      stage.innerHTML = emptyPreview;
      setError();
      updateControls();
      input.focus();
    });
    field("export").addEventListener("click", () => {
      if (generatedSvg) download(new Blob([generatedSvg], { type: "image/svg+xml;charset=utf-8" }), "svg");
    });
    field("png").addEventListener("click", () => {
      if (generatedSvg) savePng(generatedSvg, () => { status.textContent = "PNG 导出失败，请重试或下载 SVG"; });
    });
    updateControls();
  }

  // The tab owns its mounted DOM, so pausing or resuming requires no state transfer.
  window.BaigeFlowchartTool = { render, resume() {}, deactivate() {}, parseSteps, buildSvg };
})();
