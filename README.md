# Open Remote - SSH

![Open Remote SSH](https://raw.githubusercontent.com/jeanp413/open-remote-ssh/master/docs/images/open-remote-ssh.gif)

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

VSCode Compatibility

⚠️ IMPORTANT: This extension has been tested and verified to work with the following VSCode version only:
```
Version: 1.102.24914
Commit: 9e6954323e23e2f62c1ea78348dbd1b53e5b827e
Date: 2025-07-23T18:25:03.797Z (4 days ago)
Electron: 35.6.0
ElectronBuildId: undefined
Chromium: 134.0.6998.205
Node.js: 22.15.1
V8: 13.4.114.21-electron.0
OS: Darwin arm64 24.5.0
```
This extension is specifically designed and tested for this version. Compatibility with other VSCode versions is not guaranteed.

Requirements for AIX hosts:

- AIX 7.1 or later
- Node.js 16+ installed on the AIX system
- GNU bash (AIX ksh may cause issues)
- Sufficient permissions to write to the user's home directory

Known Limitations:

- Native modules (like native-watchdog) may not be compatible and will be automatically disabled
- File watching capabilities may be limited compared to other platforms
- Some VS Code extensions that rely on native binaries may not function

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

Configure SSH connection:

Use standard SSH configuration
Ensure the AIX user has write permissions to ~/.vscodium-server/


Installation of the vscodium extension
- Download the [release version of the extension here](https://github.com/tonykuttai/open-remote-ssh/releases/download/v0.0.50/open-remote-ssh-0.0.50.vsix)
```
cd /downloaded/folder
codium --install-extension open-remote-ssh-0.0.50.vsix
```

First Connection:

The initial connection may take longer as the remote extension host is downloaded and configured
If you encounter module loading errors, these are typically non-fatal and the connection should still work

Troubleshooting AIX Issues:

`Error: "Cannot load module ... does not have a valid format"`

This is expected for native modules on AIX and can be safely ignored. We are currently adding support for more nodejs modules that vscodium uses.
The extension will fall back to JavaScript implementations where possible

Connection timeouts:

Increase connection timeout in VS Code settings
Check network connectivity and SSH configuration


Permission issues:

Ensure the user has write access to home directory
Check that the remote user can execute Node.js


Tested Configurations:

- AIX 7.2 with Node.js 16.x
- AIX 7.3 with Node.js 18.x

For additional AIX-specific issues, please check the Issues section or create a new issue with the aix label.

## SSH configuration file

[OpenSSH](https://www.openssh.com/) supports using a [configuration file](https://linuxize.com/post/using-the-ssh-config-file/) to store all your different SSH connections. To use an SSH config file, run the `Remote-SSH: Open SSH Configuration File...` command.


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

## Step 1: Download the Extension

### Option A: Download Release Package
1. Go to: https://github.com/tonykuttai/open-remote-ssh/releases
2. Download the latest `.vsix` file (e.g., `open-remote-ssh-x.x.x.vsix`)
3. Save it to your local machine

### Option B: Build from Source
```bash
git clone https://github.com/tonykuttai/open-remote-ssh.git
cd open-remote-ssh
npm install
npm run package
# This creates a .vsix file in the directory
```

## Step 2: Install the Extension in VSCodium

### Method 1: Using VSCodium Interface
1. **Open VSCodium**
2. **Open Extensions panel** (Ctrl+Shift+X or Cmd+Shift+X)
3. **Click the "..." menu** in the Extensions panel
4. **Select "Install from VSIX..."**
5. **Browse and select** the downloaded `.vsix` file
6. **Click "Install"**
7. **Restart VSCodium** when prompted

### Method 2: Using Command Line
```bash
# Replace with your actual path to the .vsix file
codium --install-extension open-remote-ssh-x.x.x.vsix
```

## Step 3: Configure SSH Connection

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
    Port 22
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

## Step 4: Connect to AIX Server

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

## Step 5: Verify Installation

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

## Step 6: Configure for Optimal Performance (Optional)

### Recommended VSCodium Settings:
Open Settings (Ctrl+, or Cmd+,) and configure:

```json
{
    "remote.SSH.remoteServerListenOnSocket": true,
    "remote.SSH.connectTimeout": 60,
    "remote.SSH.serverInstallTimeout": 300,
    "search.useRipgrep": true,
    "terminal.integrated.defaultProfile.linux": "bash"
}
```

### For Better Search Performance:
If you have ripgrep installed on AIX:
```json
{
    "search.ripgrep.args": [
        "--max-columns=4096",
        "--smart-case"
    ]
}
```

## Step 7: Install Additional Extensions (Optional)

### Install Extensions on Remote Server:
1. **Open Extensions panel** (Ctrl+Shift+X)
2. **Extensions will show**:
   - **Local**: Extensions on your local machine
   - **SSH: hostname**: Extensions on remote server
3. **Install extensions** in the "SSH: hostname" section for server-side functionality

### Recommended Extensions for AIX Development:
- **C/C++ Extension Pack** (for LLVM/C++ development)
- **GitLens** (for Git integration)
- **Bracket Pair Colorizer** (for code readability)
- **Path Intellisense** (for file path completion)

## Troubleshooting

### Connection Issues:

#### "Could not establish connection"
```bash
# Test SSH manually
ssh -v username@your-aix-server.com

# Check SSH config
cat ~/.ssh/config

# Verify SSH key
ssh-add -l
```

#### "Server installation failed"
1. **Check Node.js** on AIX server:
   ```bash
   /opt/nodejs/bin/node --version
   ```
2. **Check permissions**:
   ```bash
   ls -la ~/.vscodium-server/
   ```
3. **Clear server cache**:
   ```bash
   rm -rf ~/.vscodium-server/
   ```

#### "Extension host terminated unexpectedly"
1. **Check server logs**:
   ```bash
   cat ~/.vscodium-server/.*.log
   ```
2. **Restart connection**:
   - Disconnect from server
   - Close VSCodium
   - Reopen and reconnect

### Performance Issues:

#### Slow file operations
1. **Increase timeouts** in settings:
   ```json
   {
       "remote.SSH.connectTimeout": 120,
       "remote.SSH.serverInstallTimeout": 600
   }
   ```

### Search Not Working:
1. **Check if ripgrep is working**:
   ```bash
   which rg
   rg --version
   ```
2. **Manually replace ripgrep binary** if needed (see main documentation)

## Advanced Configuration

### Custom Server Download URL:
If you have your own AIX server builds:
```json
{
    "remote.SSH.serverDownloadUrlTemplate": "https://your-server.com/vscodium-aix-${version}.tar.gz"
}
```

### SSH Connection Options:
```json
{
    "remote.SSH.configFile": "~/.ssh/config",
    "remote.SSH.defaultExtensions": [
        "ms-vscode.cpptools",
        "ms-vscode.cmake-tools"
    ]
}
```

### Workspace Settings for AIX:
Create `.vscode/settings.json` in your project:
```json
{
    "terminal.integrated.shell.linux": "/bin/bash",
    "terminal.integrated.env.linux": {
        "TERM": "xterm-256color"
    },
    "files.eol": "\n",
    "files.encoding": "utf8"
}
```

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
