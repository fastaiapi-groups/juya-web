#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

cd "$(dirname "${BASH_SOURCE[0]}")"
no_pull=false
case "${1:-}" in
  '') ;;
  --no-pull) no_pull=true ;;
  -h|--help)
    echo '用法：./restart.sh [--no-pull]'
    echo '默认：快进拉取当前分支 → 检查配置 → 构建 → 备份 PostgreSQL → 启动并验证。'
    echo '--no-pull：用于已快进到指定版本的发布或本机调试。'
    echo '支持 ENV_FILE、COMPOSE_FILE、COMPOSE_PROJECT_NAME、DOCKER_BIN、DOCKER_COMPOSE_BIN。'
    exit 0 ;;
  *) echo "未知参数：$1" >&2; exit 2 ;;
esac
if (( $# > 1 )); then echo '一次只接受一个参数。' >&2; exit 2; fi
command -v python3 >/dev/null || { echo '需要 Python 3 初始化私有配置。' >&2; exit 1; }
mkdir .restart.lock 2>/dev/null || { echo '另一个更新正在执行；确认没有更新进程后才能移除 .restart.lock。' >&2; exit 1; }
trap 'rmdir .restart.lock 2>/dev/null || true' EXIT
trap 'echo "更新失败，未删除任何持久数据。请检查上述错误和服务状态后重试。" >&2' ERR

if ! "$no_pull"; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo '存在未提交源码改动，请先提交或保留改动；本脚本不会覆盖工作区。' >&2
    exit 1
  fi
  branch=$(git symbolic-ref --quiet --short HEAD) || { echo '不能在 detached HEAD 上自动更新。' >&2; exit 1; }
  remote=$(git config --get "branch.$branch.remote") || { echo '当前分支没有上游远端。' >&2; exit 1; }
  merge_ref=$(git config --get "branch.$branch.merge") || { echo '当前分支没有上游分支。' >&2; exit 1; }
  echo "正在快进更新 ${branch}…"
  previous_script=$(git hash-object restart.sh)
  # Git source files must remain readable to container users; keep private files under umask 077.
  (umask 022; git pull --ff-only "$remote" "$merge_ref")
  if [[ "$(git hash-object restart.sh)" != "$previous_script" ]]; then
    echo '更新脚本已变化，重新加载新入口…'
    rmdir .restart.lock
    trap - EXIT
    exec bash ./restart.sh --no-pull
  fi
fi

if [[ -n "${DOCKER_BIN:-}" ]]; then
  docker_cmd=("$DOCKER_BIN")
elif command -v docker >/dev/null; then
  docker_cmd=(docker)
elif [[ -x /xp/server/docker/docker ]]; then
  docker_cmd=(/xp/server/docker/docker)
else
  echo '没有找到 Docker。' >&2; exit 1
fi
if ! "${docker_cmd[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null && sudo -n "${docker_cmd[@]}" info >/dev/null 2>&1; then
    docker_cmd=(sudo -n "${docker_cmd[@]}")
  else
    echo 'Docker 不可用或当前账号没有访问权限。' >&2; exit 1
  fi
fi
if [[ -n "${DOCKER_COMPOSE_BIN:-}" ]]; then
  compose=("$DOCKER_COMPOSE_BIN")
elif "${docker_cmd[@]}" compose version >/dev/null 2>&1; then
  compose=("${docker_cmd[@]}" compose)
elif [[ -x /xp/server/docker/docker-compose ]]; then
  compose=(/xp/server/docker/docker-compose)
else
  echo '没有找到 Docker Compose。' >&2; exit 1
fi
# A standalone Compose binary needs the same permission prefix as Docker.
if [[ "${docker_cmd[0]}" == sudo && "${compose[0]}" != sudo ]]; then compose=(sudo -n "${compose[@]}"); fi

env_file=${ENV_FILE:-.env}
project=$(python3 scripts/configure-env.py --env-file "$env_file" --example .env.example --project-name)
env_args=(--env-file "$env_file" --example .env.example)
if "${docker_cmd[@]}" volume inspect "${project}_merchant-postgres-data" >/dev/null 2>&1; then env_args+=(--database-exists); fi
python3 scripts/configure-env.py "${env_args[@]}"
compose+=(--env-file "$env_file")
export APP_VERSION
APP_VERSION=$(git rev-parse HEAD)
"${compose[@]}" config --quiet

echo '正在构建新版本，现有服务继续运行…'
"${compose[@]}" build merchant website

mkdir -p backups
backup_dir=$(mktemp -d "backups/$(date -u +%Y%m%dT%H%M%SZ)-${APP_VERSION:0:8}-XXXXXX")
cp "$env_file" "$backup_dir/environment.env"
backup_database() {
  echo '正在备份 PostgreSQL…'
  "${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$backup_dir/merchant.dump.tmp"
  mv "$backup_dir/merchant.dump.tmp" "$backup_dir/merchant.dump"
  echo "数据库备份完成：$backup_dir/merchant.dump"
}
postgres_id=$("${compose[@]}" ps -q postgres)
if [[ -n "$postgres_id" ]] && [[ "$("${docker_cmd[@]}" inspect -f '{{.State.Running}}' "$postgres_id")" == true ]]; then
  backup_database
fi

wait_healthy() {
  local service=$1 container state health n
  container=$("${compose[@]}" ps -q "$service")
  [[ -n "$container" ]] || { echo "$service 容器未启动。" >&2; return 1; }
  for ((n=0; n<90; n++)); do
    state=$("${docker_cmd[@]}" inspect -f '{{.State.Status}}' "$container")
    health=$("${docker_cmd[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container")
    if [[ "$state" == running && "$health" == healthy ]]; then return 0; fi
    if [[ "$state" == exited || "$state" == dead || "$health" == unhealthy ]]; then break; fi
    if (( n % 10 == 0 )); then echo "等待 $service 就绪…"; fi
    sleep 2
  done
  echo "$service 未通过健康检查。" >&2
  "${compose[@]}" logs --tail=30 "$service" >&2
  return 1
}

"${compose[@]}" up -d postgres
wait_healthy postgres
if [[ ! -f "$backup_dir/merchant.dump" ]]; then backup_database; fi
"${compose[@]}" up -d --no-deps merchant
wait_healthy merchant
# Recreate Nginx after the API is ready so its upstream resolves the new container address.
"${compose[@]}" up -d --no-deps --force-recreate website
wait_healthy website
"${compose[@]}" exec -T website wget -q -O /dev/null http://127.0.0.1/healthz
"${compose[@]}" exec -T website wget -q -O - http://127.0.0.1/api/merchant/healthz
echo
echo "更新完成：${APP_VERSION:0:12}；管理员初始凭据见 ${env_file}。"
