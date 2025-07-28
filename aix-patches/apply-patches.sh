# Create apply-patches.sh - UPDATED VERSION
    cat > "$PATCH_SCRIPT_DIR/apply-patches.sh" << 'PATCH_EOF'
#!/bin/bash
# aix-patches/apply-patches.sh
# Main AIX patch orchestrator for VSCodium server

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$1"

if [[ -z "$SERVER_DIR" ]]; then
    echo "Usage: $0 <vscodium_server_directory>"
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
    local patch_script="$SCRIPT_DIR/modules/build-\${module_name}.sh"
    
    echo "=== Patching $module_name ==="
    PATCHES_ATTEMPTED=$((PATCHES_ATTEMPTED + 1))
    
    if [[ ! -f "$patch_script" ]]; then
        echo "[WARN] Patch script not found: $patch_script"
        PATCHES_FAILED=$((PATCHES_FAILED + 1))
        return 1
    fi
    
    if bash "$patch_script" "$SERVER_DIR"; then
        echo "[OK] $module_name patched successfully"
        PATCHES_SUCCESS=$((PATCHES_SUCCESS + 1))
        return 0
    else
        echo "[ERROR] $module_name patch failed"
        PATCHES_FAILED=$((PATCHES_FAILED + 1))
        return 1
    fi
}

# Main execution
main() {
    echo "Checking AIX environment..."
    if ! setup_aix_environment; then
        echo "[ERROR] Failed to setup AIX build environment"
        exit 1
    fi
    
    echo "Starting module patching..."
    echo ""
    
    # Patch modules in order of criticality
    run_module_patch "deviceid"           # Fix AIX platform support
    run_module_patch "platform-override"  # Install platform override system
    run_module_patch "spdlog"             # Build spdlog for AIX
    run_module_patch "native-watchdog"    # Build native-watchdog for AIX
    run_module_patch "node-pty"           # Build node-pty for AIX
    run_module_patch "path-setup"         # Setup CLI in PATH
    
    echo ""
    echo "========================================="
    echo "Patch Summary:"
    echo "  Attempted: $PATCHES_ATTEMPTED"
    echo "  Successful: $PATCHES_SUCCESS"
    echo "  Failed: $PATCHES_FAILED"
    echo "========================================="
    
    if [[ $PATCHES_FAILED -gt 0 ]]; then
        echo ""
        echo "[WARN] Some patches failed. The server might have issues."
        echo "Check individual patch logs above for details."
        exit 1
    else
        echo ""
        echo "[SUCCESS] All patches applied successfully!"
    fi
}

# Run main function
main "$@"
PATCH_EOF