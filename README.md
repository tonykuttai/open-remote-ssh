# AIX Remote - SSH

[jeanp413/open-remote-ssh](https://github.com/jeanp413/open-remote-ssh) for VSCodium, with support for
**IBM AIX (ppc64)** remotes. The AIX server comes from
[tonykuttai/vscodium-aix-server](https://github.com/tonykuttai/vscodium-aix-server) and is installed
automatically on first connection. Everything else works as in open-remote-ssh (this build tracks
upstream 0.4.0): SSH config hosts in the Connect prompt, jump hosts, agent forwarding, GSSAPI, custom
server install paths and download URLs. See the upstream
[README](https://github.com/jeanp413/open-remote-ssh#readme) and
[docs](https://github.com/jeanp413/open-remote-ssh/tree/master/docs) for those settings.

## Supported remote platforms

- **AIX 7.x (ppc64)**, built and tested on AIX 7.3, see below
- x86_64 Debian 8+, Ubuntu 16.04+, CentOS / RHEL 7+ Linux
- ARMv7l (AArch32) Raspbian Stretch/9+ (32-bit)
- ARMv8l (AArch64) Ubuntu 18.04+ (64-bit)
- ppc64le, s390x, riscv64 and loong64 Linux
- Alpine Linux (`apk add bash libstdc++` on the host)
- macOS 10.14+ (Mojave)
- Windows 10+
- FreeBSD 13 and DragonFlyBSD (manual remote-extension-host installation)

On platforms other than AIX the server is downloaded from the VSCodium releases, exactly as open-remote-ssh does.

## AIX host requirements

The server bundles its own Node.js, so Node.js is not needed on the host. Install these from the
[AIX Toolbox](https://www.ibm.com/support/pages/aix-toolbox-open-source-software-overview):

```bash
dnf install bash tar gzip wget libstdc++ libgcc
```

The server is installed under `~/.vscodium-server`, so no root access is needed. Each installed server
version takes about 350 MB (most of it the bundled Node.js), and the first install needs about 450 MB
free while the 100 MB download is being unpacked.

The extension checks these before downloading anything and shows what is missing in the connection error.

## Setup

1. Install `tonykuttai.aix-remote-ssh` from the Extensions view (Open VSX).
2. Enable the proposed API: run **Preferences: Configure Runtime Arguments** and add

   ```jsonc
   "enable-proposed-api": ["tonykuttai.aix-remote-ssh"]
   ```

   then restart VSCodium. If this is missing, the extension shows a dialog with an **Open argv.json** button at startup.
3. **Remote-SSH: Connect to Host...** and pick your AIX host. AIX is detected automatically; the first
   connection downloads the server (about 100 MB) and takes a minute or two.

## Troubleshooting

- The connection error dialog contains the reason reported by the install script.
- Extension log: **Remote-SSH: Show Log**. Server log on the host: `~/.vscodium-server/.<commit>.log`.
- Self-check on the host: `~/.vscodium-server/bin/<commit>/bin/codium-server --version`.
- When [reporting an issue](https://github.com/tonykuttai/open-remote-ssh/issues), include `oslevel -s`,
  the VSCodium and extension versions, and the text from the error dialog or log.

## Limitations

- Changes made to files outside the editor (for example by a build) are not detected automatically on AIX: the server's file watcher does not work there yet. Use Refresh in the Explorer, or reopen the file.
- Extensions that ship their own native binaries will not run on AIX.
