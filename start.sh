#!/bin/bash
# 慢慢说 · 启动脚本
# 用法：bash start.sh
# 作用：检查依赖 → 杀掉旧 node 进程 → 后台启动 server.js → 等待端口就绪 → 输出状态
# 说明：supervisord 不托管本项目（/app/supervisord.conf 为系统只读），
#       环境重置后需手动执行本脚本恢复后端。

set -e
cd "$(dirname "$0")"

PORT=3000
LOG_FILE="/tmp/manmanshuo_server.log"

echo "=== 慢慢说 · 启动脚本 ==="

# 1. 依赖检查
if [ ! -d "node_modules" ]; then
  echo "[1/5] 安装依赖中..."
  npm install --silent 2>/dev/null
else
  echo "[1/5] 依赖已就绪"
fi

# 2. 杀掉占用 PORT 的旧进程
OLD_PID=$(lsof -ti :$PORT 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  echo "[2/5] 杀掉占用 $PORT 的旧进程：$OLD_PID"
  kill -9 $OLD_PID 2>/dev/null || true
  sleep 1
else
  echo "[2/5] 端口 $PORT 空闲"
fi

# 3. 准备数据目录
mkdir -p data uploads
echo "[3/5] 数据目录就绪（data/ uploads/）"

# 4. 后台启动
echo "[4/5] 启动 node server.js（日志：$LOG_FILE）"
nohup node server.js > "$LOG_FILE" 2>&1 &
NODE_PID=$!
echo "      PID: $NODE_PID"

# 5. 等待端口就绪
echo "[5/5] 等待端口 $PORT 就绪..."
for i in $(seq 1 15); do
  if curl -s -o /dev/null "http://localhost:$PORT/index.html" 2>/dev/null; then
    echo ""
    echo "✅ 启动成功"
    echo "   PID:  $NODE_PID"
    echo "   端口: $PORT"
    echo "   日志: tail -f $LOG_FILE"
    echo "   首页: http://localhost:$PORT/index.html"
    exit 0
  fi
  sleep 1
done

echo ""
echo "❌ 启动超时，请检查日志：cat $LOG_FILE"
exit 1
