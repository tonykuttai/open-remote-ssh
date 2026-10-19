# AIX Remote - SSH

![AIX Remote SSH](https://raw.githubusercontent.com/tonykuttai/open-remote-ssh/master/docs/images/open-remote-ssh.gif)

## SSH Host Requirements
You can connect to a running SSH server on the following platforms.

**Supported**:

- x86_64 Debian 8+, Ubuntu 16.04+, CentOS / RHEL 7+ Linux.
- ARMv7l (AArch32) Raspbian Stretch/9+ (32-bit).
- ARMv8l (AArch64) Ubuntu 18.04+ (64-bit).
- macOS 10.14+ (Mojave)
- Windows 10+
- FreeBSD 13 (Requires manual remote-extension-host installation)
- DragonFlyBSD (Requires manual remote-extension-host installation)
- **AIX (ppc64)**, built and tested on AIX 7.3 - see the AIX section below

## Requirements

**Alpine linux**

When running on alpine linux, the packages `libstdc++` and `bash` are necessary and can be installed via
running
```bash
sudo apk add bash libstdc++
```

**AIX**

The AIX server package (from [tonykuttai/vscodium-aix-server](https://github.com/tonykuttai/vscodium-aix-server))
bundles its own Node.js runtime, so **Node.js does not need to be installed on the AIX host**.
The extension checks the following before downloading anything and shows exactly what is missing:

- `bash` (GNU bash; the AIX default `ksh` is not enough)
- GNU `tar`, or `gzip` plus the native AIX `tar` (AIX `tar` cannot read `.tar.gz` on its own)
- `wget` or `curl`
- The GCC C++ runtime from the AIX Toolbox: `libstdc++` and `libgcc` (under `/opt/freeware/lib`)
- A writable home directory with about 500 MB free (the server unpacks to roughly 330 MB)

All of these come from the [AIX Toolbox for Open Source Software](https://www.ibm.com/support/pages/aix-toolbox-open-source-software-overview):
```bash
dnf install bash tar gzip wget libstdc++ libgcc
```
No root access is needed to use the extension itself: the server is installed under `~/.vscodium-server`.

After extraction the extension runs `codium-server --version` on the host. If that fails, the connection
error dialog shows the output so the cause (for example a missing `libstdc++`) is visible immediately.

Known Limitations:
- File watching uses polling (no native file events on AIX), so very large workspaces may be slower.
- Some VS Code extensions that ship their own native binaries will not work on AIX.
---

## Installation

Installation Steps
1. Open VSCodium. Turn on Updates and get the latest version.
2. Go to Extensions view.
3. Search for `AIX Remote - SSH` or `tonykuttai.aix-remote-ssh`
4. Install the extension
5. Install shell command in PATH: Open Command Palette and run Shell Command: Install `codium` command in `PATH`. Close VSCodium.
6. Always start VSCodium with the following flags to enable proposed API on your Host terminal:

`codium --enable-proposed-api tonykuttai.aix-remote-ssh`


(Optional) Alternate Manual Installation of the vscodium extension
- Download the `.vsix` from the [latest release](https://github.com/tonykuttai/open-remote-ssh/releases/latest)

```
cd /downloaded/folder
codium --install-extension aix-remote-ssh-<version>.vsix
```

## Open VScodium 

Always start VSCodium with the following flags to enable proposed API on your Host terminal:

`codium --enable-proposed-api tonykuttai.aix-remote-ssh`

---
# Optional Steps Configuration

## SSH configuration file

[OpenSSH](https://www.openssh.com/) supports using a [configuration file](https://linuxize.com/post/using-the-ssh-config-file/) to store all your different SSH connections. To use an SSH config file, run the `Remote-SSH: Open SSH Configuration File...` command from VScodium command palette.


## AIX Remote SSH Extension Setup Guide

Complete instructions for installing and using the AIX-compatible Remote SSH extension.

## Prerequisites

### On Your Local Machine (Windows/Mac/Linux):
- **VSCodium** installed
- **SSH client** available (`ssh` command)
- **Network access** to your AIX server

### On Your AIX Server:
- **SSH server** running (`sshd`)
- **AIX Toolbox packages** listed under [Requirements](#requirements) (`bash`, `tar`, `gzip`, `wget` or `curl`, `libstdc++`, `libgcc`)
- **User account** with a writable home directory

## Configure SSH Connection

### Setup SSH Key Authentication (Recommended)
1. **Generate SSH key** (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. **Copy public key to AIX server**:
   ```bash
   ssh-copy-id username@your-aix-server.com
   ```

3. **Test SSH connection**:
   ```bash
   ssh username@your-aix-server.com
   ```

### Configure SSH Config (Optional)
Create or edit `~/.ssh/config`:
```
Host aix-server
    HostName your-aix-server.com
    User your-username
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    TCPKeepAlive yes
```

## Connect to AIX Server

### Using VSCodium Interface:
1. **Open Command Palette** (Ctrl+Shift+P or Cmd+Shift+P)
2. **Type**: "Remote-SSH: Connect to Host..."
3. **Select** the command from the dropdown
4. **Enter** your connection string:
   ```
   username@your-aix-server.com
   ```
   Or if you configured SSH config:
   ```
   aix-server
   ```
5. **Select platform** when prompted: Choose "Linux" (AIX will be detected automatically)
6. **Enter password** or use SSH key authentication

### First Connection Process:
1. **Extension will detect AIX** and start server installation
2. **VSCodium server will be downloaded** and installed automatically
3. **Server self-check** runs (`codium-server --version`) to confirm it works on the host
4. **Wait for installation** to complete (the package is about 100 MB; a minute or two on first connection)
5. **Connection established** - you'll see "SSH: hostname" in the bottom-left corner

## Verify Installation

### Check Connection Status:
- **Bottom-left corner** should show: `SSH: your-aix-server`
- **Green connection indicator** in status bar
- **Terminal should work** (Terminal → New Terminal)

### Test Basic Functionality:
1. **Open a folder** on the AIX server (File → Open Folder)
2. **Create a test file** and edit it
3. **Open integrated terminal** (Ctrl+` or Cmd+`)
4. **Run basic commands**:
   ```bash
   pwd
   ls -la
   uname -a
   ```

### Recommended Extensions for AIX Development:
- **C/C++ Extension Pack** (for LLVM/C++ development)
- **GitLens** (for Git integration)
- **clangd** (for code navigation, you need to install clangd server for AIX seperately)

## Getting Help

### Log Files to Check:
- **Local VSCodium logs**: Help → Toggle Developer Tools → Console
- **Remote server logs**: `~/.vscodium-server/.*.log`
- **SSH logs**: `ssh -v username@hostname`

### Common Log Locations:
```bash
# Server installation logs
~/.vscodium-server/.*.log

# Extension host logs  
~/.vscodium-server/data/logs/

# Terminal output
# Available in VSCodium: View → Output → Remote-SSH
```

### Reporting Issues:

[Report the issues here](https://github.com/tonykuttai/open-remote-ssh/issues)

When reporting issues, include:
1. **AIX version**: `oslevel -s`
2. **Server self-check**: `~/.vscodium-server/bin/<commit>/bin/codium-server --version`
3. **VSCodium version**: Help → About
4. **Extension version**: Extensions panel
5. **Error logs**: From locations listed above

## FAQ

### Q: Why do I need this extension instead of the official one?
**A:** The official Remote-SSH extension doesn't support AIX. This extension includes AIX-specific patches and pre-built server components.

### Q: Does this work with VS Code?
**A:** This extension is designed for VSCodium. For VS Code, you may need to modify the installation process.

### Q: Can I use this with other UNIX systems?
**A:** While designed for AIX, it should work with other UNIX systems that the official extension doesn't support.

### Q: How do I update the extension?
**A:** Download the new `.vsix` file and install it using the same process. VSCodium will update the existing installation.

### Q: Do I need Node.js on the AIX host?
**A:** No. Since server release 1.135.06055 every package bundles the Node.js build it was tested with
(`~/.vscodium-server/bin/<commit>/node`). Nothing outside the Toolbox packages listed under Requirements is used.

### Q: The connection fails with "AIX host is missing required tools"
**A:** The message lists what is missing. Install it from the AIX Toolbox (`dnf install bash tar gzip wget libstdc++ libgcc`) and reconnect.
If you cannot install packages system-wide, GNU bash and tar placed anywhere on your `PATH` also work.

---

**That's it!** You should now have a fully functional Remote SSH connection to your AIX server through VSCodium.

For the latest updates and issues, visit: https://github.com/tonykuttai/open-remote-ssh

## Acknowledgements

This extension is based on [jeanp413/open-remote-ssh](https://github.com/jeanp413/open-remote-ssh)
and adds experimental AIX remote server support via
[tonykuttai/vscodium-aix-server](https://github.com/tonykuttai/vscodium-aix-server).

