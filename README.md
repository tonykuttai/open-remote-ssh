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
