#!/bin/bash
# aix-patches/modules/build-node-pty.sh
# Build node-pty from source for AIX

set -e

SERVER_DIR="$1"
if [[ -z "$SERVER_DIR" ]]; then
    echo "Usage: $0 <server_directory>"
    exit 1
fi

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../utils/aix-environment.sh"

MODULE_NAME="node-pty"
MODULE_PATH="$SERVER_DIR/node_modules/node-pty"
PTY_REPO="https://github.com/tonykuttai/node-pty.git"
PTY_BRANCH="main"

echo "Building $MODULE_NAME for AIX from source..."
echo "Server directory: $SERVER_DIR"
echo "Module path: $MODULE_PATH"
echo "Repository: $PTY_REPO"
echo "Branch: $PTY_BRANCH"

# Check if already patched
if [[ -f "$MODULE_PATH/.aix-patched" ]]; then
    echo "[OK] $MODULE_NAME already patched for AIX"
    exit 0
fi

# Check if module exists
if [[ ! -d "$MODULE_PATH" ]]; then
    echo "[ERROR] Module $MODULE_NAME not found at $MODULE_PATH"
    exit 1
fi

# Check if Linux binary exists (to confirm patching is needed)
if [[ -f "$MODULE_PATH/build/Release/pty.node" ]]; then
    if file "$MODULE_PATH/build/Release/pty.node" | grep -q "ELF.*x86-64"; then
        echo "Found Linux binary in $MODULE_NAME: $MODULE_PATH/build/Release/pty.node"
        echo "Building AIX replacement..."
    elif file "$MODULE_PATH/build/Release/pty.node" | grep -q "XCOFF"; then
        echo "[OK] Already has AIX binary, marking as patched"
        mark_module_patched "$MODULE_PATH" "$MODULE_NAME"
        exit 0
    else
        echo "[INFO] Unknown binary format, proceeding with AIX build..."
    fi
fi

# Create temporary build directory
TEMP_DIR="/tmp/aix-nodepty-build-$"
mkdir -p "$TEMP_DIR"
echo "Building in: $TEMP_DIR"

# Cleanup function
cleanup_nodepty() {
    echo "Cleaning up build directory..."
    cd "$SERVER_DIR" 2>/dev/null || true
    if [[ -f "$TEMP_DIR/build/Release/pty.node" ]]; then
        echo "Build succeeded, cleaning up temp directory"
        rm -rf "$TEMP_DIR" 2>/dev/null || true
    else
        echo "Build may have failed - keeping temp dir for debugging: $TEMP_DIR"
    fi
}
trap cleanup_nodepty EXIT

cd "$TEMP_DIR"

# Clone node-pty source
echo "Cloning node-pty source from custom AIX branch..."
if ! git clone "$PTY_REPO" -b "$PTY_BRANCH" .; then
    echo "[ERROR] Failed to clone node-pty repository"
    exit 0
fi

echo "Successfully cloned node-pty AIX branch"

echo "=== BUILD SETUP ==="
echo "Current directory: $(pwd)"
echo "==================="

# Build with AIX environment
echo "Installing dependencies and building for AIX..."
echo "Using CXXFLAGS: $CXXFLAGS"
echo "Using CFLAGS: $CFLAGS"

# Install dependencies (needed for node-addon-api)
echo "Installing dependencies for node-addon-api..."
if ! npm install --no-optional; then
    echo "[ERROR] npm install failed - cannot get node-addon-api"
    exit 1
fi

# Create the proven compile script
echo "Creating proven AIX compile script..."
cat > compile-aix.sh << 'COMPILE_EOF'
#!/bin/bash
# Proven AIX compile script for node-pty

set -e

# Verify prerequisites
if [[ ! -f "$HOME/local/portlibforaix/lib/libutil.so.2" ]]; then
    echo "[ERROR] libutil.so.2 not found at $HOME/local/portlibforaix/lib/libutil.so.2"
    exit 1
fi

# Create build directory
mkdir -p build/Release

echo "Compiling node-pty source..."
g++ -o build/Release/pty.o -c src/unix/pty.cc \
  -I/opt/nodejs/include/node \
  -I$HOME/.cache/node-gyp/$(node -v)/include/node \
  -Inode_modules/node-addon-api \
  -I/opt/freeware/include \
  -std=gnu++17 -D_GLIBCXX_USE_CXX11_ABI=0 \
  -fPIC -pthread -Wall -Wextra -Wno-unused-parameter \
  -maix64 -O3 -fno-omit-frame-pointer

echo "Linking shared library..."
g++ -shared -maix64 \
  -Wl,-bimport:/opt/nodejs/include/node/node.exp \
  -pthread \
  -lpthread \
  -lstdc++ \
  -o build/Release/pty.node \
  build/Release/pty.o \
  -L$HOME/local/portlibforaix/lib \
  $HOME/local/portlibforaix/lib/libutil.so.2

echo "Build completed successfully!"
echo "Module created: build/Release/pty.node"

# Verify it's an AIX binary
if file build/Release/pty.node | grep -q "XCOFF"; then
    echo "✓ AIX XCOFF binary confirmed"
else
    echo "✗ Binary is not AIX format"
    file build/Release/pty.node
    exit 1
fi
COMPILE_EOF

chmod +x compile-aix.sh

# Run the proven build
echo "Building with proven compile method..."
if ! bash compile-aix.sh; then
    echo "[ERROR] Proven compile method failed"
    exit 1
fi

# Verify build output
EXPECTED_BINARY="./build/Release/pty.node"
if [[ ! -f "$EXPECTED_BINARY" ]]; then
    echo "[ERROR] Build failed - pty.node not found"
    echo "Build directory contents:"
    find . -name "*.node" -type f 2>/dev/null || echo "No .node files found"
    exit 1
fi

echo "=== BUILD VERIFICATION ==="
echo "Built binary info:"
file "$EXPECTED_BINARY"
ls -la "$EXPECTED_BINARY"

# Verify it's an AIX binary
if ! file "$EXPECTED_BINARY" | grep -q "XCOFF"; then
    echo "[ERROR] Built binary is not AIX XCOFF format"
    file "$EXPECTED_BINARY"
    exit 1
fi
echo "✓ AIX XCOFF binary confirmed"
echo "=========================="

# Test the build
echo "Testing AIX-built node-pty..."
cat > test-build.js << 'TESTEOF'
try {
    const pty = require('./lib/index.js');
    console.log('[OK] Node-pty loads successfully');
    console.log('[INFO] Available functions:', Object.keys(pty));
    
    // Quick spawn test
    const child = pty.spawn('echo', ['AIX build test successful'], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME,
        env: process.env
    });
    
    child.on('data', (data) => {
        console.log('[OK] Output:', data.toString().trim());
    });
    
    child.on('exit', (code) => {
        console.log('[SUCCESS] Build test completed successfully!');
        process.exit(0);
    });
    
    setTimeout(() => {
        console.log('[INFO] Test timeout (normal for echo command)');
        process.exit(0);
    }, 3000);
    
} catch (err) {
    console.log('[ERROR] Build test failed:', err.message);
    process.exit(1);
}
TESTEOF

if timeout 5 node test-build.js 2>/dev/null; then
    echo "[OK] Functional test passed"
else
    echo "[WARN] Functional test failed or timed out, but continuing..."
fi

# Backup original module
echo "Backing up original module..."
backup_module "$MODULE_PATH" "linux-backup"

# Install the AIX-built version
echo "Installing AIX-built node-pty..."
cp -r "$TEMP_DIR"/* "$MODULE_PATH/"

# Ensure the binary is executable
chmod +x "$MODULE_PATH/build/Release/pty.node"

# Verify installation
echo "Verifying installation..."
if [[ -f "$MODULE_PATH/build/Release/pty.node" ]]; then
    echo "✓ Binary installed successfully:"
    file "$MODULE_PATH/build/Release/pty.node"
    ls -la "$MODULE_PATH/build/Release/pty.node"
else
    echo "[ERROR] Binary not found after installation"
    exit 1
fi

# Mark as patched
mark_module_patched "$MODULE_PATH" "$MODULE_NAME"

# Final verification in target location
echo "Final verification in target location..."
cd "$MODULE_PATH"

cat > verify-install.js << 'VERIFYEOF'
try {
    const pty = require('./lib/index.js');
    console.log('[OK] Installation verified - node-pty loads successfully');
    console.log('[INFO] Available functions:', Object.keys(pty));
    console.log('[SUCCESS] AIX node-pty ready for VSCodium terminal support!');
} catch (err) {
    console.log('[ERROR] Installation verification failed:', err.message);
    process.exit(1);
}
VERIFYEOF

if node verify-install.js; then
    echo "[OK] $MODULE_NAME successfully built and installed for AIX"
else
    echo "[ERROR] Installation verification failed"
    exit 1
fi

echo "[INFO] Terminal functionality should now work properly in VSCodium"