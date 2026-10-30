## Git / worktree 规则
- Codex 只在 proj-codex 工作；DSH 只在 proj-dsh 工作。不要切换、删除、重命名 worktree。
- 「拉代码」= 拉本地 main 分支：把本地 main 的最新提交合并进当前工作区（`git merge main`），不拉远端、不执行 `git pull`。
- 「提交代码」分三步：① 在 proj-workb 的 agent/workb 分支提交改动；② 合并本地 main 最新更新，跑测试验证通过；③ 在 main 工作树（/Volumes/Lenovo/船舶/百舸数智平台原型）执行 `git merge --ff-only agent/workb` 更新 main。
- 提交产生在 agent/workb，再合入本地 main；不要直接在 main 工作树里提交。
- 不操作远程：不 push、不 pull；main 推远端由用户手动执行。
- main 已在该目录检出，本目录（proj-workb）无法 `git checkout main`，第③步须在该目录执行。
- 开工先 `git status`；结束必须 commit，不要留未提交改动。
- 了解变更先 `git log --oneline`、`git diff --stat`，再按文件看 diff；不要全库通读。
- 不要执行 `git reset --hard`、`git clean -fd`、`git worktree remove`。