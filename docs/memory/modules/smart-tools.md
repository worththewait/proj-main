# 智能工具目录与工作区 `smart-tools`

## 入口和默认

- 控制台「智能工具」、首页同名工具入口及 `pages/smart-tools.html`。目录常驻首个标签，初始「全部工具」、搜索词为空。热门区固定三张入口卡（OCR识别、文档翻译、思维导图生成）；大图配置只在这三个现有卡位使用。
- 默认分类和十项工具由 `BaigeData.tools` 提供。文档处理含文档翻译、文本翻译、OCR识别、纠错校对。写作创作含提示词生成、公文写作、PPT生成。研究辅助含文献伴读、思维导图生成、流程图生成。三项写作创作工具使用共用「正在集成」详情。专利编制、标准编制在数智系统。
- 分类可选后台所配的空类，结果会显示空态和清除筛选。实时搜索匹配去空格后的不区分大小写名称及描述，与当前分类叠加，分组渲染，显示命中数及当前账号工具总数。被删除的选中分类回到「全部工具」。

## 配置、权限与标签

- `BaigeFeatureConfig` 的 `tool:<工具名>` 提供描述、工具分类、目录卡图标和热门配图。目录与首页复用功能图标配置，标签和「已打开」列表使用与侧栏一致的线性图标，文档翻译与文本翻译使用不同图标。配置订阅只更新有关节点，已打开工具的场景状态保留。[界面管理](interface-management.md)
- 角色预览通过 `BaigePage` activation 的 `allowedChildren` 驱动。不可用入口从常规结果和热门区移除，剥夺访问时清理已开标签，访问不可用子页时工作区回目录。
- `BaigeToolWorkspace` 以工具名缓存已挂载的 DOM，保存每页滚动位置与焦点。切标签和离开回到智能工具会话时保留各页状态；工具可通过 `deactivate/resume` 关闭弹窗、暂停提示和恢复业务状态。目录标签不可关闭，关闭当前工具回前一个已开标签或目录。右侧「已打开」可直接跳转，Esc／点击外侧收起。左右方向、Home／End 导航，Delete 关闭当前工具标签。工具自己可汇报 dirty，关闭和页面刷新提示未保存内容。
- 标签缓存存在当前 iframe 会话。跨刷新功能记录各自决定持久化。白色背景、细缝和卡面圆角以项目视觉基线为准，各业务保留自己的信息分区。

## 代码和验收

- `pages/smart-tools.html`、`tools-visual.css`、`src/pages/smart-tools.js`、`src/tool-workspace.js`、`src/data.js`、`src/feature-config.js`。导航子项、首页目的地需与 `src/iam-menu-catalog.js` 的授权菜单一致。
- `tests/feature-tools.test.cjs` 覆盖角色范围及撤权、配置刷新、空分类、线性图标、占位和独立流程图保留状态。改工具接入时从首页和工具目录各打开一次，检查切换和关闭后状态以及角色限制。
- 具体交互见 [纠错校对](proofread.md)、[文档翻译](document-translation.md)、[文本翻译](text-translation.md)、[OCR 识别](ocr.md)、[文献伴读](literature.md)、[思维导图](mindmap.md)、[流程图](flowchart.md)。
