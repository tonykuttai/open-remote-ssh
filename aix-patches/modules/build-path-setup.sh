#!/bin/bash
# aix-patches/modules/build-path-setup.sh
# Setup PATH for VSCodium remote CLI

set -e

SERVER_DIR="$1"
if [[ -z "$SERVER_DIR" ]]; then
    echo "Usage: $0 <server_directory>"
    exit 1
fi

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../utils/aix-environment.sh"

MODULE_NAME="path-setup"
CLI_DIR="$SERVER_DIR/bin/remote-cli"
BASHRC_FILE="$HOME/.bashrc"

echo "Setting up VSCodium CLI in PATH..."
echo "Server directory: $SERVER_DIR"
echo "CLI directory: $CLI_DIR"

# Check if already patched
if [[ -f "$SERVER_DIR/.path-setup-patched" ]]; then
    echo "PATH setup already configured"
    exit 0
fi

# Verify CLI exists
if [[ ! -f "$CLI_DIR/codium" ]]; then
    echo "⚠ Remote CLI not found at $CLI_DIR/codium"
    echo "This should be created by the platform-override patch first"
    exit 1
fi

# Check if PATH is already set up
if echo "$PATH" | grep -q "$CLI_DIR"; then
    echo "✓ VSCodium CLI already in PATH"
else
    echo "Adding VSCodium CLI to PATH..."
    
    # Add to .bashrc or .bashrc.mine if it exists
    BASHRC_TARGET="$BASHRC_FILE"
    if [[ -f "$HOME/.bashrc.mine" ]]; then
        BASHRC_TARGET="$HOME/.bashrc.mine"
        echo "Using .bashrc.mine for PATH setup"
    fi
    
    # Create the PATH export line
    PATH_EXPORT="export PATH=\\"$CLI_DIR:\\$PATH\\""
    
    # Check if already in bashrc
    if ! grep -F "$CLI_DIR" "$BASHRC_TARGET" >/dev/null 2>&1; then
        echo "" >> "$BASHRC_TARGET"
        echo "# VSCodium Server CLI - Added by AIX patches" >> "$BASHRC_TARGET"
        echo "$PATH_EXPORT" >> "$BASHRC_TARGET"
        echo "✓ Added VSCodium CLI to PATH in $BASHRC_TARGET"
    else
        echo "✓ VSCodium CLI PATH already exists in $BASHRC_TARGET"
    fi
fi

# Test the CLI
echo "Testing VSCodium CLI..."
if "$CLI_DIR/codium" --version >/dev/null 2>&1; then
    echo "✓ VSCodium CLI working"
else
    echo "⚠ VSCodium CLI test failed, but this may be normal if server isn't running"
fi

# Mark as patched
touch "$SERVER_DIR/.path-setup-patched"
cat > "$SERVER_DIR/.path-setup-patched" << PATCH_EOF
AIX PATH Setup Applied
Date: $(date)
CLI Directory: $CLI_DIR
Added to: $BASHRC_TARGET
PATCH_EOF

echo "✓ PATH setup completed"
echo ""
echo "Summary:"
echo "  • VSCodium CLI available at: $CLI_DIR/codium"
echo "  • Added to PATH in: $BASHRC_TARGET"
echo "  • Restart your shell or run 'source $BASHRC_TARGET' to use 'codium' command"