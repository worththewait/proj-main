## Git / worktree 规则
- Codex 只在 proj-codex 工作；DSH 只在 proj-dsh 工作。不要切换、删除、重命名 worktree。
- 不要直接改 main；只在自己的 agent/* 分支提交。
- 开工先 `git status`；结束必须 commit + push，不要留未提交改动。
- 了解变更先 `git log --oneline`、`git diff --stat`，再按文件看 diff；不要全库通读。
- 不要执行 `git reset --hard`、`git clean -fd`、`git worktree remove`。