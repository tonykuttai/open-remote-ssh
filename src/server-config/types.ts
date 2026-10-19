export type ServerVersion = 'closest' | 'latest' | 'match' | string;
export type ServerValidation = 'force' | 'skip' | 'strict';

export type IServerConfig = {
    version: string;
    buildVersion?: string; // product.json version, e.g. VSCodium's 1.140.06880 (vscode.version is 1.140.0)
    commit: string;
    quality: string;
    release: string;
    serverApplicationName: string;
    serverDataFolderName: string;
    serverDownloadUrlTemplate?: string;
    serverValidation: ServerValidation;
};
