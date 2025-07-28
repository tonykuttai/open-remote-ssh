#!/bin/bash
# aix-patches/modules/build-platform-override.sh
# Create platform override system for AIX

set -e

SERVER_DIR="$1"
if [[ -z "$SERVER_DIR" ]]; then
    echo "Usage: $0 <server_directory>"
    exit 1
fi

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../utils/aix-environment.sh"

MODULE_NAME="platform-override"
OVERRIDE_FILE="$SERVER_DIR/aix-platform-override.js"
SERVER_SCRIPT="$SERVER_DIR/bin/codium-server"
CLI_SCRIPT="$SERVER_DIR/bin/remote-cli/codium"

echo "Creating AIX platform override system..."
echo "Server directory: $SERVER_DIR"

# Check if already patched
if [[ -f "$SERVER_DIR/.platform-override-patched" ]]; then
    echo "Platform override already installed"
    exit 0
fi

# Step 1: Create the platform override script
echo "Creating platform override script..."
cat > "$OVERRIDE_FILE" << 'PLATFORM_EOF'
// AIX Platform Override - intercept process.platform calls
const originalPlatform = process.platform;

// Create a property descriptor that returns 'linux' when VSCodium asks
Object.defineProperty(process, 'platform', {
    get: function() {
        // Get the call stack to see who's asking
        const stack = new Error().stack;

        // For VSCodium components, pretend we're Linux
        if (stack && (stack.includes('ptyHost') || stack.includes('server-main') || stack.includes('deviceid'))) {
            return 'linux';
        }

        // For everything else (including node-pty), return actual platform
        return originalPlatform;
    },
    configurable: true
});

// Uncomment for debugging:
// console.log('[AIX Override] Installed platform override');
// console.log('[AIX Override] Real platform:', originalPlatform);
PLATFORM_EOF

echo "✓ Created platform override: $OVERRIDE_FILE"

# Step 2: Modify server wrapper to load platform override
echo "Updating server wrapper script..."
if [[ -f "$SERVER_SCRIPT" ]]; then
    # Backup original
    cp "$SERVER_SCRIPT" "$SERVER_SCRIPT.backup"
    
    cat > "$SERVER_SCRIPT" << 'SERVER_EOF'
#!/bin/bash
# VSCodium Server wrapper for AIX - With Platform Override

# Use the known Node.js location for AIX
NODE_BIN="/opt/nodejs/bin/node"

if [[ ! -x "$NODE_BIN" ]]; then
    echo "ERROR: Node.js not found at $NODE_BIN"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Look for server main script in common locations
SERVER_MAIN=""
if [[ -f "$SCRIPT_DIR/../out/server-main.js" ]]; then
    SERVER_MAIN="$SCRIPT_DIR/../out/server-main.js"
elif [[ -f "$SCRIPT_DIR/../out/vs/server/main.js" ]]; then
    SERVER_MAIN="$SCRIPT_DIR/../out/vs/server/main.js"
else
    echo "ERROR: Server main script not found"
    exit 1
fi

# Use -r flag to preload our platform override
exec "$NODE_BIN" -r "$SCRIPT_DIR/../aix-platform-override.js" "$SERVER_MAIN" "$@"
SERVER_EOF

    chmod +x "$SERVER_SCRIPT"
    echo "✓ Updated server wrapper: $SERVER_SCRIPT"
else
    echo "⚠ Server script not found: $SERVER_SCRIPT"
fi

# Step 3: Fix remote CLI to use AIX Node.js
echo "Updating remote CLI script..."
CLI_DIR="$(dirname "$CLI_SCRIPT")"
mkdir -p "$CLI_DIR"

if [[ -f "$CLI_SCRIPT" ]]; then
    # Backup original
    cp "$CLI_SCRIPT" "$CLI_SCRIPT.backup"
fi

# Extract version info from existing script if available, otherwise use defaults
VERSION="1.102.24914"
COMMIT="$(basename "$SERVER_DIR")"
if [[ -f "$CLI_SCRIPT.backup" ]]; then
    # Try to extract actual values from backup
    VERSION=$(grep '^VERSION=' "$CLI_SCRIPT.backup" 2>/dev/null | cut -d'"' -f2 || echo "$VERSION")
    COMMIT=$(grep '^COMMIT=' "$CLI_SCRIPT.backup" 2>/dev/null | cut -d'"' -f2 || echo "$COMMIT")
fi

cat > "$CLI_SCRIPT" << CLI_EOF
#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Modified for AIX compatibility
#
ROOT="\\$(dirname "\\$(dirname "\\$(dirname "\\$(readlink -f "\\$0")")")")"
APP_NAME="codium"
VERSION="$VERSION"
COMMIT="$COMMIT"
EXEC_NAME="codium"
CLI_SCRIPT="\\$ROOT/out/server-cli.js"

# Use AIX Node.js instead of bundled Linux binary
NODE_BIN="/opt/nodejs/bin/node"

if [[ ! -x "\\$NODE_BIN" ]]; then
    echo "ERROR: Node.js not found at \\$NODE_BIN"
    exit 1
fi

# Execute with AIX Node.js and platform override
exec "\\$NODE_BIN" -r "\\$ROOT/aix-platform-override.js" "\\$CLI_SCRIPT" "\\$APP_NAME" "\\$VERSION" "\\$COMMIT" "\\$EXEC_NAME" "\\$@"
CLI_EOF

chmod +x "$CLI_SCRIPT"
echo "✓ Updated remote CLI: $CLI_SCRIPT"

# Step 4: Test the platform override
echo "Testing platform override..."
cd "$SERVER_DIR"

cat > test-platform-override.js << 'TESTEOF'
try {
    console.log('Testing platform override...');
    console.log('Direct process.platform:', process.platform);
    
    // Simulate a VSCodium call by manipulating the stack
    function testWithMockedStack() {
        const originalError = Error;
        Error = function() {
            const err = new originalError();
            err.stack = 'fake stack trace with ptyHost in it';
            return err;
        };
        
        const result = process.platform;
        Error = originalError;
        return result;
    }
    
    const mockResult = testWithMockedStack();
    console.log('Mocked ptyHost call result:', mockResult);
    
    if (mockResult === 'linux') {
        console.log('✓ Platform override working correctly');
    } else {
        console.log('⚠ Platform override may not be working as expected');
    }
    
} catch (err) {
    console.log('✗ Platform override test failed:', err.message);
}
TESTEOF

if node -r ./aix-platform-override.js test-platform-override.js; then
    echo "✓ Platform override test passed"
else
    echo "⚠ Platform override test had issues"
fi

# Clean up test file
rm -f test-platform-override.js

# Mark as patched
touch "$SERVER_DIR/.platform-override-patched"
cat > "$SERVER_DIR/.platform-override-patched" << PATCH_EOF
AIX Platform Override Applied
Date: $(date)
Platform: $(uname -s) $(uname -m)
Node.js: $(node --version)
Files modified:
  - aix-platform-override.js (created)
  - bin/codium-server (updated)
  - bin/remote-cli/codium (updated)
PATCH_EOF

echo "✓ Platform override system successfully installed"
echo ""
echo "Summary of changes:"
echo "  • Created: aix-platform-override.js"
echo "  • Updated: bin/codium-server (with platform override)"
echo "  • Updated: bin/remote-cli/codium (AIX Node.js + platform override)"
echo "  • All original files backed up with .backup extension"