#!/usr/bin/env bash
set -euo pipefail
: "${FASTAIAPI_KEY:?请设置 tumeiapi.com 魔法视频分组的 FASTAIAPI_KEY}"
command -v curl >/dev/null
command -v jq >/dev/null
BASE_URL='https://tumeiapi.com'
if [ -z "${TASK_ID:-}" ]; then
  if [ ! -e magic-video-create.json ]; then
    : > magic-video-create.json
    curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 120 \
      "$BASE_URL/v1/videos" \
      -H "Authorization: Bearer $FASTAIAPI_KEY" -H 'Content-Type: application/json' \
      -d '{"model":"sd-2-c1","input":{"prompt":"清晨的湖面，一只白色纸船缓缓漂过，镜头平稳"},"parameters":{"duration":4,"resolution":"720p","ratio":"16:9"}}' \
      --output magic-video-create.json
  fi
  TASK_ID=$(jq -er '.id // .task_id | select(type=="string" and length>0)' magic-video-create.json) || {
    echo '未取得任务 ID；请先核对控制台任务，勿自动重复提交。' >&2; exit 1;
  }
fi
printf '任务 ID：%s\n' "$TASK_ID"
deadline=$((SECONDS+7200))
while [ "$SECONDS" -lt "$deadline" ]; do
  curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 60 \
    "$BASE_URL/v1/videos/$TASK_ID" -H "Authorization: Bearer $FASTAIAPI_KEY" \
    --output magic-video-task.json
  status=$(jq -er '.status' magic-video-task.json)
  printf '状态：%s\n' "$status"
  case "$status" in
    completed)
      DOWNLOAD_URL="$BASE_URL/v1/videos/$TASK_ID/content"
      printf '视频下载 URL：%s\n' "$DOWNLOAD_URL"
      curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
        --connect-timeout 10 --max-time 180 "$DOWNLOAD_URL" \
        -H "Authorization: Bearer $FASTAIAPI_KEY" --output output.mp4.part
      mv output.mp4.part output.mp4
      echo '视频已保存：output.mp4'; exit 0;;
    failed)
      jq '{id,status,error}' magic-video-task.json >&2; exit 1;;
    queued|in_progress) sleep 20;;
    *) echo '无法识别任务状态，请保留响应和任务 ID 联系支持。' >&2; exit 1;;
  esac
done
printf '等待超时；指定 TASK_ID=%s 可继续查询，勿重复创建。\n' "$TASK_ID" >&2
exit 124
