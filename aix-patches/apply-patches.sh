#!/bin/bash
# aix-patches/apply-patches.sh
# Main AIX patch orchestrator for VSCodium server

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$1"

if [[ -z "$SERVER_DIR" ]]; then
    echo "Usage: $0 <vscodium_server_directory>"
    echo "Example: $0 ~/.vscodium-server/bin/f31fcf7adcc9aa7c5cdc36acfe05a456aee59165"
    exit 1
fi

echo "==========================================="
echo "AIX VSCodium Server Compatibility Patches"
echo "==========================================="
echo "Server Directory: $SERVER_DIR"
echo "Patches Directory: $SCRIPT_DIR"
echo "Platform: $(uname -s) $(uname -m)"
echo ""

# Source utilities
source "$SCRIPT_DIR/utils/aix-environment.sh"

# Counters for summary
PATCHES_ATTEMPTED=0
PATCHES_SUCCESS=0
PATCHES_FAILED=0

# Function to run individual module patch
run_module_patch() {
    local module_name="$1"
    local patch_script="$SCRIPT_DIR/modules/build-${module_name}.sh"
    
    echo "=== Patching $module_name ==="
    PATCHES_ATTEMPTED=$((PATCHES_ATTEMPTED + 1))
    
    if [[ ! -f "$patch_script" ]]; then
        echo "⚠️  Patch script not found: $patch_script"
        PATCHES_FAILED=$((PATCHES_FAILED + 1))
        return 1
    fi
    
    if bash "$patch_script" "$SERVER_DIR"; then
        echo "[Success] $module_name patched successfully"
        PATCHES_SUCCESS=$((PATCHES_SUCCESS + 1))
        return 0
    else
        echo "[Fail] $module_name patch failed"
        PATCHES_FAILED=$((PATCHES_FAILED + 1))
        return 1
    fi
}

# Function to test server startup
test_server_startup() {
    echo ""
    echo "=== Testing Server Startup ==="
    
    cd "$SERVER_DIR"
    
    # Kill any existing servers
    pkill -f "server-main.js" 2>/dev/null || true
    sleep 1
    
    # Create test token
    echo "test-token-$(date +%s)" > /tmp/aix-test.token
    
    # Test server startup with timeout
    echo "Starting VSCodium server for testing..."
    timeout 10 /opt/nodejs/bin/node bin/../out/server-main.js \
        --start-server \
        --host=127.0.0.1 \
        --port=0 \
        --connection-token-file=/tmp/aix-test.token \
        --telemetry-level=off \
        --accept-server-license-terms \
        --without-browser-env-var &
    
    local server_pid=$!
    sleep 5
    
    if ps -p $server_pid > /dev/null 2>&1; then
        echo "[Success] Server started successfully (PID: $server_pid)"
        kill $server_pid 2>/dev/null || true
        rm -f /tmp/aix-test.token
        return 0
    else
        echo "[Fail] Server failed to start"
        rm -f /tmp/aix-test.token
        return 1
    fi
}

# Main execution
main() {
    echo "Checking AIX environment..."
    if ! setup_aix_environment; then
        echo "[Fail] Failed to setup AIX build environment"
        exit 1
    fi
    
    echo "Starting module patching..."
    echo ""
    
    # Patch modules in order of criticality
    # Critical modules (server won't start without these)
    run_module_patch "spdlog"
    
    # Important modules (major features won't work)
    run_module_patch "native-watchdog"
    # run_module_patch "node-pty"      # Uncomment when ready
    # run_module_patch "sqlite3"       # Uncomment when ready
    
    # Optional modules (nice-to-have features)
    # run_module_patch "native-keymap" # Uncomment when ready
    
    echo ""
    echo "Testing patched server..."
    if test_server_startup; then
        echo "🎉 Server startup test passed!"
    else
        echo "⚠️  Server startup test failed - check logs above"
    fi
    
    # Summary
    echo ""
    echo "========================================="
    echo "Patch Summary:"
    echo "  📊 Attempted: $PATCHES_ATTEMPTED"
    echo "  ✅ Successful: $PATCHES_SUCCESS"
    echo "  ❌ Failed: $PATCHES_FAILED"
    echo "========================================="
    
    if [[ $PATCHES_FAILED -gt 0 ]]; then
        echo ""
        echo "⚠️  Some patches failed. The server might have issues."
        echo "Check individual patch logs above for details."
        exit 1
    else
        echo ""
        echo "🎉 All patches applied successfully!"
        echo ""
        echo "Next steps:"
        echo "1. Connect via Remote SSH extension"
        echo "2. Monitor for any remaining native module errors"
        echo "3. Report issues at: https://github.com/tonykuttai/open-remote-ssh/issues"
    fi
}

# Run main function
main "$@"