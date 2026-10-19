## 0.0.63
- AIX: the server package bundles its own Node.js, so Node.js no longer needs to be installed on the host (#5)
- AIX: preflight check for bash, tar/gzip, wget/curl, Toolbox libstdc++ and free disk space; failures are reported with the reason in the connection error dialog (#1)
- AIX: run `codium-server --version` right after extraction and report precisely when the server cannot start
- AIX: fall back to `gzip -dc | tar` when GNU tar is not installed
- Resolve `bash` through `/bin/sh` before running the install script, and append the standard directories to PATH, so hosts with a missing bash or a broken non-interactive PATH get a clear error or just work
- Activate on startup and show the argv.json instructions with an "Open argv.json" button when the `resolvers` API proposal is not enabled (#2)
- Toolchain: TypeScript 5.9, ESLint 10 (flat config), webpack 5.112, @types/vscode 1.105, Node 22 in CI; CI workflow added; stale backup files removed

## 0.0.48
- Support `%n` in ProxyCommand
- fix: add missing direct @types/ssh2-stream dependency (#177)
- fix Win32 internal error (#178)

## 0.0.47
- Add support for loong64 (#175)
- Add s390x support (#174)
- Support vscodium alpine reh (#142)

## 0.0.46
- Add riscv64 support (#147)

## 0.0.45
- Use windows-x64 server on windows-arm64

## 0.0.44
- Update ssh2 lib
- Properly set extensionHost env variables

## 0.0.43
- Fix parsing multiple include directives

## 0.0.42
- Fix remote label to show port when connecting to a port other than 22

## 0.0.41
- Take into account parsed port from ssh destination. Fixes (#110)

## 0.0.40
- Update ssh-config package

## 0.0.39

- output error messages when downloading vscode server (#39)
- Add PreferredAuthentications support (#97)

## 0.0.38

- Enable remote support for ppc64le (#93)

## 0.0.37

- Default to Current OS User in Connection String if No User Provided (#91)
- Add support for (unofficial) DragonFly reh (#86)

## 0.0.36

- Make wget support continue download (#85)

## 0.0.35

- Fixes hardcoded agentsock for windows breaks pageant compatibility (#81)

## 0.0.34

- Add remote.SSH.connectTimeout setting
- adding %r username replacement to proxycommand (#77)

## 0.0.33

- feat: support %r user substitution in proxycommand

## 0.0.32

- feat: use serverDownloadUrlTemplate from product.json (#59)

## 0.0.31

- feat: support glob patterns in SSH include directives

## 0.0.30

- feat: support file patterns in SSH include directives
