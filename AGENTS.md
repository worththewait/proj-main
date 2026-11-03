## Git / worktree 规则
- Codex 只在 proj-codex 工作；DSH 只在 proj-dsh 工作。不要切换、删除、重命名 worktree。
- 「拉代码」= 拉本地 main 分支：把本地 main 的最新提交合并进当前工作区（`git merge main`），不拉远端、不执行 `git pull`。
- 「提交代码」默认由用户双击本地脚本执行：① 在 proj-codex 的 agent/codex 分支提交改动；② 合并本地 main 最新更新，跑测试验证通过；③ 在 main 工作树（/Volumes/Lenovo/船舶/百舸数智平台原型）快进合并通过验证的 agent/codex 提交，更新 main。
- 提交产生在当前工作树对应的 agent 分支，再合入本地 main；不要直接在 main 工作树里提交。
- 不操作远程：不 push、不 pull；main 推远端由用户手动执行。
- main 已在该目录检出，本目录（proj-codex）不要 `git checkout main`，第③步须在该目录执行。
- 开工先 `git status`；改完代码完成验证后保留未提交改动，由用户运行脚本提交。除非用户明确要求，否则不要自动 commit 或更新 main。
- 提交脚本 `提交代码.command` 及其专用测试仅本地保留，不纳入后续版本快照。
- 了解变更先 `git log --oneline`、`git diff --stat`，再按文件看 diff；不要全库通读。
- 不要执行 `git reset --hard`、`git clean -fd`、`git worktree remove`。


## 界面设计
- 新增或修改界面前先读 [DESIGN.md](DESIGN.md) 的「全站视觉基线」。以首页为基准，复用共享颜色、字体、图标与交互样式。业务色的调整遵循该规范的适用范围。
