#!/bin/bash
# Sync ai-core and common-core from upstream Android project

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo "Syncing common-core..."
cp -v common/src/main/java/me/rerere/common/http/*.kt \
    "$BACKEND_DIR/common-core/src/main/kotlin/me/rerere/common/http/"

cp -v common/src/main/java/me/rerere/common/cache/*.kt \
    "$BACKEND_DIR/common-core/src/main/kotlin/me/rerere/common/cache/"

echo "Syncing ai-core (copy-as-is files)..."
cp -v ai/src/main/java/me/rerere/ai/core/*.kt \
    "$BACKEND_DIR/ai-core/src/main/kotlin/me/rerere/ai/core/"

cp -v ai/src/main/java/me/rerere/ai/ui/*.kt \
    "$BACKEND_DIR/ai-core/src/main/kotlin/me/rerere/ai/ui/"

cp -v ai/src/main/java/me/rerere/ai/util/Serializer.kt \
    ai/src/main/java/me/rerere/ai/util/Json.kt \
    ai/src/main/java/me/rerere/ai/util/Request.kt \
    ai/src/main/java/me/rerere/ai/util/ErrorParser.kt \
    ai/src/main/java/me/rerere/ai/util/SSE.kt \
    "$BACKEND_DIR/ai-core/src/main/kotlin/me/rerere/ai/util/"

cp -v ai/src/main/java/me/rerere/ai/registry/*.kt \
    "$BACKEND_DIR/ai-core/src/main/kotlin/me/rerere/ai/registry/"

cp -v ai/src/main/java/me/rerere/ai/provider/Provider.kt \
    ai/src/main/java/me/rerere/ai/provider/Model.kt \
    "$BACKEND_DIR/ai-core/src/main/kotlin/me/rerere/ai/provider/"

cp -v ai/src/main/java/me/rerere/ai/provider/providers/openai/OpenAIImpl.kt \
    "$BACKEND_DIR/ai-core/src/main/kotlin/me/rerere/ai/provider/providers/openai/"

cp -v ai/src/main/java/me/rerere/ai/provider/providers/ProviderMessageUtils.kt \
    "$BACKEND_DIR/ai-core/src/main/kotlin/me/rerere/ai/provider/providers/"

cp -v ai/src/main/java/me/rerere/ai/provider/providers/vertex/ServiceAccountTokenProvider.kt \
    "$BACKEND_DIR/ai-core/src/main/kotlin/me/rerere/ai/provider/providers/vertex/"

echo "Sync complete!"
echo "Note: Files with Android dependencies need manual adaptation:"
echo "  - ProviderSetting.kt"
echo "  - ProviderManager.kt"
echo "  - OpenAIProvider.kt"
echo "  - GoogleProvider.kt"
echo "  - ClaudeProvider.kt"
echo "  - ChatCompletionsAPI.kt"
echo "  - ResponseAPI.kt"
echo "  - KeyRoulette.kt"
echo "  - FileEncoder.kt"
echo "  - AcceptLang.kt"