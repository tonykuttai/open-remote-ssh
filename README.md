# AIX Remote - SSH

[jeanp413/open-remote-ssh](https://github.com/jeanp413/open-remote-ssh) for VSCodium, with support for
**IBM AIX (ppc64)** remotes. The AIX server comes from
[tonykuttai/vscodium-aix-server](https://github.com/tonykuttai/vscodium-aix-server) and is installed
automatically on first connection. Everything else works as in open-remote-ssh.

Built and tested on AIX 7.3.

## AIX host requirements

The server bundles its own Node.js, so Node.js is not needed on the host. Install these from the
[AIX Toolbox](https://www.ibm.com/support/pages/aix-toolbox-open-source-software-overview):

```bash
dnf install bash tar gzip wget libstdc++ libgcc
```

A writable home directory with about 500 MB free is required. No root access is needed; the server
is installed under `~/.vscodium-server`.

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

- File watching is polling based (no native file events on AIX).
- Extensions that ship their own native binaries will not run on AIX.
