#!/bin/bash
# 慢慢说 · Demo 打包脚本
# 用法：bash pack-demo.sh
# 作用：打包 HTML zip（符合 Trae 创造力大赛要求），评委双击 index.html 即可体验
# 输出：dist/manmanshuo-demo.zip

set -e
cd "$(dirname "$0")"

OUTPUT_DIR="dist"
ZIP_NAME="manmanshuo-demo.zip"
STAGING="_demo_staging"

echo "=== 慢慢说 · Demo 打包脚本 ==="

# 1. 清理旧产物
echo "[1/5] 清理旧产物..."
rm -rf "$STAGING" "$OUTPUT_DIR"
mkdir -p "$STAGING" "$OUTPUT_DIR"

# 2. 复制必要文件（排除后端/数据/依赖/开发文件）
echo "[2/5] 复制前端文件..."
mkdir -p "$STAGING/_shared/fonts" "$STAGING/_shared/js"

# HTML 页面
for f in index.html demo.html login.html profile.html manmanshuo.html heart-qa.html whisper.html slowly.html envelope.html framework.html summary.html; do
  [ -f "$f" ] && cp "$f" "$STAGING/"
done

# 共享资源
[ -d "_shared/fonts" ] && cp _shared/fonts/*.ttf "$STAGING/_shared/fonts/" 2>/dev/null || true
[ -f "_shared/js/mermaid.min.js" ] && cp _shared/js/mermaid.min.js "$STAGING/_shared/js/"

# 3. 修改 index.html：离线模式强制走 demo.html
# （离线 zip 不可能有后端，enterDemo 的 fetch 会失败，自动降级到 demo.html，无需额外改）

echo "[3/5] 文件清单："
find "$STAGING" -type f | sort | while read f; do
  size=$(du -h "$f" | cut -f1)
  echo "  $size  ${f#$STAGING/}"
done

# 4. 打包
echo "[4/5] 打包中..."
cd "$STAGING"
zip -r -q "../$OUTPUT_DIR/$ZIP_NAME" .
cd ..

# 5. 完成
SIZE=$(du -h "$OUTPUT_DIR/$ZIP_NAME" | cut -f1)
echo "[5/5] 完成"
echo ""
echo "✅ 打包成功"
echo "   文件: $OUTPUT_DIR/$ZIP_NAME"
echo "   大小: $SIZE"
echo "   体验: 解压后双击 index.html → 点「✨ 立即体验 Demo」"
echo ""
echo "   提交到 Trae 大赛：上传 $OUTPUT_DIR/$ZIP_NAME"

# 清理暂存
rm -rf "$STAGING"
