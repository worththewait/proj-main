(() => {
"use strict";
const tools = [
 {name:"文档翻译",group:"文档处理",icon:"translate",description:"翻译完整文档，保留原文结构与专业表达。"},
 {name:"文本翻译",group:"文档处理",icon:"translate",description:"处理中外文段落，理解跨语言资料。"},
 {name:"OCR识别",group:"文档处理",icon:"scan",description:"将图片、扫描件中的文字转为可编辑内容。"},
 {name:"纠错校对",group:"文档处理",icon:"check",description:"检查错别字、语病与标点，完善文本表达。"},
 {name:"提示词生成",group:"写作创作",icon:"chat",description:"明确任务、角色与要求，组织有效的提示词。"},
 {name:"公文写作",group:"写作创作",icon:"file",description:"规范公文结构与措辞，辅助起草日常材料。"},
 {name:"PPT生成",group:"写作创作",icon:"slides",description:"将主题与提纲整理为逻辑清晰的演示文稿。"},
 {name:"文献伴读",group:"研究辅助",icon:"book",description:"梳理文献重点，理解研究方法与核心结论。"},
 {name:"思维导图生成",group:"研究辅助",icon:"branch",description:"展开主题与关联，让研究思路形成清晰结构。"},
 {name:"标准编制",group:"研究辅助",icon:"standard",description:"辅助整理标准结构、编制内容与条款。"},
 {name:"专利编制",group:"研究辅助",icon:"file",description:"辅助梳理专利技术方案与申请材料，形成编制思路。"}
];
const navigation = [
 {id:"home",file:"pages/home.html?v=20261028-unpublish-status",label:"首页",icon:"home"},
 {id:"qa",file:"pages/qa.html?v=20261026-xd",label:"百舸问答",icon:"chat",children:["对话","智能问数"]},
 {id:"knowledge",file:"pages/knowledge.html",label:"知识库",icon:"book"},
 {id:"writing",file:"pages/writing.html",label:"百舸写作",icon:"pen"},
 {id:"library",file:"pages/library.html",label:"百舸文库",icon:"file",children:["文库首页"],subnav:false,autoChild:false},
 {id:"intel",file:"pages/intel.html?v=20261030-early-date",label:"百舸情报",icon:"globe"},
 {id:"analysis",file:"pages/analysis.html",label:"百舸分析",icon:"chart"},
 {id:"smart-tools",file:"pages/smart-tools.html",label:"智能工具",icon:"grid"},
 {id:"frontier",file:"pages/frontier.html",label:"前沿工具",icon:"compass",children:["全球鹰","智研通"]},
 {id:"digital",file:"pages/digital.html",label:"数智系统",icon:"layers",children:["标准编制","专利编制"],files:{"标准编制":"pages/digital-standard.html","专利编制":"pages/digital-patent.html"}},
 {id:"datasets",file:"pages/datasets.html",label:"高质量数据集",icon:"database",subnav:false,autoChild:false,children:["船海产业数据集","船舶领域标准数据集","船舶行业质量数据集","船舶行业科技成果数据","船舶行业科技文献数据","船舶行业文化传播数据","船舶行业教育培训数据","船舶行业试验测试数据"]},
 {id:"platform",file:"pages/platform.html",label:"智能开发平台",icon:"code"},
 {id:"data-platform",file:"pages/data-platform.html",label:"数据平台",icon:"server",children:["数据标注平台","爬虫平台","数据中台"]},
 {id:"home-settings",file:"pages/home-settings.html?v=20261027-management",label:"自定义首页",icon:"panel",adminOnly:true}
];
const knowledgeScopes = ["全部","部门知识库","行业知识库","个人知识库","企业知识库"];
// Demonstration entries for the knowledge picker; no real documents are connected.
const knowledgeBases = [
 {id:"industry-ship",name:"船舶行业知识库",scope:"行业",description:"船海产业、行业发展与专业术语"},
 {id:"industry-standard",name:"船舶标准知识库",scope:"行业",description:"船舶领域标准与规范资料"},
 {id:"industry-green",name:"绿色船舶研究资料",scope:"行业",description:"绿色能源、节能减排与智能航运"},
 {id:"enterprise-qa",name:"企业问答知识库",scope:"企业",description:"企业常见问题与业务知识"},
 {id:"enterprise-writing",name:"写作素材知识库",scope:"企业",description:"常用材料、写作规范与参考内容"},
 {id:"enterprise-policy",name:"企业制度知识库",scope:"企业",description:"管理制度、工作规范与办事流程"},
 {id:"department-research",name:"部门研究资料库",scope:"部门",description:"部门研究成果与专题资料"},
 {id:"department-project",name:"项目资料知识库",scope:"部门",description:"项目文档、阶段成果与工作记录"}
];
const findNavItem = id => navigation.find(item=>item.id===id);
// Prototype permissions only. A denied parent also denies its children.
const permissions = {
 routes: {},
 children: {
  qa: {"智能问数": false},
  frontier: {"智研通": false},
  "smart-tools": {"标准编制": false}
 }
};
const childNames = id => id === "smart-tools" ? tools.map(tool => tool.name) : (findNavItem(id)?.children || []);
function canOpen(id, child = "") {
 if (!findNavItem(id) || permissions.routes[id] === false) return false;
 const names = childNames(id);
 if (child) return names.includes(child) && permissions.children[id]?.[child] !== false;
 return names.length ? names.some(name => canOpen(id, name)) : true;
}
function accessSummary(id) {
 const names = childNames(id);
 const granted = names.filter(name => canOpen(id, name)).length;
 return { total: names.length, granted,
  label: !granted ? "暂未开通" : granted === names.length ? "全部已开通" : `已开通 ${granted}/${names.length}` };
}
window.BaigeData = Object.freeze({navigation,tools,knowledgeScopes,knowledgeBases,findNavItem});
window.BaigePermissions = Object.freeze({canOpen, childNames, summary: accessSummary});
})();
