(() => {
  "use strict";

  const maxNodes = 24;
  const clauseSeparator = /\r\n?|\n|[。；;！？!?→⇒]|->|[，,]\s*(?=然后|接着|随后|最后|最终|再(?!次)|如果|假如|若|倘若|否则|不然|无论结果如何|不管结果如何|两种情况都)/u;
  const listPrefix = /^(?:(?:步骤\s*)?\d+(?:\.(?!\d)|[．、)）:：])|[一二三四五六七八九十]+、|[(（](?:\d+|[一二三四五六七八九十]+)[)）]|[-*•]\s+)\s*/u;
  const nextPrefix = /^(?:首先|然后|接着|随后|最后|最终|再(?!次))[，,:：\s]*/u;
  const ifPrefix = /^(?:如果|假如|若|倘若)/u;
  const conditionCue = /如果|假如|否则|不然|倘若|一旦|如遇|视情况|^若|^(?:是|否)[：:]|^(?:是则|否就|否时)/u;
  const decisionSentence = /^(?:如果|假如|若|倘若)(.+?)(?:[，,]\s*(?:那么|就|则|便)?|那么|就|则|便)\s*(.+)$/u;
  const elseSentence = /^(?:否则|不然)\s*[，,:：]?\s*(.+)$/u;
  const commonPrefix = /^(?:无论结果如何|不管结果如何|两种情况都)[，,:：\s]*/u;
  const branchHelp = "请写清两种结果，例如「如果材料齐全，就归档；否则退回补充」。";

  function parse(source) {
    if (/[|｜]/u.test(source)) {
      throw new Error("请用日常说法描述步骤和去向。 " + branchHelp);
    }
    const steps = source.split(clauseSeparator).map((part) => {
      return part.trim().replace(listPrefix, "").replace(nextPrefix, "").trim();
    }).filter(Boolean);
    if (steps.length > 1 && /^先(?!行|进|导|前|后)./u.test(steps[0])) {
      steps[0] = steps[0].replace(/^先[，,:：\s]*/u, "").trim();
    }

    const nodes = [];
    const edges = [];
    const append = (label, kind) => {
      const limit = kind === "decision" ? 24 : 40;
      if (!label) throw new Error(`请补充第 ${nodes.length + 1} 步的内容。`);
      if (Array.from(label).length > limit) {
        throw new Error(`第 ${nodes.length + 1} 步太长，请缩短到 ${limit} 个字以内。`);
      }
      nodes.push({ label, kind });
    };

    for (const [index, step] of steps.entries()) {
      if (ifPrefix.test(step)) {
        const condition = step.match(decisionSentence);
        const negative = steps[index + 1]?.match(elseSentence);
        const question = condition?.[1].trim();
        const yes = condition?.[2].trim();
        const no = negative?.[1].trim();
        if (!question || !yes || !no || /^(?:那么|就|则|便)$/u.test(yes)
          || [question, yes, no].some((part) => conditionCue.test(part))) {
          throw new Error(branchHelp);
        }
        const rest = steps.slice(index + 2);
        const firstCommon = rest.shift();
        if (firstCommon && !commonPrefix.test(firstCommon)) {
          throw new Error("如果两种结果之后都要做同一步，请写明「无论结果如何，最后登记结果」。");
        }
        const common = [firstCommon?.replace(commonPrefix, "").replace(nextPrefix, ""), ...rest].filter(Boolean);
        if (firstCommon && !common.length) throw new Error("请补充两种结果之后都要做的步骤。");
        append(`${question}？`, "decision");
        append(yes, common.length ? "step" : "end");
        append(no, common.length ? "step" : "end");
        edges.push({ from: index, to: index + 1, label: "是" }, { from: index, to: index + 2, label: "否" });
        if (common.length) {
          edges.push({ from: index + 1, to: index + 3, label: "" }, { from: index + 2, to: index + 3, label: "" });
          for (const [offset, label] of common.entries()) {
            if (conditionCue.test(label)) throw new Error("当前支持一处判断，请先生成这部分流程。");
            const last = offset === common.length - 1;
            append(label, last ? "end" : "step");
            if (!last) edges.push({ from: nodes.length - 1, to: nodes.length, label: "" });
          }
        }
        break;
      }
      if (conditionCue.test(step)) throw new Error(branchHelp);
      const last = index === steps.length - 1;
      append(step, last ? "end" : index === 0 ? "start" : "step");
      if (!last) edges.push({ from: index, to: index + 1, label: "" });
    }

    if (nodes.length < 2) throw new Error("请描述至少两个步骤，可以用「先……，再……」或把步骤分行写。");
    if (nodes.length > maxNodes) throw new Error(`一次最多生成 ${maxNodes} 个步骤。`);
    return { nodes, edges };
  }

  window.BaigeFlowchartInput = { parse };
})();
