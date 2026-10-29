/* Authored demonstration material, not retrieved documents or factual research advice. */
(() => {
  "use strict";
  const documents = [
    { id: "evaluation-guide", title: "技术方案评价指南", libraryId: "industry-ship", libraryName: "船舶行业资料", pages: [
      { title: "评价前，先统一问题", sections: [
        { id: "purpose", title: "明确比较目标", text: "比较方案之前，应先明确使用场景、任务目标和边界条件。把需要解决的问题写成同一份说明，能减少因理解不同而产生的判断偏差。" },
        { id: "constraints", title: "区分必要条件与评价指标", text: "将安全、适用范围、资源条件等必要约束单独列出。未满足必要条件的方案，应先补充说明，再进入综合比较。" },
        { id: "evidence", title: "建立资料清单", text: "分别收集方案说明、验证记录、资源需求与限制条件。对于缺失的证据，应标记为待补充，避免将未知信息当作已经验证的结论。" }
      ] },
      { title: "建立共同的评价维度", sections: [
        { id: "dimensions", title: "在相同维度下比较", text: "将两种方案放到同一组评价维度中，逐项整理性能表现、实施条件、投入需求与潜在风险。每一项判断都应保留对应的资料依据，并注明尚未验证的部分。" },
        { id: "weights", title: "说明关注点与权重", text: "不同任务对各项维度的重视程度可能不同。若采用权重评分，应说明设定权重的理由，并在调整权重后观察比较结果是否发生变化。" },
        { id: "comparison", title: "先列事实，再作判断", text: "比较表中应区分资料事实、分析判断和待确认项。使用统一的单位与条件描述结果，让不同方案之间可以直接核对。" }
      ] },
      { title: "形成可追溯的结论", sections: [
        { id: "conclusion", title: "交代推荐条件", text: "比较结论应说明推荐方案适用的条件、仍然存在的不确定性，以及需要进一步验证的问题。结论与资料之间应建立清楚的对应关系。" },
        { id: "followup", title: "保留后续验证事项", text: "将影响决策但尚缺证据的问题列为后续事项，明确需要补充的材料与核对方式。随着证据更新，应同步修订比较结论。" }
      ] }
    ] },
    { id: "evidence-checklist", title: "研究资料核对清单", libraryId: "industry-standard", libraryName: "标准规范资料", pages: [
      { title: "核对资料与结论的对应关系", sections: [
        { id: "traceability", title: "让每项结论都能找到依据", text: "整理研究资料时，为关键判断记录文档名称、所在页码与引用段落。阅读者应能够沿着引用回到原文，核对上下文与适用条件。" },
        { id: "version", title: "核对版本与范围", text: "在使用资料前，检查文件版本、日期和适用范围。相似的标题并不代表相同的内容，引用时应保存所使用的具体版本。" },
        { id: "gaps", title: "单独记录缺失信息", text: "对于未找到来源、页码变化或暂时没有访问权限的资料，应明确标识状态。原文不可见时，不应展示为已经完成核对。" }
      ] },
      { title: "整理后续行动", sections: [
        { id: "actions", title: "把不确定性转化为待办", text: "将待核实的问题、需要补充的材料和下一步验证方法集中记录。后续更新时，以新的证据替换旧判断，并保留必要的修订说明。" }
      ] }
    ] }
  ];
  const citations = [
    { id: "comparison-dimensions", number: 1, documentId: "evaluation-guide", page: 2, sectionId: "dimensions", quote: "将两种方案放到同一组评价维度中，逐项整理性能表现、实施条件、投入需求与潜在风险。" },
    { id: "comparison-evidence", number: 2, documentId: "evidence-checklist", page: 1, sectionId: "traceability", quote: "为关键判断记录文档名称、所在页码与引用段落。" }
  ];
  function exampleSession() {
    return { id: "citation-example-v1", title: "如何比较两种技术方案？", example: true, createdAt: Date.now(), updatedAt: Date.now(), knowledge: true,
      selected: ["industry-ship", "industry-standard"], prompt: "", attachments: [], chatScroll: 0, reader: null,
      messages: [{ id: "example-answer", question: "如何比较两种技术方案，并保留判断依据？", libraries: ["船舶行业资料", "标准规范资料"], attachments: [], example: true,
        paragraphs: [
          { title: "先对齐目标，再比较差异", text: "先统一使用场景、任务目标与必要约束，再把两种方案放到相同的评价维度中。这样整理出的差异才便于核对。", citationId: "comparison-dimensions" },
          { title: "让结论可以回到资料中核查", text: "为关键判断保留资料来源、页码和对应段落。把资料事实、分析判断和待确认事项分开记录，阅读时可随时打开引用核对上下文。", citationId: "comparison-evidence" }
        ], citationIds: citations.map(item => item.id) }]
    };
  }
  window.BaigeConversationData = Object.freeze({ documents, citations, exampleSession,
    document: id => documents.find(item => item.id === id), citation: id => citations.find(item => item.id === id) });
})();
