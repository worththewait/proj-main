# 功能与数据权限申请

## 定位与入口

- 普通平台演示账号在个人中心「权限申请」管理自己的功能和数据申请，入口由 `src/account.js` 打开 `BaigePermissionCenter`。默认显示「我的申请」。首页「了解平台功能」点击缺权项时由 `src/home-access.js` 提示，外壳内可转入申请表并预选目标。表单真正提交才产生申请。独立首页没有可用接入时仅保存当前页面内存中的模拟待审提示。
- 后台管理员从 `admin.html#access` 进入 `pages/permission-review.html` 的「权限审核」。当前工作流以申请人为单位、以功能／知识库项逐项裁决；三元的用户角色、角色菜单与状态整单审核见 [角色授权审核](iam-approval.md)。百舸文库逐文档授权属于独立业务。
- 切换到 IAM 客户端账号或权限预览模式时，使用其正式角色权限。个人权限申请入口随角色账号关闭，缺权提示引导理解当前账号角色权限。两种账号的权限判定见 [访问控制](access-control.md)。

## 申请端

- 「当前人员」可切换预设演示人员，按账号邮件查看各自申请和批准项。选中人员存 `baige.permission.viewer`，切换时清理当前草稿、筛选和详情，返回对应人员的记录。这里切换的是申请人视角。平台客户端实际路由检查仍用外壳当前账号邮件。
- 功能列表使用 `BaigeFeatureConfig.catalog()` 的首页分类、功能名、图标和描述。未开通且未待审功能可勾选、多选和全选，标记「已开通」「审核中」的项在 UI 禁用。已开通标记依据当前申请人的已批准记录。平台基础导航权限与申请表可申请范围独立计算。
- 新的数据权限申请只列 `BaigeData.knowledgeDirectory.departmentGroups` 下的部门知识库，按部门分组，可与功能混合提交。历史示例可含企业或行业库，详情按记录内容显示。至少选一项功能或数据，并填写非空申请事由，UI 最长 500 字。成功后清理勾选和理由，进入我的申请。
- 我的申请按当前申请人邮件过滤、时间倒序。状态筛选为全部、待审核、已通过、部分通过、已驳回，并展示数量。申请卡可查看编号、时间、事由、各项结果和审核意见，功能和数据分组，数据额外按范围分组。功能审批通过后按对应账号开通客户端入口。

## 审核端与规则

- 列表默认每页 10 条，可按申请人姓名／邮件、状态、申请项名称筛选和重置。表格展示申请编号、申请人、申请项摘要、时间、状态、意见、操作。「待审核」打开可编辑审核弹窗，其他状态打开只读结果。
- 弹窗展示申请信息、申请事由以及功能组和数据组。每项可选择通过或驳回，支持整单全部通过／驳回，也支持按数据子组批量填写，显示通过数。UI 要求每项均填写结果，并填写审核意见（通过与驳回都需要），意见最长 500 字。
- `src/permission-store.js` 的 `statusOf` 按项汇总，全过 `approved`、全拒 `rejected`、没有已处置项 `pending`、其余 `partial`。常规 UI 下 `partial` 表示同一单既有通过也有驳回。原型 `review` 存储接口接受只给部分项的 decisions，现有 UI 只对 `pending` 提供编辑，`hasPending` 同时检查整单为 `pending`。保留这些差别，排查旧存量时核对单项和整单两级状态。
- 功能项键 `f:<route>:<child>`，批准的功能项按申请人邮件与精确 `route:child` 重建本地授权索引。数据项使用 `d:<kbId>`。知识库项的批准记录展示审批结果，授权索引仅写功能项，未接知识库或文库资源权限执行。普通后台审核页使用演示管理员处理，没有 IAM 的角色审核回避与整单授权规则。

## 持久化与代码定位

- `src/permission-store.js` 的 `baige.permission.requests.v1` 持久化申请，读不到存量时初始化四条演示记录。`baige.permission.grants.v1` 是按批准功能项生成的派生索引。编号 `AP` + 当日 `YYYYMMDD` + 三位序号。表单检查空申请人／空项／空事由，页面过滤重复选项。订阅、storage 事件和 `baige:permission-store` 更新前后台状态。
- 修改定位 `src/permission-center.js`、`permission-center.css`、`src/home-access.js`、`pages/permission-review.html`、`src/pages/permission-review.js`、`permission-review.css`。测试 `tests/permission-flow.test.cjs` 涵盖种子、本地持久化、逐项授予和部分通过、人员视角隔离、平台连线。路由保护见 `tests/sidebar-permissions.test.cjs`。运行与授权为浏览器原型演示。
