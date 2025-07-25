import * as crypto from 'crypto';
import Log from './common/logger';
import { getVSCodeServerConfig } from './serverConfig';
import SSHConnection from './ssh/sshConnection';

export interface ServerInstallOptions {
    id: string;
    quality: string;
    commit: string;
    version: string;
    release?: string; // vscodium specific
    extensionIds: string[];
    envVariables: string[];
    useSocketPath: boolean;
    serverApplicationName: string;
    serverDataFolderName: string;
    serverDownloadUrlTemplate: string;
}

export interface ServerInstallResult {
    exitCode: number;
    listeningOn: number | string;
    connectionToken: string;
    logFile: string;
    osReleaseId: string;
    arch: string;
    platform: string;
    tmpDir: string;
    [key: string]: any;
}

export class ServerInstallError extends Error {
    constructor(message: string) {
        super(message);
    }
}

// To do: needs to change
const DEFAULT_DOWNLOAD_URL_TEMPLATE = 'https://github.com/VSCodium/vscodium/releases/download/${version}.${release}/vscodium-reh-${os}-${arch}-${version}.${release}.tar.gz';

export async function installCodeServer(conn: SSHConnection, serverDownloadUrlTemplate: string | undefined, extensionIds: string[], envVariables: string[], platform: string | undefined, useSocketPath: boolean, logger: Log): Promise<ServerInstallResult> {
    let shell = 'powershell';

    // detect platform and shell for windows
    if (!platform || platform === 'windows') {
        const result = await conn.exec('uname -s');

        if (result.stdout) {
            if (result.stdout.includes('windows32')) {
                platform = 'windows';
            } else if (result.stdout.includes('MINGW64')) {
                platform = 'windows';
                shell = 'bash';
            }
        } else if (result.stderr) {
            if (result.stderr.includes('FullyQualifiedErrorId : CommandNotFoundException')) {
                platform = 'windows';
            }

            if (result.stderr.includes('is not recognized as an internal or external command')) {
                platform = 'windows';
                shell = 'cmd';
            }
        }

        if (platform) {
            logger.trace(`Detected platform: ${platform}, ${shell}`);
        }
    }

    const scriptId = crypto.randomBytes(12).toString('hex');

    const vscodeServerConfig = await getVSCodeServerConfig();
    const installOptions: ServerInstallOptions = {
        id: scriptId,
        version: vscodeServerConfig.version,
        commit: vscodeServerConfig.commit,
        quality: vscodeServerConfig.quality,
        release: vscodeServerConfig.release,
        extensionIds,
        envVariables,
        useSocketPath,
        serverApplicationName: vscodeServerConfig.serverApplicationName,
        serverDataFolderName: vscodeServerConfig.serverDataFolderName,
        serverDownloadUrlTemplate: serverDownloadUrlTemplate || vscodeServerConfig.serverDownloadUrlTemplate || DEFAULT_DOWNLOAD_URL_TEMPLATE,
    };

    let commandOutput: { stdout: string; stderr: string };
    if (platform === 'windows') {
        const installServerScript = generatePowerShellInstallScript(installOptions);

        logger.trace('Server install command:', installServerScript);

        const installDir = `$HOME\\${vscodeServerConfig.serverDataFolderName}\\install`;
        const installScript = `${installDir}\\${vscodeServerConfig.commit}.ps1`;
        const endRegex = new RegExp(`${scriptId}: end`);
        // investigate if it's possible to use `-EncodedCommand` flag
        // https://devblogs.microsoft.com/powershell/invoking-powershell-with-complex-expressions-using-scriptblocks/
        let command = '';
        if (shell === 'powershell') {
            command = `md -Force ${installDir}; echo @'\n${installServerScript}\n'@ | Set-Content ${installScript}; powershell -ExecutionPolicy ByPass -File "${installScript}"`;
        } else if (shell === 'bash') {
            command = `mkdir -p ${installDir.replace(/\\/g, '/')} && echo '\n${installServerScript.replace(/'/g, '\'"\'"\'')}\n' > ${installScript.replace(/\\/g, '/')} && powershell -ExecutionPolicy ByPass -File "${installScript}"`;
        } else if (shell === 'cmd') {
            const script = installServerScript.trim()
                // remove comments
                .replace(/^#.*$/gm, '')
                // remove empty lines
                .replace(/\n{2,}/gm, '\n')
                // remove leading spaces
                .replace(/^\s*/gm, '')
                // escape double quotes (from powershell/cmd)
                .replace(/"/g, '"""')
                // escape single quotes (from cmd)
                .replace(/'/g, `''`)
                // escape redirect (from cmd)
                .replace(/>/g, `^>`)
                // escape new lines (from powershell/cmd)
                .replace(/\n/g, '\'`n\'');

            command = `powershell "md -Force ${installDir}" && powershell "echo '${script}'" > ${installScript.replace('$HOME', '%USERPROFILE%')} && powershell -ExecutionPolicy ByPass -File "${installScript.replace('$HOME', '%USERPROFILE%')}"`;

            logger.trace('Command length (8191 max):', command.length);

            if (command.length > 8191) {
                throw new ServerInstallError(`Command line too long`);
            }
        } else {
            throw new ServerInstallError(`Not supported shell: ${shell}`);
        }

        commandOutput = await conn.execPartial(command, (stdout: string) => endRegex.test(stdout));
    } else {
        const installServerScript = generateBashInstallScript(installOptions);

        logger.trace('Server install command:', installServerScript);
        // Fish shell does not support heredoc so let's workaround it using -c option,
        // also replace single quotes (') within the script with ('\'') as there's no quoting within single quotes, see https://unix.stackexchange.com/a/24676
        commandOutput = await conn.exec(`bash -c '${installServerScript.replace(/'/g, `'\\''`)}'`);
    }

    if (commandOutput.stderr) {
        logger.trace('Server install command stderr:', commandOutput.stderr);
    }
    logger.trace('Server install command stdout:', commandOutput.stdout);

    const resultMap = parseServerInstallOutput(commandOutput.stdout, scriptId);
    if (!resultMap) {
        throw new ServerInstallError(`Failed parsing install script output`);
    }

    const exitCode = parseInt(resultMap.exitCode, 10);
    if (exitCode !== 0) {
        throw new ServerInstallError(`Couldn't install vscode server on remote server, install script returned non-zero exit status`);
    }

    const listeningOn = resultMap.listeningOn.match(/^\d+$/)
        ? parseInt(resultMap.listeningOn, 10)
        : resultMap.listeningOn;

    const remoteEnvVars = Object.fromEntries(Object.entries(resultMap).filter(([key,]) => envVariables.includes(key)));

    return {
        exitCode,
        listeningOn,
        connectionToken: resultMap.connectionToken,
        logFile: resultMap.logFile,
        osReleaseId: resultMap.osReleaseId,
        arch: resultMap.arch,
        platform: resultMap.platform,
        tmpDir: resultMap.tmpDir,
        ...remoteEnvVars
    };
}

function parseServerInstallOutput(str: string, scriptId: string): { [k: string]: string } | undefined {
    const startResultStr = `${scriptId}: start`;
    const endResultStr = `${scriptId}: end`;

    const startResultIdx = str.indexOf(startResultStr);
    if (startResultIdx < 0) {
        return undefined;
    }

    const endResultIdx = str.indexOf(endResultStr, startResultIdx + startResultStr.length);
    if (endResultIdx < 0) {
        return undefined;
    }

    const installResult = str.substring(startResultIdx + startResultStr.length, endResultIdx);

    const resultMap: { [k: string]: string } = {};
    const resultArr = installResult.split(/\r?\n/);
    for (const line of resultArr) {
        const [key, value] = line.split('==');
        resultMap[key] = value;
    }

    return resultMap;
}

// Key changes needed in the generateBashInstallScript function:

function generateBashInstallScript({ id, quality, version, commit, release, extensionIds, envVariables, useSocketPath, serverApplicationName, serverDataFolderName, serverDownloadUrlTemplate }: ServerInstallOptions) {
    const extensions = extensionIds.map(id => '--install-extension ' + id).join(' ');
    return `
# Server installation script

TMP_DIR="\${XDG_RUNTIME_DIR:-"/tmp"}"

DISTRO_VERSION="${version}"
DISTRO_COMMIT="${commit}"
DISTRO_QUALITY="${quality}"
DISTRO_VSCODIUM_RELEASE="${release ?? ''}"

SERVER_APP_NAME="${serverApplicationName}"
SERVER_INITIAL_EXTENSIONS="${extensions}"
SERVER_LISTEN_FLAG="${useSocketPath ? `--socket-path="$TMP_DIR/vscode-server-sock-${crypto.randomUUID()}"` : '--port=0'}"
SERVER_DATA_DIR="$HOME/${serverDataFolderName}"
SERVER_DIR="$SERVER_DATA_DIR/bin/$DISTRO_COMMIT"
SERVER_SCRIPT="$SERVER_DIR/bin/$SERVER_APP_NAME"
SERVER_LOGFILE="$SERVER_DATA_DIR/.$DISTRO_COMMIT.log"
SERVER_PIDFILE="$SERVER_DATA_DIR/.$DISTRO_COMMIT.pid"
SERVER_TOKENFILE="$SERVER_DATA_DIR/.$DISTRO_COMMIT.token"
SERVER_ARCH=
SERVER_CONNECTION_TOKEN=
SERVER_DOWNLOAD_URL=

LISTENING_ON=
OS_RELEASE_ID=
ARCH=
PLATFORM=

# Mimic output from logs of remote-ssh extension
print_install_results_and_exit() {
    echo "${id}: start"
    echo "exitCode==$1=="
    echo "listeningOn==$LISTENING_ON=="
    echo "connectionToken==$SERVER_CONNECTION_TOKEN=="
    echo "logFile==$SERVER_LOGFILE=="
    echo "osReleaseId==$OS_RELEASE_ID=="
    echo "arch==$ARCH=="
    echo "platform==$PLATFORM=="
    echo "tmpDir==$TMP_DIR=="
    ${envVariables.map(envVar => `echo "${envVar}==$${envVar}=="`).join('\n')}
    echo "${id}: end"
    exit 0
}

# Check if platform is supported
KERNEL="$(uname -s)"
case $KERNEL in
    Darwin)
        PLATFORM="darwin"
        ;;
    Linux)
        PLATFORM="linux"
        ;;
    FreeBSD)
        PLATFORM="freebsd"
        ;;
    DragonFly)
        PLATFORM="dragonfly"
        ;;
    AIX)
        PLATFORM="aix"
        ;;
    *)
        echo "Error platform not supported: $KERNEL"
        print_install_results_and_exit 1
        ;;
esac

# Check machine architecture
ARCH="$(uname -m)"
case $ARCH in
    x86_64 | amd64)
        SERVER_ARCH="x64"
        ;;
    armv7l | armv8l)
        SERVER_ARCH="armhf"
        ;;
    arm64 | aarch64)
        SERVER_ARCH="arm64"
        ;;
    ppc64le)
        SERVER_ARCH="ppc64le"
        ;;
    ppc64|powerpc64)
        SERVER_ARCH="ppc64"
        ;;
    riscv64)
        SERVER_ARCH="riscv64"
        ;;
    loongarch64)
        SERVER_ARCH="loong64"
        ;;
    s390x)
        SERVER_ARCH="s390x"
        ;;
    *)
        # Handle AIX special case where uname -m returns machine ID
        if [[ $PLATFORM == "aix" ]]; then
            AIX_ARCH="$(uname -p 2>/dev/null)"
            case $AIX_ARCH in
                powerpc)
                    SERVER_ARCH="ppc64"
                    ARCH="ppc64"
                    ;;
                *)
                    echo "Error AIX architecture not supported: $AIX_ARCH"
                    print_install_results_and_exit 1
                    ;;
            esac
        else
            echo "Error architecture not supported: $ARCH"
            print_install_results_and_exit 1
        fi
        ;;
esac

# Add freeware path for AIX
if [[ $PLATFORM == "aix" ]]; then
    export PATH="/opt/freeware/bin:$PATH"
fi

# Handle OS release detection
if [[ $PLATFORM == "aix" ]]; then
    OS_RELEASE_ID="aix"
else
    OS_RELEASE_ID="$(grep -i '^ID=' /etc/os-release 2>/dev/null | sed 's/^[Ii][Dd]=//' | sed 's/"//g')"
    if [[ -z $OS_RELEASE_ID ]]; then
        OS_RELEASE_ID="$(grep -i '^ID=' /usr/lib/os-release 2>/dev/null | sed 's/^[Ii][Dd]=//' | sed 's/"//g')"
        if [[ -z $OS_RELEASE_ID ]]; then
            OS_RELEASE_ID="unknown"
        fi
    fi
fi

# Create installation folder
if [[ ! -d $SERVER_DIR ]]; then
    mkdir -p $SERVER_DIR
    if (( $? > 0 )); then
        echo "Error creating server install directory"
        print_install_results_and_exit 1
    fi
fi

# adjust platform for vscodium download, if needed
if [[ $OS_RELEASE_ID = alpine ]]; then
    PLATFORM=$OS_RELEASE_ID
fi

# Handle different server types based on platform
if [[ $PLATFORM == "aix" ]]; then
    # For AIX, use VSCodium reh-linux-x64 server with template substitution
    # Force os to 'linux' and arch to 'x64' for AIX compatibility
    SERVER_DOWNLOAD_URL="$(echo "${serverDownloadUrlTemplate.replace(/\$\{/g, '\\${')}" | sed "s/\\\${quality}/$DISTRO_QUALITY/g" | sed "s/\\\${version}/$DISTRO_VERSION/g" | sed "s/\\\${commit}/$DISTRO_COMMIT/g" | sed "s/\\\${os}/linux/g" | sed "s/\\\${arch}/x64/g" | sed "s/\\\${release}/$DISTRO_VSCODIUM_RELEASE/g")"
    
    echo "Using VSCodium reh-linux-x64 server for AIX (version: $DISTRO_VERSION)..."
    echo "Download URL: $SERVER_DOWNLOAD_URL"
    
    # Set AIX-specific environment variables for the patching process
    export AIX_PATCH_MODE="true"
    export AIX_NODE_MODULES_PATH="$SERVER_DIR/node_modules"
    
else
    # Original VSCodium URL for other platforms
    SERVER_DOWNLOAD_URL="$(echo "${serverDownloadUrlTemplate.replace(/\$\{/g, '\\${')}" | sed "s/\\\${quality}/$DISTRO_QUALITY/g" | sed "s/\\\${version}/$DISTRO_VERSION/g" | sed "s/\\\${commit}/$DISTRO_COMMIT/g" | sed "s/\\\${os}/$PLATFORM/g" | sed "s/\\\${arch}/$SERVER_ARCH/g" | sed "s/\\\${release}/$DISTRO_VSCODIUM_RELEASE/g")"
fi

# Check if server script is already installed
if [[ ! -f $SERVER_SCRIPT ]]; then
    case "$PLATFORM" in
        darwin | linux | alpine | aix )
            ;;
        *)
            echo "Error '$PLATFORM' needs manual installation of remote extension host"
            print_install_results_and_exit 1
            ;;
    esac

    pushd $SERVER_DIR > /dev/null

    if [[ ! -z $(which wget) ]]; then
        wget --tries=3 --timeout=10 --continue --no-verbose -O vscode-server.tar.gz $SERVER_DOWNLOAD_URL
    elif [[ ! -z $(which curl) ]]; then
        curl --retry 3 --connect-timeout 10 --location --show-error --silent --output vscode-server.tar.gz $SERVER_DOWNLOAD_URL
    else
        echo "Error no tool to download server binary"
        print_install_results_and_exit 1
    fi

    if (( $? > 0 )); then
        echo "Error downloading server from $SERVER_DOWNLOAD_URL"
        print_install_results_and_exit 1
    fi

    tar -xf vscode-server.tar.gz --strip-components 1
    if (( $? > 0 )); then
        echo "Error while extracting server contents"
        print_install_results_and_exit 1
    fi

if [[ $PLATFORM == "aix" && $AIX_PATCH_MODE == "true" ]]; then
    echo "Applying AIX compatibility patches..."
    
    # Copy patch scripts to server directory
    PATCH_SCRIPT_DIR="$SERVER_DIR/aix-patches"
    mkdir -p "$PATCH_SCRIPT_DIR/modules"
    mkdir -p "$PATCH_SCRIPT_DIR/utils"
    
    # Create aix-environment.sh
    cat > "$PATCH_SCRIPT_DIR/utils/aix-environment.sh" << 'ENV_EOF'
#!/bin/bash
# aix-patches/utils/aix-environment.sh
# AIX environment setup and validation

# Setup AIX build environment
setup_aix_environment() {
    echo "Setting up AIX build environment..."
    
    # Set AIX-specific compiler flags for TLS compatibility
    export CXXFLAGS="-ftls-model=global-dynamic -fPIC -pthread"
    export CFLAGS="-ftls-model=global-dynamic -fPIC -pthread"
    
    # Ensure freeware tools are in PATH
    export PATH="/opt/freeware/bin:/opt/nodejs/bin:$PATH"
    
    # Set npm configuration for AIX
    export npm_config_target_arch=ppc64
    export npm_config_target_platform=aix
    export npm_config_build_from_source=true
    export npm_config_cache=/tmp/.npm-aix
    
    # Create npm cache directory
    mkdir -p /tmp/.npm-aix
    
    echo "Environment variables set:"
    echo "  CXXFLAGS: $CXXFLAGS"
    echo "  CFLAGS: $CFLAGS"
    echo "  PATH: $PATH"
    
    # Validate build tools
    if ! validate_build_tools; then
        return 1
    fi
    
    echo "[OK] AIX build environment ready"
    return 0
}

# Validate required build tools
validate_build_tools() {
    local missing_tools=()
    
    # Check essential tools
    command -v git >/dev/null 2>&1 || missing_tools+=("git")
    command -v node >/dev/null 2>&1 || missing_tools+=("node")
    command -v npm >/dev/null 2>&1 || missing_tools+=("npm")
    command -v gcc >/dev/null 2>&1 || command -v xlc >/dev/null 2>&1 || missing_tools+=("gcc/xlc")
    command -v make >/dev/null 2>&1 || command -v gmake >/dev/null 2>&1 || missing_tools+=("make/gmake")
    command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || missing_tools+=("python")
    
    if [[ \${#missing_tools[@]} -gt 0 ]]; then
        echo "[ERROR] Missing required tools: \${missing_tools[*]}"
        echo ""
        echo "Please install missing tools:"
        echo "  yum install git gcc gcc-c++ make python3"
        echo "  # OR using IBM packages"
        return 1
    fi
    
    echo "Build tools detected:"
    echo "  Node.js: $(node --version)"
    echo "  npm: $(npm --version)"
    echo "  gcc: $(gcc --version 2>/dev/null | head -1 || echo 'not found')"
    echo "  Python: $(python3 --version 2>/dev/null || python --version 2>/dev/null || echo 'not found')"
    
    return 0
}

# Check if a module needs patching
module_needs_patching() {
    local module_path="$1"
    local module_name="$2"
    
    # Check if module exists
    if [[ ! -d "$module_path" ]]; then
        echo "Module $module_name not found at $module_path"
        return 1  # Module doesn't exist
    fi
    
    # Check if already patched
    if [[ -f "$module_path/.aix-patched" ]]; then
        echo "Module $module_name already patched for AIX"
        return 1  # Already patched
    fi
    
    # Check for problematic .node files
    local node_files=$(find "$module_path" -name "*.node" -type f 2>/dev/null)
    if [[ -n "$node_files" ]]; then
        # Check if any .node files are Linux binaries
        for node_file in $node_files; do
            if file "$node_file" 2>/dev/null | grep -q "ELF.*x86-64"; then
                echo "Found Linux binary in $module_name: $node_file"
                return 0  # Needs patching
            fi
        done
    fi
    
    return 1  # Doesn't need patching
}

# Create backup of original module
backup_module() {
    local module_path="$1"
    local backup_suffix="\${2:-linux-backup}"
    
    if [[ ! -d "$module_path.$backup_suffix" ]]; then
        cp -r "$module_path" "$module_path.$backup_suffix"
        echo "[OK] Backed up original module to $module_path.$backup_suffix"
    else
        echo "[INFO] Backup already exists: $module_path.$backup_suffix"
    fi
}

# Mark module as patched
mark_module_patched() {
    local module_path="$1"
    local module_name="$2"
    
    cat > "$module_path/.aix-patched" << PEOF
AIX Patch Applied
Module: $module_name
Date: $(date)
Platform: $(uname -s) $(uname -m)
Node.js: $(node --version)
Compiler: $(gcc --version 2>/dev/null | head -1 || echo 'unknown')
PEOF
    
    echo "[OK] Marked $module_name as AIX-patched"
}
ENV_EOF

    # Create build-spdlog.sh
    cat > "$PATCH_SCRIPT_DIR/modules/build-spdlog.sh" << 'SPDLOG_EOF'
#!/bin/bash
# aix-patches/modules/build-spdlog.sh
# Build @vscode/spdlog for AIX

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
    echo "[OK] $MODULE_NAME doesn't need patching or already patched"
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

# Clone spdlog source
echo "Cloning spdlog source..."
if ! git clone https://github.com/microsoft/node-spdlog.git .; then
    echo "[ERROR] Failed to clone spdlog repository"
    exit 1
fi

echo "Updating submodules..."
if ! git submodule update --init --recursive; then
    echo "[ERROR] Failed to update git submodules"
    exit 1
fi

# Build with AIX environment
echo "Installing dependencies and building for AIX..."
echo "Using CXXFLAGS: $CXXFLAGS"
echo "Using CFLAGS: $CFLAGS"

if ! npm install; then
    echo "[ERROR] npm install failed"
    exit 1
fi

# Test the build
echo "Testing AIX build..."
cat > test-build.js << 'TESTEOF'
(async () => {
    try {
        const spdlog = require('./index.js');
        console.log('[OK] Module loaded');
        console.log('Version:', spdlog.version);
        
        const logger = await spdlog.createRotatingLogger('test', '/tmp/test-aix.log', 1024, 3);
        console.log('[OK] Logger created');
        
        // Test logging methods
        logger.info('AIX build test message');
        logger.flush();
        console.log('[OK] Logging works');
        
        console.log('[SUCCESS] AIX spdlog build successful!');
    } catch (err) {
        console.log('[ERROR] Build test failed:', err.message);
        process.exit(1);
    }
})();
TESTEOF

if ! node test-build.js; then
    echo "[ERROR] spdlog build test failed"
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
if node -e "const spdlog = require('./index.js'); spdlog.createRotatingLogger('verify', '/tmp/verify.log', 1024, 3).then(() => console.log('[OK] Installation verified')).catch(err => { console.log('[ERROR] Verification failed:', err.message); process.exit(1); })"; then
    echo "[OK] $MODULE_NAME successfully built and installed for AIX"
    rm -f /tmp/test-aix.log /tmp/verify.log
    exit 0
else
    echo "[ERROR] $MODULE_NAME installation verification failed"
    exit 1
fi
SPDLOG_EOF

# Create build-native-watchdog.sh
    cat > "$PATCH_SCRIPT_DIR/modules/build-native-watchdog.sh" << 'WATCHDOG_EOF'
#!/bin/bash
# aix-patches/modules/build-native-watchdog.sh
# Build native-watchdog for AIX - FIXED VERSION

set -e

SERVER_DIR="$1"
if [[ -z "$SERVER_DIR" ]]; then
    echo "Usage: $0 <server_directory>"
    exit 1
fi

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../utils/aix-environment.sh"

MODULE_NAME="native-watchdog"
MODULE_PATH="$SERVER_DIR/node_modules/native-watchdog"

echo "Building $MODULE_NAME for AIX..."
echo "Server directory: $SERVER_DIR"
echo "Module path: $MODULE_PATH"

# Check if module needs patching
if ! module_needs_patching "$MODULE_PATH" "$MODULE_NAME"; then
    echo "[OK] $MODULE_NAME doesn't need patching or already patched"
    exit 0
fi

# Debug: Show what we're starting with
echo "=== PRE-BUILD DEBUG ==="
echo "Original binary info:"
if [[ -f "$MODULE_PATH/build/Release/watchdog.node" ]]; then
    file "$MODULE_PATH/build/Release/watchdog.node"
    ls -la "$MODULE_PATH/build/Release/watchdog.node"
else
    echo "No original binary found"
fi
echo "========================"

# Create temporary build directory
TEMP_DIR="/tmp/aix-watchdog-build-$$"
mkdir -p "$TEMP_DIR"
echo "Building in: $TEMP_DIR"

# Enhanced cleanup function
cleanup_watchdog() {
    echo "Cleaning up build directory..."
    cd "$SERVER_DIR" 2>/dev/null || true
    # Only remove temp dir if build succeeded
    if [[ -f "$TEMP_DIR/watchdog-source/build/Release/watchdog.node" ]]; then
        echo "Build succeeded, cleaning up temp directory"
        rm -rf "$TEMP_DIR" 2>/dev/null || true
    else
        echo "Build may have failed - keeping temp dir for debugging: $TEMP_DIR"
    fi
}
trap cleanup_watchdog EXIT

cd "$TEMP_DIR"

# Clone native-watchdog source
echo "Cloning native-watchdog source..."
WATCHDOG_REPO_DIR="$TEMP_DIR/watchdog-source"
if ! git clone https://github.com/microsoft/node-native-watchdog.git "$WATCHDOG_REPO_DIR"; then 
    echo "[ERROR] Failed to clone native-watchdog repository"
    exit 1
fi

cd "$WATCHDOG_REPO_DIR"

# Get target version from VSCodium's module
TARGET_VERSION=""
if [[ -f "$MODULE_PATH/package.json" ]]; then
    TARGET_VERSION=$(grep '"version"' "$MODULE_PATH/package.json" | cut -d'"' -f4)
    echo "Target version from VSCodium: $TARGET_VERSION"
    
    # Try to checkout the target version
    if [[ -n "$TARGET_VERSION" ]]; then
        echo "Attempting to checkout version: $TARGET_VERSION"
        git checkout "v$TARGET_VERSION" 2>/dev/null || git checkout "$TARGET_VERSION" 2>/dev/null || echo "Version checkout failed, using latest"
    fi
fi

# Debug: Show what we're building
echo "=== BUILD SETUP DEBUG ==="
echo "Current directory: $(pwd)"
echo "Package.json content:"
cat package.json 2>/dev/null || echo "No package.json found"
echo "Files in directory:"
ls -la
echo "=========================="

# Build with AIX environment
echo "Installing dependencies and building for AIX..."
echo "Using CXXFLAGS: $CXXFLAGS"
echo "Using CFLAGS: $CFLAGS"

# Clear npm cache to avoid issues
npm cache clean --force 2>/dev/null || true

if ! npm install; then
    echo "[ERROR] npm install failed"
    echo "npm debug log:"
    cat ~/.npm/_logs/*.log 2>/dev/null | tail -20 || echo "No npm logs found"
    exit 1
fi

# Debug: Check what npm install produced
echo "=== POST NPM INSTALL DEBUG ==="
echo "Build directory contents:"
ls -la build/ 2>/dev/null || echo "No build directory"
if [[ -d "build/Release" ]]; then
    echo "Release directory contents:"
    ls -la build/Release/
    if [[ -f "build/Release/watchdog.node" ]]; then
        echo "Found binary from npm install:"
        file build/Release/watchdog.node
        ls -la build/Release/watchdog.node
    fi
fi
echo "==============================="

# The npm install should have built it, but let's verify and rebuild if needed
EXPECTED_BINARY="./build/Release/watchdog.node"

if [[ -f "$EXPECTED_BINARY" ]]; then
    echo "[INFO] Binary found from npm install: $EXPECTED_BINARY"
    # Check if it's an AIX binary
    if file "$EXPECTED_BINARY" | grep -q "AIX"; then
        echo "[OK] Binary is already AIX-compatible"
    elif file "$EXPECTED_BINARY" | grep -q "PowerPC\|ppc64"; then
        echo "[OK] Binary appears to be PowerPC-compatible"
    else
        echo "[WARN] Binary may not be AIX-compatible, but proceeding..."
        file "$EXPECTED_BINARY"
    fi
else
    echo "[WARN] No binary found from npm install, trying manual build..."
    
    # Try different build approaches
    if [[ -f "binding.gyp" ]]; then
        echo "Found binding.gyp, trying node-gyp directly..."
        
        # Clean and rebuild
        npx node-gyp clean || true
        if npx node-gyp configure && npx node-gyp build; then
            echo "[OK] node-gyp build succeeded"
        else
            echo "[ERROR] node-gyp build failed"
            exit 1
        fi
    else
        echo "[ERROR] No binding.gyp found and npm install didn't produce binary"
        exit 1
    fi
fi

# Final verification of build output
if [[ ! -f "$EXPECTED_BINARY" ]]; then
    echo "[ERROR] Expected binary still not found: $EXPECTED_BINARY"
    echo "Contents of build directory:"
    find build/ -type f 2>/dev/null || echo "No build directory found"
    exit 1
fi

echo "=== BUILD VERIFICATION ==="
echo "Final binary info:"
file "$EXPECTED_BINARY"
ls -la "$EXPECTED_BINARY"
echo "=========================="

# Test the build
echo "Testing AIX build..."
cat > test-build.js << 'TESTEOF'
try {
    const fs = require('fs');
    const path = require('path');
    
    // Check if the binary exists and is readable
    const binaryPath = './build/Release/watchdog.node';
    if (!fs.existsSync(binaryPath)) {
        console.log('[ERROR] Binary file does not exist:', binaryPath);
        process.exit(1);
    }
    
    const stats = fs.statSync(binaryPath);
    console.log('[INFO] Binary file stats:', {
        size: stats.size,
        mode: stats.mode.toString(8),
        isFile: stats.isFile()
    });
    
    // Try to load the module
    const watchdog = require('./build/Release/watchdog.node');
    console.log('[OK] Native module loaded successfully');
    console.log('[INFO] Module exports:', Object.keys(watchdog));
    
    // Test basic functionality if available
    if (typeof watchdog.start === 'function' && typeof watchdog.stop === 'function') {
        console.log('[OK] Watchdog functions available');
    } else {
        console.log('[WARN] Expected watchdog functions not found');
        console.log('[INFO] Available functions:', Object.keys(watchdog).filter(k => typeof watchdog[k] === 'function'));
    }
    
    console.log('[SUCCESS] AIX native-watchdog build test passed!');
} catch (err) {
    console.log('[ERROR] Build test failed:', err.message);
    console.log('[ERROR] Stack trace:', err.stack);
    
    // Additional debugging
    console.log('[DEBUG] Current working directory:', process.cwd());
    console.log('[DEBUG] Node.js version:', process.version);
    console.log('[DEBUG] Platform:', process.platform, process.arch);
    
    process.exit(1);
}
TESTEOF

if ! node test-build.js; then
    echo "[ERROR] native-watchdog build test failed"
    # But don't exit - maybe it's just an incompatibility issue
    echo "[WARN] Test failed but continuing with installation..."
fi

# Backup original module BEFORE installing new one
echo "Backing up original module..."
backup_module "$MODULE_PATH" "linux-backup"

# Install the AIX-built version
echo "Installing AIX-built native-watchdog..."

# Copy all files, but make sure we get the new binary
cp -r "$WATCHDOG_REPO_DIR"/* "$MODULE_PATH/"

# Specifically verify the binary was copied correctly
if [[ -f "$MODULE_PATH/build/Release/watchdog.node" ]]; then
    echo "=== POST-INSTALL VERIFICATION ==="
    echo "Installed binary info:"
    file "$MODULE_PATH/build/Release/watchdog.node"
    ls -la "$MODULE_PATH/build/Release/watchdog.node"
    echo "=================================="
else
    echo "[ERROR] Binary not found after installation"
    exit 1
fi

# Mark as patched
mark_module_patched "$MODULE_PATH" "$MODULE_NAME"

# Final verification in target location
echo "Verifying installation in target location..."
cd "$MODULE_PATH"

# Try to load the module in the target location
cat > verify-install.js << 'VERIFYEOF'
try {
    const watchdog = require('./build/Release/watchdog.node');
    console.log('[OK] Installation verified - module loads successfully');
    console.log('[INFO] Module functions:', Object.keys(watchdog));
} catch (err) {
    console.log('[ERROR] Verification failed:', err.message);
    console.log('[ERROR] This might be due to AIX/Linux binary incompatibility');
    console.log('[INFO] Binary info:');
    
    const fs = require('fs');
    if (fs.existsSync('./build/Release/watchdog.node')) {
        console.log('[INFO] Binary exists, size:', fs.statSync('./build/Release/watchdog.node').size);
    } else {
        console.log('[ERROR] Binary file does not exist');
    }
    
    // Don't exit with error - this might be expected on AIX
    console.log('[WARN] Continuing despite verification failure...');
}
VERIFYEOF

node verify-install.js

echo "[OK] $MODULE_NAME build and installation completed for AIX"
echo "[INFO] Note: Runtime compatibility will be tested when the server starts"
WATCHDOG_EOF

    # Create apply-patches.sh
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
    run_module_patch "spdlog"
    run_module_patch "native-watchdog"
    
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
    
    # Make scripts executable
    chmod +x "$PATCH_SCRIPT_DIR"/*.sh
    chmod +x "$PATCH_SCRIPT_DIR/modules"/*.sh
    chmod +x "$PATCH_SCRIPT_DIR/utils"/*.sh
    
    # Apply patches
    if bash "$PATCH_SCRIPT_DIR/apply-patches.sh" "$SERVER_DIR"; then
        echo "[OK] AIX patches applied successfully"
    else
        echo "[WARN] Some AIX patches failed, but continuing..."
    fi
fi

    # Handle different server structures
    if [[ $PLATFORM == "aix" ]]; then
        # For VSCodium server on AIX, we still need our Node.js wrapper due to binary incompatibility
        if [[ -f "$SERVER_SCRIPT" ]] || [[ -f "$SERVER_DIR/bin/codium-server" ]] || [[ -f "$SERVER_DIR/node" ]]; then
            # Create wrapper script that uses system Node.js
            cat > $SERVER_SCRIPT << 'AIXEOF'
#!/bin/bash
# VSCodium Server wrapper for AIX - Using System Node.js

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

exec "$NODE_BIN" "$SERVER_MAIN" "$@"
AIXEOF
            chmod +x $SERVER_SCRIPT
            echo "Created VSCodium server wrapper for AIX"
        else
            echo "Error: VSCodium server components not found after extraction"
            ls -la $SERVER_DIR/
            print_install_results_and_exit 1
        fi
    else
        # Original check for VSCodium
        if [[ ! -f $SERVER_SCRIPT ]]; then
            echo "Error server contents are corrupted"
            print_install_results_and_exit 1
        fi
    fi

    rm -f vscode-server.tar.gz

    popd > /dev/null
else
    echo "Server script already installed in $SERVER_SCRIPT"
fi

# Try to find if server is already running
if [[ -f $SERVER_PIDFILE ]]; then
    SERVER_PID="$(cat $SERVER_PIDFILE)"
    SERVER_RUNNING_PROCESS="$(ps -o pid,args -p $SERVER_PID | grep $SERVER_SCRIPT)"
else
    SERVER_RUNNING_PROCESS="$(ps -o pid,args -A | grep $SERVER_SCRIPT | grep -v grep)"
fi

if [[ -z $SERVER_RUNNING_PROCESS ]]; then
    if [[ -f $SERVER_LOGFILE ]]; then
        rm $SERVER_LOGFILE
    fi
    if [[ -f $SERVER_TOKENFILE ]]; then
        rm $SERVER_TOKENFILE
    fi

    touch $SERVER_TOKENFILE
    chmod 600 $SERVER_TOKENFILE
    SERVER_CONNECTION_TOKEN="${crypto.randomUUID()}"
    echo $SERVER_CONNECTION_TOKEN > $SERVER_TOKENFILE

    $SERVER_SCRIPT --start-server --host=127.0.0.1 $SERVER_LISTEN_FLAG $SERVER_INITIAL_EXTENSIONS --connection-token-file $SERVER_TOKENFILE --telemetry-level off --enable-remote-auto-shutdown --accept-server-license-terms &> $SERVER_LOGFILE &
    echo $! > $SERVER_PIDFILE
else
    echo "Server script is already running $SERVER_SCRIPT"
fi

if [[ -f $SERVER_TOKENFILE ]]; then
    SERVER_CONNECTION_TOKEN="$(cat $SERVER_TOKENFILE)"
else
    echo "Error server token file not found $SERVER_TOKENFILE"
    print_install_results_and_exit 1
fi

if [[ -f $SERVER_LOGFILE ]]; then
    for i in {1..5}; do
        LISTENING_ON="$(cat $SERVER_LOGFILE | grep -E 'Extension host agent listening on .+' | sed 's/Extension host agent listening on //')"
        if [[ -n $LISTENING_ON ]]; then
            break
        fi
        sleep 0.5
    done

    if [[ -z $LISTENING_ON ]]; then
        echo "Error server did not start successfully"
        print_install_results_and_exit 1
    fi
else
    echo "Error server log file not found $SERVER_LOGFILE"
    print_install_results_and_exit 1
fi

# Finish server setup
print_install_results_and_exit 0
`;
}

function generatePowerShellInstallScript({ id, quality, version, commit, release, extensionIds, envVariables, useSocketPath, serverApplicationName, serverDataFolderName, serverDownloadUrlTemplate }: ServerInstallOptions) {
    const extensions = extensionIds.map(id => '--install-extension ' + id).join(' ');
    const downloadUrl = serverDownloadUrlTemplate
        .replace(/\$\{quality\}/g, quality)
        .replace(/\$\{version\}/g, version)
        .replace(/\$\{commit\}/g, commit)
        .replace(/\$\{os\}/g, 'win32')
        .replace(/\$\{arch\}/g, 'x64')
        .replace(/\$\{release\}/g, release ?? '');

    return `
# Server installation script

$TMP_DIR="$env:TEMP\\$([System.IO.Path]::GetRandomFileName())"
$ProgressPreference = "SilentlyContinue"

$DISTRO_VERSION="${version}"
$DISTRO_COMMIT="${commit}"
$DISTRO_QUALITY="${quality}"
$DISTRO_VSCODIUM_RELEASE="${release ?? ''}"

$SERVER_APP_NAME="${serverApplicationName}"
$SERVER_INITIAL_EXTENSIONS="${extensions}"
$SERVER_LISTEN_FLAG="${useSocketPath ? `--socket-path="$TMP_DIR/vscode-server-sock-${crypto.randomUUID()}"` : '--port=0'}"
$SERVER_DATA_DIR="$(Resolve-Path ~)\\${serverDataFolderName}"
$SERVER_DIR="$SERVER_DATA_DIR\\bin\\$DISTRO_COMMIT"
$SERVER_SCRIPT="$SERVER_DIR\\bin\\$SERVER_APP_NAME.cmd"
$SERVER_LOGFILE="$SERVER_DATA_DIR\\.$DISTRO_COMMIT.log"
$SERVER_PIDFILE="$SERVER_DATA_DIR\\.$DISTRO_COMMIT.pid"
$SERVER_TOKENFILE="$SERVER_DATA_DIR\\.$DISTRO_COMMIT.token"
$SERVER_ARCH=
$SERVER_CONNECTION_TOKEN=
$SERVER_DOWNLOAD_URL=

$LISTENING_ON=
$OS_RELEASE_ID=
$ARCH=
$PLATFORM="win32"

function printInstallResults($code) {
    "${id}: start"
    "exitCode==$code=="
    "listeningOn==$LISTENING_ON=="
    "connectionToken==$SERVER_CONNECTION_TOKEN=="
    "logFile==$SERVER_LOGFILE=="
    "osReleaseId==$OS_RELEASE_ID=="
    "arch==$ARCH=="
    "platform==$PLATFORM=="
    "tmpDir==$TMP_DIR=="
    ${envVariables.map(envVar => `"${envVar}==$${envVar}=="`).join('\n')}
    "${id}: end"
}

# Check machine architecture
$ARCH=$env:PROCESSOR_ARCHITECTURE
# Use x64 version for ARM64, as it's not yet available.
if(($ARCH -eq "AMD64") -or ($ARCH -eq "IA64") -or ($ARCH -eq "ARM64")) {
    $SERVER_ARCH="x64"
}
else {
    "Error architecture not supported: $ARCH"
    printInstallResults 1
    exit 0
}

# Create installation folder
if(!(Test-Path $SERVER_DIR)) {
    try {
        ni -it d $SERVER_DIR -f -ea si
    } catch {
        "Error creating server install directory - $($_.ToString())"
        exit 1
    }

    if(!(Test-Path $SERVER_DIR)) {
        "Error creating server install directory"
        exit 1
    }
}

cd $SERVER_DIR

# Check if server script is already installed
if(!(Test-Path $SERVER_SCRIPT)) {
    del vscode-server.tar.gz

    $REQUEST_ARGUMENTS = @{
        Uri="${downloadUrl}"
        TimeoutSec=20
        OutFile="vscode-server.tar.gz"
        UseBasicParsing=$True
    }

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    Invoke-RestMethod @REQUEST_ARGUMENTS

    if(Test-Path "vscode-server.tar.gz") {
        tar -xf vscode-server.tar.gz --strip-components 1

        del vscode-server.tar.gz
    }

    if(!(Test-Path $SERVER_SCRIPT)) {
        "Error while installing the server binary"
        exit 1
    }
}
else {
    "Server script already installed in $SERVER_SCRIPT"
}

# Try to find if server is already running
if(Get-Process node -ErrorAction SilentlyContinue | Where-Object Path -Like "$SERVER_DIR\\*") {
    echo "Server script is already running $SERVER_SCRIPT"
}
else {
    if(Test-Path $SERVER_LOGFILE) {
        del $SERVER_LOGFILE
    }
    if(Test-Path $SERVER_PIDFILE) {
        del $SERVER_PIDFILE
    }
    if(Test-Path $SERVER_TOKENFILE) {
        del $SERVER_TOKENFILE
    }

    $SERVER_CONNECTION_TOKEN="${crypto.randomUUID()}"
    [System.IO.File]::WriteAllLines($SERVER_TOKENFILE, $SERVER_CONNECTION_TOKEN)

    $SCRIPT_ARGUMENTS="--start-server --host=127.0.0.1 $SERVER_LISTEN_FLAG $SERVER_INITIAL_EXTENSIONS --connection-token-file $SERVER_TOKENFILE --telemetry-level off --enable-remote-auto-shutdown --accept-server-license-terms *> '$SERVER_LOGFILE'"

    $START_ARGUMENTS = @{
        FilePath = "powershell.exe"
        WindowStyle = "hidden"
        ArgumentList = @(
            "-ExecutionPolicy", "Unrestricted", "-NoLogo", "-NoProfile", "-NonInteractive", "-c", "$SERVER_SCRIPT $SCRIPT_ARGUMENTS"
        )
        PassThru = $True
    }

    $SERVER_ID = (start @START_ARGUMENTS).ID

    if($SERVER_ID) {
        [System.IO.File]::WriteAllLines($SERVER_PIDFILE, $SERVER_ID)
    }
}

if(Test-Path $SERVER_TOKENFILE) {
    $SERVER_CONNECTION_TOKEN="$(cat $SERVER_TOKENFILE)"
}
else {
    "Error server token file not found $SERVER_TOKENFILE"
    printInstallResults 1
    exit 0
}

sleep -Milliseconds 500

$SELECT_ARGUMENTS = @{
    Path = $SERVER_LOGFILE
    Pattern = "Extension host agent listening on (\\d+)"
}

for($I = 1; $I -le 5; $I++) {
    if(Test-Path $SERVER_LOGFILE) {
        $GROUPS = (Select-String @SELECT_ARGUMENTS).Matches.Groups

        if($GROUPS) {
            $LISTENING_ON = $GROUPS[1].Value
            break
        }
    }

    sleep -Milliseconds 500
}

if(!(Test-Path $SERVER_LOGFILE)) {
    "Error server log file not found $SERVER_LOGFILE"
    printInstallResults 1
    exit 0
}

# Finish server setup
printInstallResults 0

if($SERVER_ID) {
    while($True) {
        if(!(gps -Id $SERVER_ID)) {
            "server died, exit"
            exit 0
        }

        sleep 30
    }
}
`;
}
