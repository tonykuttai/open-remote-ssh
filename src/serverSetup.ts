import * as crypto from 'crypto';
import Log from './common/logger';
import { getVSCodeServerConfig } from './serverConfig';
import SSHConnection from './ssh/sshConnection';

export interface ServerInstallOptions {
    id: string;
    quality: string;
    commit: string;
    version: string;      // upstream VS Code version (e.g. 1.105.1)
    buildVersion?: string; // VSCodium build version (e.g. 1.105.17075)
    release?: string;
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

// Modified to point to your AIX server by default
// const DEFAULT_DOWNLOAD_URL_TEMPLATE = 'https://github.ibm.com/tony-varghese/vscodium-aix-server/releases/download/v${version}/vscodium-reh-aix-ppc64-${version}.tar.gz';

// Default AIX server download (tag == version, asset == vscodium-reh-aix-ppc64-${version}.tar.gz)
const DEFAULT_DOWNLOAD_URL_TEMPLATE =
    'https://github.com/tonykuttai/vscodium-aix-server/releases/download/${buildVersion}/vscodium-reh-aix-ppc64-${buildVersion}.tar.gz';


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
    let buildVersion = extractBuildVersionFromTemplate(
        vscodeServerConfig.serverDownloadUrlTemplate,
        vscodeServerConfig.version
    );

    // If platform is AIX, override with latest GitHub release
    if (platform === 'aix' || !platform) {
        logger.trace(`serverDownloadUrlTemplate: ${vscodeServerConfig.serverDownloadUrlTemplate}`);
        // Extract build version from the client's download URL template
        const clientBuildVersion = extractBuildVersionFromTemplate(
            vscodeServerConfig.serverDownloadUrlTemplate,
            vscodeServerConfig.version
        );
        
        if (clientBuildVersion && clientBuildVersion !== vscodeServerConfig.version) {
            // We successfully extracted a build version different from the base version
            buildVersion = clientBuildVersion;
            logger.trace(`Using client's VSCodium build version for AIX: ${buildVersion}`);
        } else {
            // Fallback: try to fetch latest from GitHub
            const latestAIXVersion = await getLatestAIXServerVersion();
            if (latestAIXVersion) {
                logger.trace(`Using latest AIX server version from GitHub: ${latestAIXVersion}`);
                buildVersion = latestAIXVersion;
            } else {
                // Last resort fallback
                buildVersion = '1.106.27818';
                logger.trace(`Failed to determine version, using fallback: ${buildVersion}`);
            }
        }
    }

    const installOptions: ServerInstallOptions = {
        id: scriptId,
        version: vscodeServerConfig.version,          // 1.105.1
        buildVersion,                                 // 1.105.17075 (parsed)
        commit: vscodeServerConfig.commit,
        quality: vscodeServerConfig.quality,
        release: vscodeServerConfig.release,
        extensionIds,
        envVariables,
        useSocketPath,
        serverApplicationName: vscodeServerConfig.serverApplicationName,
        serverDataFolderName: vscodeServerConfig.serverDataFolderName,
        serverDownloadUrlTemplate:
            serverDownloadUrlTemplate ||
            vscodeServerConfig.serverDownloadUrlTemplate ||
            DEFAULT_DOWNLOAD_URL_TEMPLATE,
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
        const bashPath = await findRemoteBash(conn, logger);
        const installServerScript = generateBashInstallScript(installOptions);

        logger.trace('Server install command:', installServerScript);
        // Fish shell does not support heredoc so let's workaround it using -c option,
        // also replace single quotes (') within the script with ('\'') as there's no quoting within single quotes, see https://unix.stackexchange.com/a/24676
        commandOutput = await conn.exec(`${bashPath} -c '${installServerScript.replace(/'/g, `'\\''`)}'`);
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
        const reason = resultMap.installError?.trim();
        throw new ServerInstallError(reason
            ? `Couldn't install vscode server on remote host: ${reason}`
            : `Couldn't install vscode server on remote server, install script returned non-zero exit status`);
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

/**
 * The install script is a bash script. The remote login shell (ksh on AIX, fish, csh, ...)
 * may not have bash on PATH, so resolve it through a POSIX sh first and fail with a clear
 * message instead of an unparsable install output when it is missing.
 */
async function findRemoteBash(conn: SSHConnection, logger: Log): Promise<string> {
    const probe = `sh -c 'PATH=/opt/freeware/bin:/usr/local/bin:$PATH; command -v bash'`;
    let result: { stdout: string; stderr: string };
    try {
        result = await conn.exec(probe);
    } catch (e) {
        logger.trace('bash probe failed, falling back to "bash" on PATH', e);
        return 'bash';
    }

    const bashPath = result.stdout.trim().split(/\r?\n/).filter(l => l.startsWith('/')).pop();
    if (!bashPath) {
        logger.trace(`bash probe output: stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}`);
        throw new ServerInstallError(
            'bash was not found on the remote host (searched PATH, /opt/freeware/bin and /usr/local/bin). ' +
            'The server install script requires bash. On AIX install it from the AIX Toolbox for Open Source: dnf install bash'
        );
    }

    logger.trace(`Using remote bash: ${bashPath}`);
    return bashPath;
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

// Simplified AIX installation - uses pre-built server directly
export function generateBashInstallScript({
    id,
    quality,
    version,
    buildVersion,
    commit,
    release,
    extensionIds,
    envVariables,
    useSocketPath,
    serverApplicationName,
    serverDataFolderName,
    serverDownloadUrlTemplate
}: ServerInstallOptions) {
    const extensions = extensionIds.map(id => '--install-extension ' + id).join(' ');
    const effectiveBuildVersion = buildVersion ?? version;

    return `
# Server installation script

TMP_DIR="\${XDG_RUNTIME_DIR:-"/tmp"}"

DISTRO_VERSION="${version}"
DISTRO_BUILD_VERSION="${effectiveBuildVersion}"
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
INSTALL_ERROR=
TAR_MODE=

LISTENING_ON=
OS_RELEASE_ID=
ARCH=
PLATFORM=

# Mimic output from logs of remote-ssh extension
print_install_results_and_exit() {
    echo "${id}: start"
    echo "exitCode==$1=="
    echo "installError==$INSTALL_ERROR=="
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

# Report a fatal install problem. The message is echoed for the log and also
# returned to the extension so it can be shown to the user verbatim.
fail_install() {
    INSTALL_ERROR="$1"
    echo "Error: $1"
    print_install_results_and_exit 1
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
        fail_install "Platform not supported: $KERNEL"
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
                    fail_install "AIX architecture not supported: $AIX_ARCH"
                    ;;
            esac
        else
            fail_install "Architecture not supported: $ARCH"
        fi
        ;;
esac

# Add freeware path for AIX
if [[ $PLATFORM == "aix" ]]; then
    export PATH="/opt/freeware/bin:$PATH"
fi

# AIX preflight. The server package bundles its own Node.js, so the host only
# needs the tools to download, unpack and run it. Fail here, with the reason,
# instead of later with an obscure error.
if [[ $PLATFORM == "aix" ]]; then
    PREFLIGHT_MISSING=

    if [[ -z $(command -v wget) && -z $(command -v curl) ]]; then
        PREFLIGHT_MISSING="$PREFLIGHT_MISSING wget-or-curl"
    fi

    # AIX native tar has no -z and no --strip-components. Prefer GNU tar from
    # the Toolbox, otherwise fall back to gzip -dc | tar -xf - with a staging dir.
    if tar --version 2>/dev/null | grep -q GNU; then
        TAR_MODE="gnu"
    elif [[ -n $(command -v gzip) && -n $(command -v tar) ]]; then
        TAR_MODE="pipe"
    else
        PREFLIGHT_MISSING="$PREFLIGHT_MISSING tar+gzip"
    fi

    # The bundled node and its native addons need the GCC C++ runtime
    # (libstdc++ / libgcc_s). bin/aix-env.sh looks in these places, or in
    # VSCODIUM_AIX_GCC_LIBPATH when set.
    GCC_RUNTIME_FOUND=
    for lib in "$VSCODIUM_AIX_GCC_LIBPATH"/libstdc++* /opt/freeware/lib/libstdc++.so.6 /opt/freeware/lib/libstdc++.a /opt/freeware/lib/gcc/*/*/libstdc++* /usr/local/lib/libstdc++.so.6 /usr/local/lib/libstdc++.a; do
        if [[ -e $lib ]]; then
            GCC_RUNTIME_FOUND=1
            break
        fi
    done
    if [[ -z $GCC_RUNTIME_FOUND ]]; then
        PREFLIGHT_MISSING="$PREFLIGHT_MISSING libstdc++"
    fi

    if [[ ! -d $HOME || ! -w $HOME ]]; then
        fail_install "Home directory $HOME is not writable. The server is installed under $SERVER_DATA_DIR"
    fi

    if [[ -n $PREFLIGHT_MISSING ]]; then
        fail_install "AIX host is missing required tools:$PREFLIGHT_MISSING. Install them from the AIX Toolbox for Open Source (dnf install bash tar gzip wget libstdc++ libgcc), then reconnect"
    fi
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
        fail_install "Failed creating server install directory $SERVER_DIR"
    fi
fi

# adjust platform for vscodium download, if needed
if [[ $OS_RELEASE_ID = alpine ]]; then
    PLATFORM=$OS_RELEASE_ID
fi

# Build server download URL
if [[ $PLATFORM == "aix" ]]; then
    # For AIX, use the VSCodium build version (e.g. 1.105.17075), not the upstream VS Code version (1.105.1)
    SERVER_DOWNLOAD_URL="https://github.com/tonykuttai/vscodium-aix-server/releases/download/$DISTRO_BUILD_VERSION/vscodium-reh-aix-ppc64-$DISTRO_BUILD_VERSION.tar.gz"
else
    # Original VSCodium/VSCODE URL for other platforms
    SERVER_DOWNLOAD_URL="$(echo "${serverDownloadUrlTemplate.replace(/\$\{/g, '\\${')}" \
        | sed "s/\\\${quality}/$DISTRO_QUALITY/g" \
        | sed "s/\\\${version}/$DISTRO_VERSION/g" \
        | sed "s/\\\${commit}/$DISTRO_COMMIT/g" \
        | sed "s/\\\${os}/$PLATFORM/g" \
        | sed "s/\\\${arch}/$SERVER_ARCH/g" \
        | sed "s/\\\${release}/$DISTRO_VSCODIUM_RELEASE/g")"
fi

# Check if server script is already installed
if [[ ! -f $SERVER_SCRIPT ]]; then
    case "$PLATFORM" in
        darwin | linux | alpine | aix )
            ;;
        *)
            fail_install "'$PLATFORM' needs manual installation of remote extension host"
            ;;
    esac

    pushd $SERVER_DIR > /dev/null || {
        fail_install "Failed to enter server directory $SERVER_DIR"
    }

    if [[ $PLATFORM == "aix" ]]; then
        # Package is ~100 MB and unpacks to ~330 MB (node is bundled).
        FREE_KB="$(df -Pk "$SERVER_DATA_DIR" 2>/dev/null | awk 'NR==2 {print $4}')"
        if [[ $FREE_KB =~ ^[0-9]+$ && $FREE_KB -lt 460800 ]]; then
            fail_install "Not enough free space under $SERVER_DATA_DIR: $((FREE_KB / 1024)) MB available, about 450 MB needed"
        fi
    fi

    echo "Downloading server from $SERVER_DOWNLOAD_URL"
    if [[ ! -z $(which wget) ]]; then
        wget --tries=3 --timeout=10 --continue --no-verbose -O vscode-server.tar.gz $SERVER_DOWNLOAD_URL
    elif [[ ! -z $(which curl) ]]; then
        curl --retry 3 --connect-timeout 10 --location --show-error --silent --output vscode-server.tar.gz $SERVER_DOWNLOAD_URL
    else
        fail_install "No tool to download server binary"
    fi

    if (( $? > 0 )); then
        rm -f vscode-server.tar.gz
        fail_install "Failed downloading server from $SERVER_DOWNLOAD_URL"
    fi

    echo "Extracting server package..."
    if [[ $TAR_MODE == "pipe" ]]; then
        # Native AIX tar: unpack via gzip into a staging directory, then move
        # the single top-level directory's contents up (no --strip-components).
        rm -rf "$SERVER_DIR/.extract"
        mkdir -p "$SERVER_DIR/.extract"
        if ! ( gzip -dc vscode-server.tar.gz | ( cd "$SERVER_DIR/.extract" && tar -xf - ) ); then
            fail_install "Failed extracting the server package with gzip and tar. Installing GNU tar from the AIX Toolbox (dnf install tar) is recommended"
        fi
        EXTRACT_TOP="$(ls -d "$SERVER_DIR"/.extract/*/ 2>/dev/null | head -1)"
        if [[ -z $EXTRACT_TOP ]]; then
            fail_install "Server package has an unexpected layout (no top-level directory)"
        fi
        shopt -s dotglob
        mv "$EXTRACT_TOP"* "$SERVER_DIR"/
        shopt -u dotglob
        rm -rf "$SERVER_DIR/.extract"
    elif ! tar -xzf vscode-server.tar.gz --strip-components 1; then
        fail_install "Failed extracting the server package with tar -xzf"
    fi

    if [[ $PLATFORM == "aix" ]]; then
        chmod +x "$SERVER_DIR/bin/codium-server" "$SERVER_DIR/bin/remote-cli/codium" "$SERVER_DIR/node" 2>/dev/null

        # The AIX package ships codium-server; link it if the client expects another name
        if [[ "$SERVER_APP_NAME" != "codium-server" && -f "$SERVER_DIR/bin/codium-server" && ! -f "$SERVER_SCRIPT" ]]; then
            ln -sf "$SERVER_DIR/bin/codium-server" "$SERVER_SCRIPT"
            echo "Created symlink: $SERVER_APP_NAME -> codium-server"
        fi

        if [[ ! -f $SERVER_SCRIPT ]]; then
            fail_install "Server package is incomplete: $SERVER_SCRIPT not found after extraction"
        fi

        # The package bundles node; prove it actually runs on this host before
        # going any further (missing libstdc++, wrong LIBPATH, bad binary, ...).
        echo "Verifying the server runs on this host..."
        SERVER_VERSION_OUTPUT="$("$SERVER_SCRIPT" --version 2>&1)"
        SERVER_VERSION_STATUS=$?
        if [[ $SERVER_VERSION_STATUS -ne 0 ]]; then
            fail_install "Server does not run on this host ($SERVER_SCRIPT --version exited with $SERVER_VERSION_STATUS): $(echo "$SERVER_VERSION_OUTPUT" | head -5 | tr '\\n' ' ')"
        fi
        echo "$SERVER_VERSION_OUTPUT"
        if ! echo "$SERVER_VERSION_OUTPUT" | grep -q "$DISTRO_COMMIT"; then
            echo "Warning: server commit does not match the client commit $DISTRO_COMMIT; the connection may fail"
        fi

        # Put the remote CLI (codium) on PATH for interactive bash shells
        BASHRC="$HOME/.bashrc"
        SNIPPET_MARKER="# === VSCodium remote-cli PATH setup ==="
        if [[ ! -f $BASHRC ]]; then
            touch "$BASHRC"
        fi
        if ! grep -Fq "$SNIPPET_MARKER" "$BASHRC"; then
            cat >> "$BASHRC" <<'EOF'

# === VSCodium remote-cli PATH setup ===
# Add all matching remote-cli directories to PATH
if [ -d "$HOME/.vscodium-server/bin" ]; then
  for dir in "$HOME"/.vscodium-server/bin/*/bin/remote-cli; do
      if [ -d "$dir" ]; then
          PATH="$PATH:$dir"
      fi
  done
  export PATH
fi
# === End VSCodium remote-cli PATH setup ===

EOF
            echo "remote-cli PATH snippet added to $BASHRC"
        fi
    fi

    if [[ ! -f $SERVER_SCRIPT ]]; then
        fail_install "Server contents are corrupted"
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
    fail_install "Server token file not found $SERVER_TOKENFILE"
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
        fail_install "Server did not start successfully. Last log lines: $(tail -5 $SERVER_LOGFILE | tr '\\n' ' ')"
    fi
else
    fail_install "Server log file not found $SERVER_LOGFILE"
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

function extractBuildVersionFromTemplate(
    template: string | undefined,
    fallback: string
): string {
    if (!template) {
        return fallback;
    }

    // Example template:
    // https://github.com/VSCodium/vscodium/releases/download/1.105.17075/vscodium-reh-${os}-${arch}-1.105.17075.tar.gz
    const m = template.match(/download\/([^/]+)\//);
    return m?.[1] ?? fallback;
}

async function getLatestAIXServerVersion(): Promise<string | null> {
    try {
        const response = await fetch('https://api.github.com/repos/tonykuttai/vscodium-aix-server/releases/latest');
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        return data.tag_name; // e.g., "1.106.27818"
    } catch (error) {
        return null;
    }
}
