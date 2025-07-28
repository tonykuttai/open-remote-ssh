# VSCodium Server on AIX PowerPC - Complete Setup Guide

A comprehensive guide to get VSCodium remote server working on IBM AIX PowerPC systems.

##  Problem Overview

VSCodium server fails on AIX PowerPC due to several compatibility issues:
- Missing git submodules in native Node.js modules
- Thread-local storage (TLS) incompatibility 
- Platform detection only supporting `win32`, `darwin`, `linux`
- Pre-compiled x86-64 native binaries incompatible with PowerPC

##  Solution Steps

### Step 1: Set AIX-Compatible Environment Variables

```bash
# Critical: Set these before building any native modules
export CXXFLAGS="-ftls-model=global-dynamic -fPIC -pthread"
export CFLAGS="-ftls-model=global-dynamic -fPIC -pthread"
```

**Why**: AIX requires `global-dynamic` TLS model instead of `local-exec` for shared libraries.

### Step 2: Fix node-spdlog Build Issues

If you're building node-spdlog from source:

```bash
# 1. Clone the repository
git clone https://github.com/microsoft/node-spdlog.git
cd node-spdlog

# 2. Initialize git submodules (CRITICAL!)
git submodule update --init --recursive

# 3. Build with AIX-compatible flags
export CXXFLAGS="-ftls-model=global-dynamic -fPIC -pthread"
export CFLAGS="-ftls-model=global-dynamic -fPIC -pthread"
npm install

# 4. Test the build
node -e "const spdlog = require('./index.js'); console.log(' spdlog loaded successfully!');"
```

### Step 3: Fix VSCodium Platform Detection

#### 3.1 Fix deviceid Module

**File**: `~/.vscodium-server/bin/*/node_modules/@vscode/deviceid/dist/index.js`

```javascript
// FIND (around line 21-25):
if (process.platform !== "win32" &&
    process.platform !== "darwin" &&
    process.platform !== "linux") {
    throw new Error("Unsupported platform");
}

// REPLACE WITH:
if (process.platform !== "win32" &&
    process.platform !== "darwin" &&
    process.platform !== "linux" &&
    process.platform !== "aix") {
    throw new Error("Unsupported platform");
}
```

#### 3.2 Fix deviceid Storage Module

**File**: `~/.vscodium-server/bin/*/node_modules/@vscode/deviceid/dist/storage.js`

```javascript
// FIND the getDirectory function (around line 42-50):
if (process.platform === "darwin") {
    folder = path.join(process.env.HOME, "Library", "Application Support");
}
else if (process.platform === "linux") {
    folder = process.env.XDG_CACHE_HOME ?? path.join(process.env.HOME, ".cache");
}
else {
    throw new Error("Unsupported platform");
}

// REPLACE WITH (treat AIX like Linux):
if (process.platform === "darwin") {
    folder = path.join(process.env.HOME, "Library", "Application Support");
}
else if (process.platform === "linux" || process.platform === "aix") {
    folder = process.env.XDG_CACHE_HOME ?? path.join(process.env.HOME, ".cache");
}
else {
    throw new Error("Unsupported platform");
}
```

### Step 4: Fix native-watchdog Module

The native-watchdog module ships with x86-64 binaries that don't work on PowerPC. Create a compatible stub:

**File**: `~/.vscodium-server/bin/*/node_modules/native-watchdog/index.js`

```javascript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AIX PowerPC compatibility stub for native-watchdog
// Original module monitors a process and can kill it, but we can't compile the native part for AIX

var hasStarted = false;
var monitoredPid = null;

exports.start = function(pid) {
    if (typeof pid !== 'number' || Math.round(pid) !== pid) {
        throw new Error(`Expected integer pid!`);
    }
    if (hasStarted) {
        throw new Error(`Can only monitor a single process!`);
    }
    hasStarted = true;
    monitoredPid = pid;
    // In the real implementation, this would start monitoring the process
    // For AIX compatibility, we just track the state
};

exports.exit = function(code) {
    // In the real implementation, this would force exit the monitored process
    // For AIX compatibility, we just reset our state
    hasStarted = false;
    monitoredPid = null;
    // We don't actually exit since this is just a stub
};
```

### Step 5: Apply Patches and Restart

```bash
# Backup original files (optional)
cp ~/.vscodium-server/bin/*/node_modules/@vscode/deviceid/dist/index.js{,.backup}
cp ~/.vscodium-server/bin/*/node_modules/@vscode/deviceid/dist/storage.js{,.backup}
cp ~/.vscodium-server/bin/*/node_modules/native-watchdog/index.js{,.backup}

# Apply the patches above...

# Kill existing VSCodium server processes
pkill -f "vscode\|vscodium" 2>/dev/null || true

# Clean temporary files
rm -rf /tmp/*vscode* /tmp/*vscodium* 2>/dev/null || true

# Reconnect from your VSCodium client
echo " Ready to reconnect from VSCodium client!"
```

##  Verification Tests

Test each module individually to ensure patches work:

```bash
# Test deviceid
cd ~/.vscodium-server/bin/*/node_modules/@vscode/deviceid/dist
node -e "const deviceid = require('./index.js'); console.log(' deviceid OK');"

# Test storage
node -e "const storage = require('./storage.js'); console.log(' storage OK');"

# Test watchdog
cd ~/.vscodium-server/bin/*/node_modules/native-watchdog
node -e "const wd = require('./index.js'); wd.start(process.pid); wd.exit(0); console.log(' watchdog OK');"

# Test node-spdlog (if you built it)
cd ~/path/to/node-spdlog
node -e "const spdlog = require('./index.js'); console.log(' spdlog OK');"
```

##  Quick Setup Script

Create this script for faster setup on new AIX systems:

```bash
#!/bin/bash
# aix-vscodium-setup.sh

set -e

echo " Setting up VSCodium for AIX PowerPC..."

# Set environment variables
export CXXFLAGS="-ftls-model=global-dynamic -fPIC -pthread"
export CFLAGS="-ftls-model=global-dynamic -fPIC -pthread"

# Find VSCodium server directory
VSCODE_DIR=$(find ~/.vscodium-server ~/.vscode-server -name "node_modules" -type d 2>/dev/null | head -1)
if [ -z "$VSCODE_DIR" ]; then
    echo " VSCodium server not found. Please connect once first."
    exit 1
fi

echo "File Found VSCodium at: $VSCODE_DIR"

# Patch deviceid index.js
DEVICEID_INDEX="$VSCODE_DIR/@vscode/deviceid/dist/index.js"
if [ -f "$DEVICEID_INDEX" ]; then
    echo " Patching deviceid index.js..."
    sed -i 's/process.platform !== "linux"/process.platform !== "linux" \&\& process.platform !== "aix"/g' "$DEVICEID_INDEX"
fi

# Patch deviceid storage.js
DEVICEID_STORAGE="$VSCODE_DIR/@vscode/deviceid/dist/storage.js"
if [ -f "$DEVICEID_STORAGE" ]; then
    echo " Patching deviceid storage.js..."
    sed -i 's/process.platform === "linux"/process.platform === "linux" || process.platform === "aix"/g' "$DEVICEID_STORAGE"
fi

# Create watchdog stub
WATCHDOG_INDEX="$VSCODE_DIR/native-watchdog/index.js"
if [ -f "$WATCHDOG_INDEX" ]; then
    echo " Creating watchdog stub..."
    cat > "$WATCHDOG_INDEX" << 'EOF'
var hasStarted = false;
var monitoredPid = null;
exports.start = function(pid) {
    if (typeof pid !== 'number' || Math.round(pid) !== pid) {
        throw new Error(`Expected integer pid!`);
    }
    if (hasStarted) {
        throw new Error(`Can only monitor a single process!`);
    }
    hasStarted = true;
    monitoredPid = pid;
};
exports.exit = function(code) {
    hasStarted = false;
    monitoredPid = null;
};
EOF
fi

echo " VSCodium AIX patches applied successfully!"
echo " Please restart VSCodium server (disconnect and reconnect)"
```

## 📋 Troubleshooting

### Common Issues

1. **"No such file or directory" for headers**
   - Ensure git submodules are initialized: `git submodule update --init --recursive`

2. **"local-exec model was used for thread-local storage"**
   - Set the environment variables: `export CXXFLAGS="-ftls-model=global-dynamic -fPIC -pthread"`

3. **"Unsupported platform" errors**
   - Apply the platform detection patches for deviceid module

4. **"Cannot load module *.node - invalid format"**
   - Create compatibility stubs for incompatible native modules

5. **Terminal still not working**
   - Check server logs: `tail ~/.vscodium-server/bin/*/logs/*.log`
   - Verify all patches applied correctly

### System Requirements

- IBM AIX 7.x on PowerPC64
- Node.js 18+ compiled for AIX PowerPC
- GCC compiler with C++11 support
- Git with submodule support

##  Key Insights

1. **TLS Model**: AIX requires `global-dynamic` TLS model for shared libraries
2. **Platform Detection**: Most Node.js modules only check for `win32`, `darwin`, `linux`
3. **Architecture Compatibility**: Pre-compiled x86-64 binaries don't work on PowerPC
4. **Git Submodules**: Critical for native modules with C++ dependencies
5. **Graceful Degradation**: Non-critical modules can be stubbed out safely

##  Contributing

If you find additional compatibility issues or improvements:

1. Test on your AIX system
2. Document the issue and solution
3. Update this guide
4. Share with the community

##  License

This guide is provided under MIT License. Use at your own risk and test thoroughly in your environment.

---

**Note**: This guide is specifically for AIX PowerPC systems. For other Unix variants, some steps may differ.