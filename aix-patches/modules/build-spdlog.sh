#!/bin/bash
# aix-patches/modules/build-spdlog.sh
# Build @vscode/spdlog for AIX (based on your working script)

set -e

SERVER_DIR="$1"
if [[ -z "$SERVER_DIR" ]]; then
    echo "Usage: $0 <server_directory>"
    exit 1
fi

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../utils/aix-environment.sh"

MODULE_NAME="@vscode/spdlog"
MODULE_PATH="$SERVER_DIR/node_modules/@vscode/spdlog"

echo "Building $MODULE_NAME for AIX..."
echo "Server directory: $SERVER_DIR"
echo "Module path: $MODULE_PATH"

# Check if module needs patching
if ! module_needs_patching "$MODULE_PATH" "$MODULE_NAME"; then
    echo "✅ $MODULE_NAME doesn't need patching or already patched"
    exit 0
fi

# Create temporary build directory
TEMP_DIR="/tmp/aix-spdlog-build-$$"
mkdir -p "$TEMP_DIR"
echo "Building in: $TEMP_DIR"

# Ensure cleanup on exit
cleanup_spdlog() {
    cd "$SERVER_DIR" 2>/dev/null || true
    rm -rf "$TEMP_DIR" 2>/dev/null || true
}
trap cleanup_spdlog EXIT

cd "$TEMP_DIR"

# Clone spdlog source (your working approach)
echo "Cloning spdlog source..."
if ! git clone https://github.com/microsoft/node-spdlog.git .; then
    echo "❌ Failed to clone spdlog repository"
    exit 1
fi

echo "Updating submodules..."
if ! git submodule update --init --recursive; then
    echo "❌ Failed to update git submodules"
    exit 1
fi

# Get target version from VSCodium's module
TARGET_VERSION=""
if [[ -f "$MODULE_PATH/package.json" ]]; then
    TARGET_VERSION=$(grep '"version"' "$MODULE_PATH/package.json" | cut -d'"' -f4)
    echo "Target version from VSCodium: $TARGET_VERSION"
fi

# Build with AIX environment (your working flags)
echo "Installing dependencies and building for AIX..."
echo "Using CXXFLAGS: $CXXFLAGS"
echo "Using CFLAGS: $CFLAGS"

if ! npm install; then
    echo "❌ npm install failed"
    exit 1
fi

# Test the build (your working test)
echo "Testing AIX build..."
cat > test-build.js << 'EOF'
(async () => {
    try {
        const spdlog = require('./index.js');
        console.log('✅ Module loaded');
        console.log('Version:', spdlog.version);
        
        const logger = await spdlog.createRotatingLogger('test', '/tmp/test-aix.log', 1024, 3);
        console.log('✅ Logger created');
        
        // Test logging methods
        logger.info('AIX build test message');
        logger.flush();
        console.log('✅ Logging works');
        
        console.log('🎉 AIX spdlog build successful!');
    } catch (err) {
        console.log('❌ Build test failed:', err.message);
        process.exit(1);
    }
})();
EOF

if ! node test-build.js; then
    echo "❌ spdlog build test failed"
    exit 1
fi

# Backup original module
backup_module "$MODULE_PATH" "linux-backup"

# Install the AIX-built version
echo "Installing AIX-built spdlog..."
cp -r "$TEMP_DIR"/* "$MODULE_PATH/"

# Mark as patched
mark_module_patched "$MODULE_PATH" "$MODULE_NAME"

# Final verification in target location
echo "Verifying installation..."
cd "$MODULE_PATH"
if node -e "const spdlog = require('./index.js'); spdlog.createRotatingLogger('verify', '/tmp/verify.log', 1024, 3).then(() => console.log('[OK] Installation verified')).catch(err => { console.log('[ERROR] Verification failed:', err.message); process.exit(1); })"; then    echo "✅ $MODULE_NAME successfully built and installed for AIX"
    rm -f /tmp/test-aix.log /tmp/verify.log
    exit 0
else
    echo "❌ $MODULE_NAME installation verification failed"
    exit 1
fi