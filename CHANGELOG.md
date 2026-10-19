## 0.1.1

- feat(aix): reinstall the server when the AIX server repo has republished a newer build under the same
  tag and commit (compares the release manifest's `built` with the installed `aix-build-manifest.json`);
  the running old server is stopped first

## 0.1.0

- remodel: rebuilt on upstream open-remote-ssh 0.4.0 (previously based on 0.0.48). Brings upstream's
  local-port security fix, archive integrity check, SSH config hosts in the Connect prompt, ForwardAgent,
  PEM keys, install locking, csh/tcsh login shells, Code-OSS compatibility and the test suite.
- feat(aix): AIX ppc64 support re-applied on the new base: detection, Toolbox preflight, bundled-Node
  server from vscodium-aix-server, gzip + native tar fallback, server self-check, failure reason in the
  connection dialog, argv.json guidance dialog at startup.

## 0.0.64 (old base)
- Docs only: README rewritten as a short AIX getting-started guide for open-remote-ssh users, with the real server disk footprint; stale README-AIX.md removed
- Packaging: tsbuildinfo kept out of the VSIX

## 0.0.63
- AIX: the server package bundles its own Node.js, so Node.js no longer needs to be installed on the host (#5)
- AIX: preflight check for bash, tar/gzip, wget/curl, Toolbox libstdc++ and free disk space; failures are reported with the reason in the connection error dialog (#1)
- AIX: run `codium-server --version` right after extraction and report precisely when the server cannot start
- AIX: fall back to `gzip -dc | tar` when GNU tar is not installed
- Resolve `bash` through `/bin/sh` before running the install script, and append the standard directories to PATH, so hosts with a missing bash or a broken non-interactive PATH get a clear error or just work
- Activate on startup and show the argv.json instructions with an "Open argv.json" button when the `resolvers` API proposal is not enabled (#2)
- Toolchain: TypeScript 5.9, ESLint 10 (flat config), webpack 5.112, @types/vscode 1.105, Node 22 in CI; CI workflow added; stale backup files removed

## Upstream open-remote-ssh changes (base of this fork)

## 0.4.0

- feat: list hosts from multi-name `Host` lines and nested `Includes` (#332)
- enhance: support simple `ps` binary (#348)
- fix(security): bind local port to local ip. (#360)

## 0.3.1

- fix(windows): use improved command to test archive (#331)

## 0.3.0

- feat: list configured SSH hosts in the Connect to Host prompt (#319)
- feat: support `ForwardAgent` (#310)
- feat: support PEM-encoded password-protected ssh keys (#249)
- feat: add tests (#314)
- enhance: add integrity check of the archive (#323)
- enhance: fall back to private key when .pub file parsing fails (#268)
- feat: use official simple-socks (#324)
- fix(alpine): pass flock and expose error on missing libstdc++ (#315)
- fix: sanitize the extension ids (#321)
- fix(macos): use a fixed file descriptor due to bash3 (#326)

## 0.2.0
- feat: add compatibility with Code-OSS (#189)
- remodel: use base64 encoding for install script to support csh/tcsh login shells (#296)
- enhance(linux): use `flock` to prevent multiple server install scripts running in parallel (#285)
- enhance: increase polling loop to aid slowish machines (#290)
- refactor: rename `serverBinaryName` setting (#280)
- refactor: extract install scripts from `serverSetup.ts` into script files (#287)

## 0.1.2
- fix: split ProxyCommand into argv tokens before spawn (#274)

## 0.1.1
- don't assume `ProxyCommand` value's type (#270)

## 0.1.0
- replace `which` with `command -v` (#215)
- allow automatic download of remote extension host on FreeBSD (#244)
- add remote.SSH.serverInstallPath option (#259)
- cleanup on errors (#172)
- typo `attemp` -> `attempt` (#185)
- use original ssh-config dependency (#267)

## 0.0.49
- remove default `remote.SSH.serverDownloadUrlTemplate`

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
