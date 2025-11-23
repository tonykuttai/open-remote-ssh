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
- **AIX 7.1+** (Requires manual setup - see AIX Support section below)

## Requirements

**Alpine linux**

When running on alpine linux, the packages `libstdc++` and `bash` are necessary and can be installed via
running
```bash
sudo apk add bash libstdc++
```

**AIX**

Requirements for AIX hosts:

- AIX 7.1 or later
- Node.js 16+ installed on the remote AIX system
- GNU bash (AIX ksh may cause issues)
- Sufficient permissions to write to the user's home directory

Known Limitations:
- Some VS Code extensions that rely on native binaries may not function (like watcher)

Setup Instructions:

- Install Node.js on AIX:
```
# Download and install Node.js for AIX
# Visit https://nodejs.org/en/download/ for AIX packages
# Or use package managers like yum if available
```

- Ensure bash is available:
```
# Check if bash is installed
which bash

# If not available, install GNU bash
# This may require installing from AIX Toolbox or building from source
```
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


Alternate Manual Installation of the vscodium extension
- Download the [release version of the extension here](https://github.com/tonykuttai/open-remote-ssh/releases/download/v0.0.52/aix-remote-ssh-0.0.52.vsix) 

```
cd /downloaded/folder
codium --install-extension aix-remote-ssh-0.0.52.vsix
```

## Open VScodium 

Always start VSCodium with the following flags to enable proposed API on your Host terminal:

`codium --enable-proposed-api tonykuttai.aix-remote-ssh`

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
- **Node.js 16+** installed at `/opt/nodejs/bin/node`
- **User account** with appropriate permissions

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
3. **AIX compatibility patches** will be applied
4. **Wait for installation** to complete (may take 2-5 minutes on first connection)
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
- **Bracket Pair Colorizer** (for code readability)
- **Path Intellisense** (for file path completion)


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
2. **Node.js version**: `/opt/nodejs/bin/node --version`
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

### Q: What if my AIX server uses a different Node.js path?
**A:** You can modify the server installation script or create a symlink:
```bash
sudo ln -s /your/nodejs/path/node /opt/nodejs/bin/node
```

---

**That's it!** You should now have a fully functional Remote SSH connection to your AIX server through VSCodium.

For the latest updates and issues, visit: https://github.com/tonykuttai/open-remote-ssh

## Acknowledgements

This extension is based on [jeanp413/open-remote-ssh](https://github.com/jeanp413/open-remote-ssh)
and adds experimental AIX remote server support via
[tonykuttai/vscodium-aix-server](https://github.com/tonykuttai/vscodium-aix-server).

