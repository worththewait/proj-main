#!/bin/bash
# 双击运行：提交 agent/codex → 合并本地 main → 测试 → 快进更新 main。
# 包含当前工作区所有未被 .gitignore 忽略的改动；不访问远程仓库。
set -euo pipefail

# Finder 启动的 Terminal 也能找到常见安装位置的 Git / Node.js。
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export GIT_TERMINAL_PROMPT=0

LOCK_DIR=''
LOCK_HELD=0

finish() {
  local result=$?
  trap - EXIT
  if [[ "$LOCK_HELD" == 1 ]]; then
    rmdir "$LOCK_DIR" || true
  fi
  if [[ "$result" != 0 ]]; then
    printf '\n流程已停止，请查看上方错误。已生成的提交和冲突现场会保留。\n'
  fi
  if [[ -t 0 ]]; then
    printf '\n按回车键关闭此脚本…'
    read -r _ || true
  fi
  exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() {
  printf '\n错误：%s\n' "$*" >&2
  exit 1
}

check_branch() {
  local directory=$1 expected=$2 actual
  actual=$(git -C "$directory" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
  [[ "$actual" == "$expected" ]] || fail "$directory 必须位于 $expected 分支，当前为 ${actual:-分离 HEAD}。"
}

check_operation() {
  local directory=$1 state state_path
  for state in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply sequencer BISECT_START; do
    state_path=$(git -C "$directory" rev-parse --git-path "$state")
    if [[ "$state_path" != /* ]]; then state_path="$directory/$state_path"; fi
    [[ ! -e "$state_path" ]] || fail "$directory 存在未完成的 Git 操作（$state），请先处理后再运行。"
  done
  [[ -z "$(git -C "$directory" ls-files -u)" ]] || fail "$directory 存在未解决的冲突。"
}

check_clean() {
  local directory=$1 label=$2
  [[ -z "$(git -C "$directory" status --porcelain --untracked-files=all)" ]] || fail "$label 有未提交改动，请先处理，脚本不会覆盖。"
}

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
PROJECT_DIR=$(pwd -P)
command -v git >/dev/null || fail '未找到 Git，请先安装 Git。'
command -v node >/dev/null || fail '未找到 Node.js，请先安装 Node.js 后重试。'
[[ "$(git rev-parse --show-toplevel)" == "$PROJECT_DIR" ]] || fail '请把脚本放在 proj-codex 仓库根目录运行。'
check_branch "$PROJECT_DIR" agent/codex

# 从同一仓库的 worktree 记录定位 main，不切换当前工作树。
MAIN_DIR=''
WORKTREE_PATH=''
while IFS= read -r line; do
  case "$line" in
    'worktree '*) WORKTREE_PATH=${line#worktree } ;;
    'branch refs/heads/main') MAIN_DIR=$WORKTREE_PATH ;;
  esac
done < <(git -c core.quotePath=false worktree list --porcelain)
[[ -n "$MAIN_DIR" && -d "$MAIN_DIR" ]] || fail '未找到已检出本地 main 的工作树。'
check_branch "$MAIN_DIR" main

COMMON_DIR=$(git rev-parse --git-common-dir)
COMMON_DIR=$(cd -- "$COMMON_DIR" && pwd -P)
LOCK_DIR="$COMMON_DIR/baige-submit.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail "另一个提交流程可能正在执行（锁：${LOCK_DIR}）。若此前被强制终止，请确认没有脚本运行，再手动移除这个空锁目录。"
fi
LOCK_HELD=1

printf '\n本地提交代码\n工作区：%s\n目标 main：%s\n' "$PROJECT_DIR" "$MAIN_DIR"
printf '只处理本地分支，不执行 push / pull / fetch。\n'
check_operation "$PROJECT_DIR"
check_operation "$MAIN_DIR"
check_clean "$MAIN_DIR" 'main 工作树'
TEST_FILES=(tests/*.test.cjs)
[[ -f "${TEST_FILES[0]}" ]] || fail '未找到 tests/*.test.cjs，无法验证本次提交。'

printf '\n[1/4] 提交当前 agent/codex 的全部改动\n'
git -c core.quotePath=false status --short
if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  git add -A
  git commit -m "本地提交：$(date '+%Y-%m-%d %H:%M:%S')"
else
  printf '当前没有未提交改动，继续同步已有提交。\n'
fi
check_clean "$PROJECT_DIR" 'agent/codex 工作树'

printf '\n[2/4] 合并本地 main 最新代码\n'
if ! git -c merge.autoStash=false merge --no-edit main; then
  fail '合并 main 失败。请在 proj-codex 中处理冲突并完成合并，再重新双击脚本；main 尚未更新。'
fi
check_operation "$PROJECT_DIR"
check_clean "$PROJECT_DIR" 'agent/codex 工作树'
TESTED_HEAD=$(git rev-parse HEAD)

printf '\n[3/4] 运行全部测试\n'
# 合并可能增加测试文件，因此在合并后重新展开测试列表。
if ! node --test tests/*.test.cjs; then
  fail '测试未通过，本次不更新 main；提交已保留在 agent/codex。'
fi
git diff --check
check_branch "$PROJECT_DIR" agent/codex
check_operation "$PROJECT_DIR"
check_clean "$PROJECT_DIR" 'agent/codex 工作树'
[[ "$(git rev-parse HEAD)" == "$TESTED_HEAD" ]] || fail '测试期间分支发生变化，请重新运行以验证最新代码。'

printf '\n[4/4] 快进更新本地 main\n'
check_branch "$MAIN_DIR" main
check_operation "$MAIN_DIR"
check_clean "$MAIN_DIR" 'main 工作树'
git merge-base --is-ancestor main "$TESTED_HEAD" || fail 'main 在执行期间有新提交，请重新运行脚本合并并测试。'
git -C "$MAIN_DIR" merge --ff-only "$TESTED_HEAD"
check_clean "$MAIN_DIR" 'main 工作树'
[[ "$(git -C "$MAIN_DIR" rev-parse HEAD)" == "$TESTED_HEAD" ]] || fail 'main 在更新期间发生变化，请检查后重试。'

printf '\n已完成：agent/codex 和本地 main 已同步。\n版本：%s\n未推送远程仓库。\n' "$(git rev-parse --short "$TESTED_HEAD")"
