#!/usr/bin/env bash
# Server installation script

%%SEND_ENV_VAR_LINES%%

# Keep the standard tools reachable even when the remote's PATH is broken
# (seen on AIX with an unexpanded "$PATH" in /etc/environment).
export PATH="$PATH:/usr/bin:/bin:/usr/sbin:/sbin"

TMP_DIR="${XDG_RUNTIME_DIR:-"/tmp"}"

DISTRO_VERSION="%%DISTRO_VERSION%%"
DISTRO_COMMIT="%%DISTRO_COMMIT%%"
DISTRO_QUALITY="%%DISTRO_QUALITY%%"
DISTRO_VSCODIUM_RELEASE="%%DISTRO_VSCODIUM_RELEASE%%"

MODIFY_PRODUCT_JSON="%%MODIFY_PRODUCT_JSON%%"

SERVER_APP_NAME="%%SERVER_APP_NAME%%"
SERVER_INITIAL_EXTENSIONS="%%SERVER_INITIAL_EXTENSIONS%%"
SERVER_LISTEN_FLAG="%%SERVER_LISTEN_FLAG%%"
SERVER_DATA_DIR="%%SERVER_DATA_DIR%%"
SERVER_DATA_DIR_FLAG="%%SERVER_DATA_DIR_FLAG%%"
SERVER_DIR="$SERVER_DATA_DIR/bin/$DISTRO_COMMIT"
SERVER_SCRIPT="$SERVER_DIR/bin/$SERVER_APP_NAME"
SERVER_LOGFILE="$SERVER_DATA_DIR/.$DISTRO_COMMIT.log"
SERVER_PIDFILE="$SERVER_DATA_DIR/.$DISTRO_COMMIT.pid"
SERVER_TOKENFILE="$SERVER_DATA_DIR/.$DISTRO_COMMIT.token"
SERVER_PLATFORM="%%SERVER_PLATFORM%%"
SERVER_ARCH="%%SERVER_ARCH%%"
SERVER_CONNECTION_TOKEN=
SERVER_DOWNLOAD_URL=
SERVER_VALIDATION_FLAG="%%SERVER_VALIDATION_FLAG%%"
INSTALL_ERROR=
TAR_MODE=

LISTENING_ON=
OS_RELEASE_ID=
PLATFORM=$SERVER_PLATFORM

# Get commit from installed server's product.json
get_installed_commit() {
  if [[ ! -f "$SERVER_DIR/product.json" ]]; then
    return 0
  fi

  sed -n 's/.*"commit"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]\{7,\}\)".*/\1/p' "$SERVER_DIR/product.json" 2>/dev/null | head -n 1
}

# Mimic output from logs of remote-ssh extension
print_install_results_and_exit() {
  echo "%%SCRIPT_ID%%: start"
  echo "exitCode==$1=="
  echo "installError==$INSTALL_ERROR=="
  echo "listeningOn==$LISTENING_ON=="
  echo "connectionToken==$SERVER_CONNECTION_TOKEN=="
  echo "logFile==$SERVER_LOGFILE=="
  echo "osReleaseId==$OS_RELEASE_ID=="
  echo "platform==$PLATFORM=="
  echo "tmpDir==$TMP_DIR=="
%%ENV_VAR_LINES%%
  echo "%%SCRIPT_ID%%: end"
  exit 0
}

# Report a fatal install problem: echoed for the log and returned to the
# extension, which shows it in the connection error dialog.
fail_install() {
  INSTALL_ERROR="$1"
  echo "Error: $1"
  print_install_results_and_exit 1
}

# Validate the commit of the installed server against the expected one (DISTRO_COMMIT)
#
# The install directory is named for the client's commit, but the download URL may still return a different build
# (for example, when a version-keyed URL is shared by releases with different commits).
# Reject a present server whose product.json records a different commit,
# so it can be replaced by a fresh download instead of being reused under the wrong directory name.
#
# The validation is bypassed when:
# - no server installed
# - empty or unreadable commit
# - "serverValidation": "force"
# - "serverValidation": "skip"
validate_installed_commit() {
  if [[ ! -f $SERVER_SCRIPT ]] || [[ "$MODIFY_PRODUCT_JSON" == "true" ]] || [[ -n "$SERVER_VALIDATION_FLAG" ]]; then
    return 0
  fi

  local installed
  installed="$(get_installed_commit)"

  [[ -z "$installed" ]] || [[ "$installed" == "$DISTRO_COMMIT" ]]
}

LOCKFILE="$TMP_DIR/server_install.lock"

if command -v flock >/dev/null 2>&1; then
  # Automatic file descriptor allocation ({FD}) requires bash >= 4.1,
  # and macOS still ships bash 3.2, so use a fixed descriptor instead.
  FD=9
  exec 9<>"$LOCKFILE"

  if flock --help 2>&1 | grep -q -- '-w'; then
    # wait 30s to acquire lock, otherwise fail
    flock -x -w 30 $FD || print_install_results_and_exit 1
  else
    ELAPSED=0

    while [[ $ELAPSED -lt 30 ]]; do
        if flock -n -x $FD; then
            break
        fi

        sleep 1

        ELAPSED=$((ELAPSED + 1))
    done

    if [[ $ELAPSED -ge 30 ]]; then
      echo "Warning: flock cannot acquire the install lock"
      print_install_results_and_exit 1
    fi
  fi

  trap "flock -u $FD; trap - EXIT INT HUP; exit" EXIT INT HUP
else
  echo "Warning: flock not available, skipping install lock"
fi

# Check if platform is supported
if ! command -v uname >/dev/null 2>&1; then
  echo "Error: 'uname' command not found, could not get platform/arch data."
  print_install_results_and_exit 1
fi

# AIX: the Toolbox (GNU userland) lives under /opt/freeware/bin, and the server
# package bundles its own Node.js, so only the tools to download, unpack and run
# it are needed. Check them here and fail with the reason instead of later.
if [[ $PLATFORM == "aix" ]]; then
  export PATH="/opt/freeware/bin:$PATH"
  OS_RELEASE_ID="aix"
  PREFLIGHT_MISSING=

  if ! command -v wget >/dev/null 2>&1 && ! command -v curl >/dev/null 2>&1; then
    PREFLIGHT_MISSING="$PREFLIGHT_MISSING wget-or-curl"
  fi

  # AIX native tar has no -z and no --strip-components: prefer GNU tar, else gzip + tar via a staging dir.
  if tar --version 2>/dev/null | grep -q GNU; then
    TAR_MODE="gnu"
  elif command -v gzip >/dev/null 2>&1 && command -v tar >/dev/null 2>&1; then
    TAR_MODE="pipe"
  else
    PREFLIGHT_MISSING="$PREFLIGHT_MISSING tar+gzip"
  fi

  # The bundled node and its addons need the GCC C++ runtime (libstdc++ / libgcc_s);
  # bin/aix-env.sh looks in these places, or in VSCODIUM_AIX_GCC_LIBPATH when set.
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

# https://www.freedesktop.org/software/systemd/man/os-release.html
if [[ -z $OS_RELEASE_ID ]]; then
  OS_RELEASE_ID="$(grep -i '^ID=' /etc/os-release 2>/dev/null | sed 's/^ID=//gi' | sed 's/"//g')"
fi
if [[ -z $OS_RELEASE_ID ]]; then
  OS_RELEASE_ID="$(grep -i '^ID=' /usr/lib/os-release 2>/dev/null | sed 's/^ID=//gi' | sed 's/"//g')"
  if [[ -z $OS_RELEASE_ID ]]; then
    OS_RELEASE_ID="unknown"
  fi
fi

# Create installation folder
if [[ ! -d $SERVER_DIR ]]; then
  mkdir -p $SERVER_DIR || fail_install "Failed creating server install directory $SERVER_DIR"

fi

# adjust platform for vscodium download, if needed
if [[ $OS_RELEASE_ID = alpine ]]; then
  PLATFORM="alpine"
fi

SERVER_DOWNLOAD_URL="$(echo "%%SERVER_DOWNLOAD_URL_TEMPLATE%%" | sed "s/\${quality}/$DISTRO_QUALITY/g" | sed "s/\${version}/$DISTRO_VERSION/g" | sed "s/\${commit}/$DISTRO_COMMIT/g" | sed "s/\${os}/$PLATFORM/g" | sed "s/\${arch}/$SERVER_ARCH/g" | sed "s/\${release}/$DISTRO_VSCODIUM_RELEASE/g")"

# Validate the commit of the installed server against the expected one (DISTRO_COMMIT)
if ! validate_installed_commit; then
  echo "Installed server commit $(get_installed_commit) does not match $DISTRO_COMMIT, reinstalling"
  rm -rf "$SERVER_DIR"/*
fi

# Check if server script is already installed
if [[ ! -f $SERVER_SCRIPT ]]; then
  case "$PLATFORM" in
    aix | alpine | darwin | freebsd | linux )
      ;;
    *)
      fail_install "'$PLATFORM' needs manual installation of remote extension host"
      ;;
  esac

  pushd "$SERVER_DIR" > /dev/null || fail_install "Failed to enter server directory $SERVER_DIR"

  if [[ $PLATFORM == "aix" ]]; then
    # Package is ~100 MB and unpacks to ~330 MB (node is bundled).
    FREE_KB="$(df -Pk "$SERVER_DATA_DIR" 2>/dev/null | awk 'NR==2 {print $4}')"
    if [[ $FREE_KB =~ ^[0-9]+$ && $FREE_KB -lt 460800 ]]; then
      fail_install "Not enough free space under $SERVER_DATA_DIR: $((FREE_KB / 1024)) MB available, about 450 MB needed"
    fi
  fi

  echo "Downloading server from $SERVER_DOWNLOAD_URL"

  if command -v wget >/dev/null 2>&1; then
    wget --tries=3 --timeout=10 --continue --no-verbose -O vscode-server.tar.gz "$SERVER_DOWNLOAD_URL"
  elif command -v curl >/dev/null 2>&1; then
    curl --retry 3 --connect-timeout 10 --location --show-error --silent --output vscode-server.tar.gz "$SERVER_DOWNLOAD_URL"
  elif command -v fetch >/dev/null 2>&1; then
    fetch --retry --timeout=10 --quiet --output=vscode-server.tar.gz "$SERVER_DOWNLOAD_URL"
  else
    fail_install "No tool to download server binary (wget, curl or fetch)"
  fi

  if (( $? > 0 )); then
    rm -rf vscode-server.tar.gz
    fail_install "Failed downloading server from $SERVER_DOWNLOAD_URL"
  fi

  if [[ $TAR_MODE == "pipe" ]]; then
    # Native AIX tar: check with gzip, unpack via a staging directory and move the
    # single top-level directory's contents up (no --strip-components).
    if ! gzip -t vscode-server.tar.gz 2>/dev/null; then
      rm -rf vscode-server.tar.gz
      fail_install "Downloaded tarball is corrupt or incomplete"
    fi
    echo "Extracting server package..."
    rm -rf "$SERVER_DIR/.extract"
    mkdir -p "$SERVER_DIR/.extract"
    if ! ( gzip -dc vscode-server.tar.gz | ( cd "$SERVER_DIR/.extract" && tar -xf - ) ); then
      rm -rf vscode-server.tar.gz
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
  else
    tar -xOf vscode-server.tar.gz > /dev/null 2>&1 || (
      rm -rf vscode-server.tar.gz
      fail_install "Downloaded tarball is corrupt or incomplete"
    )

    echo "Extracting server package..."
    tar -xf vscode-server.tar.gz --strip-components 1 || (
      rm -rf vscode-server.tar.gz
      fail_install "Failed extracting the server package"
    )
  fi

  rm -f vscode-server.tar.gz

  if [[ $PLATFORM == "aix" ]]; then
    chmod +x "$SERVER_DIR/bin/$SERVER_APP_NAME" "$SERVER_DIR/bin/remote-cli/"* "$SERVER_DIR/node" 2>/dev/null

    # The package bundles node; prove the server runs on this host before going
    # any further (missing libstdc++, wrong LIBPATH, bad binary, ...).
    echo "Verifying the server runs on this host..."
    SERVER_VERSION_OUTPUT="$("$SERVER_SCRIPT" --version 2>&1)"
    SERVER_VERSION_STATUS=$?
    if [[ $SERVER_VERSION_STATUS -ne 0 ]]; then
      fail_install "Server does not run on this host ($SERVER_SCRIPT --version exited with $SERVER_VERSION_STATUS): $(echo "$SERVER_VERSION_OUTPUT" | head -5 | tr '\n' ' ')"
    fi
    echo "$SERVER_VERSION_OUTPUT"

    # Put the remote CLI (codium) on PATH for interactive bash shells
    BASHRC="$HOME/.bashrc"
    SNIPPET_MARKER="# === VSCodium remote-cli PATH setup ==="
    [[ -f $BASHRC ]] || touch "$BASHRC"
    if ! grep -Fq "$SNIPPET_MARKER" "$BASHRC"; then
      cat >> "$BASHRC" <<EOF

$SNIPPET_MARKER
# Add all matching remote-cli directories to PATH
if [ -d "$SERVER_DATA_DIR/bin" ]; then
  for dir in "$SERVER_DATA_DIR"/bin/*/bin/remote-cli; do
      if [ -d "\$dir" ]; then
          PATH="\$PATH:\$dir"
      fi
  done
  export PATH
fi
# === End VSCodium remote-cli PATH setup ===

EOF
      echo "remote-cli PATH snippet added to $BASHRC"
    fi
  fi

  popd > /dev/null || exit

  if [[ ! -f $SERVER_SCRIPT ]] || [[ ! -s $SERVER_SCRIPT ]]; then
    rm -rf $SERVER_DIR/*
    fail_install "Server contents are corrupted: $SERVER_SCRIPT not found after extraction"
  fi

  if ! validate_installed_commit; then
    echo "Error: downloaded server commit $(get_installed_commit) does not match $DISTRO_COMMIT"
    echo "Check that remote.SSH.serverDownloadUrlTemplate resolves to the server for this build; a \${commit} keyed URL cannot be ambiguous"

    rm -rf "$SERVER_DIR"/*

    print_install_results_and_exit 1
  fi
else
  echo "Server script already installed in $SERVER_SCRIPT"
fi

# Modify the commit in the remote server to match the local value
if [[ "$MODIFY_PRODUCT_JSON" == "true" ]]; then
  if command -v sed >/dev/null 2>&1; then
    echo "Will modify product.json on remote to match the commit value"
    sed -i -E 's/"commit": "[0-9a-f]+",/"commit": "'"$DISTRO_COMMIT"'",/' "$SERVER_DIR/product.json";
  else
    echo "Cannot find the 'sed' command, make sure it is installed to modify product.json with the matching commit."
  fi
fi

# Try to find if server is already running
if [[ -f $SERVER_PIDFILE ]]; then
  SERVER_PID="$(cat $SERVER_PIDFILE)"
  # ps -p: POSIX, and the only form that sees a process started from another
  # ssh session on AIX (plain `ps -o pid,args` lists the current terminal only).
  # Match on the server directory: launchers that exec node (AIX) leave no
  # "bin/<app>-server" in the arguments, only "<dir>/out/server-main.js".
  SERVER_RUNNING_PROCESS="$( (ps -p "$SERVER_PID" -o pid,args 2>/dev/null || ps -o pid,args) | grep "$SERVER_PID" | grep -F "$SERVER_DIR/" )"
else
  SERVER_RUNNING_PROCESS="$( (ps -o pid,args -A || ps -o pid,args) | grep -F "$SERVER_DIR/" | grep -E "server-main\.js|$SERVER_SCRIPT" | grep -v grep )"
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
  SERVER_CONNECTION_TOKEN="%%SERVER_CONNECTION_TOKEN%%"
  echo $SERVER_CONNECTION_TOKEN > $SERVER_TOKENFILE

  $SERVER_SCRIPT --start-server --host=127.0.0.1 $SERVER_LISTEN_FLAG $SERVER_DATA_DIR_FLAG $SERVER_VALIDATION_FLAG $SERVER_INITIAL_EXTENSIONS --connection-token-file $SERVER_TOKENFILE --telemetry-level off --enable-remote-auto-shutdown --accept-server-license-terms &> $SERVER_LOGFILE &
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
  for i in {1..35}; do
    if [[ -n "$(cat $SERVER_LOGFILE | grep 'Error loading shared library libstdc++.so')" ]]; then
      echo "Error: missing libstdc++"
      break;
    fi

    LISTENING_ON="$(cat $SERVER_LOGFILE | grep -E 'Extension host agent listening on .+' | sed 's/Extension host agent listening on //')"
    if [[ -n $LISTENING_ON ]]; then
      break
    fi

    sleep 0.5
  done

  if [[ -z $LISTENING_ON ]]; then
    fail_install "Server did not start successfully. Last log lines: $(tail -5 "$SERVER_LOGFILE" | tr '\n' ' ')"
  fi
else
  fail_install "Server log file not found $SERVER_LOGFILE"
fi

# Finish server setup
print_install_results_and_exit 0
