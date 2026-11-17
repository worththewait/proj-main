# 涉密文件列表与核查 `file-audit`

## 统一 UI 契约

- `BaigeSecretFileList` 提供 `head` 四列模板（文件名、上传时间、文档状态、操作）、可插入业务列的 `header(...extraColumns)`、`status/label/time/canView`。状态旁小眼睛看核查详情。操作列居中，使用带可访问名称的线性图标；业务提供查看、下载、删除和适当的确认。全文查看和下载以通过为前提，原件下载还需要可用文件。涉密详情仍可在审核期间打开。
- 共享布局宽屏大约 46% 文件名／20% 时间／20% 状态／14% 操作；窄区使用可横向滚动容器，保留其他列宽。文档翻译另有语言和翻译状态列。长文件名省略且保留完整悬停提示；时间常显到分钟、悬停可读秒。业务列与状态线不可用同一字段替代。
- 状态字典为 `detecting` 检测中、`passed` 已通过、`hit` 涉密可疑、`submitted` 审核中、`approved` 审核通过、`stored` 已入库、`rejected` 已驳回、`failed` 失败；`draft` 显示破折号，未知状态按失败显示。通用门禁 `canView` 接受 `passed/approved/stored`，各调用处还要核对自身的解析/翻译/确认条件。
- 统一列表用于纠错校对、思维导图、文档翻译、文献伴读、百舸写作素材和知识库个人文档。OCR 沿用专用窄列表，复用状态标签和门禁。百舸文库后台有独立列表和审批入库流程。

## 核查、读取及存储

- 共享浏览器读文 `BaigeProofreadFile.read` 支持 TXT、MD、PDF、DOC、DOCX、XLS、XLSX。PDF.js 提取已有文字层（OCR 特意走 `allowEmpty`），Word 和 Excel 从本地资源惰性加载文档库。空文、加密、损坏或无正文须给出对应失败提示；读取失败记录可由业务保留作诊断。
- 纠错的 `scanSecret(fileName, text)` 按固定演示词表同时检查文件名和正文；持久化式流程可复用 `BaigeProofreadStore.createFileAuditStore(key, scanSecret)`。通过各自 key 隔离文档，记录计划完成时间，在重新读时恢复阶段。纠错/导图内部人工通过仍用 `passed` 加 `auditedAt`，展示映射成 `approved`。翻译/OCR/伴读的前端核查状态和内存流转独立。
- 通用人工方向是疑似 → 送审 → 人工通过／驳回。OCR 的图像和无文字层 PDF 可直接等待人工。检测通过才进入后续业务，不应让解析成功或翻译成功绕过审核。校对确认的结果要独立核查，详见 [纠错校对](proofread.md)。
- `BaigeLocalFiles` 以 IndexedDB `baige-local-files` 下 `files` 保存原始 Blob/File，按模块前缀加记录 ID 建键。正文、元数据和文件原件具有各自存储语义；缓存失败按模块提示或提供明确的文本替代，不能伪造原件。异步原件读取后应重新核对记录仍在且已通过。
- 词表、审核按钮、计时器和演示角色仅用于浏览器交互演示。服务端内容检测、访问控制、真实人工审批和审计须接入后端。

## 代码和验收

`src/secret-file-list.js`、`secret-file-list.css`、`src/local-file-cache.js`、`src/proofread-{file,pdf,office,store,tool}.js`、`src/translate-audit.js`、`src/ocr-audit.js`。核对 `tests/secret-file-list.test.cjs`、`tests/proofread-{office,pdf,final-store}.test.cjs`、`tests/translate-audit.test.cjs`、`tests/mindmap-documents.test.cjs`。覆盖失败隔离、时间和长文件名、详情可达、各状态内容门禁及刷新后恢复范围。
