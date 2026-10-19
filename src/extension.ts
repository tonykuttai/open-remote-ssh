import * as vscode from 'vscode';
import { Log } from './common/logger';
import { RemoteSSHResolver, REMOTE_SSH_AUTHORITY } from './authResolver';
import { openSSHConfigFile, promptOpenRemoteSSHWindow } from './commands';
import { HostTreeDataProvider } from './hostTreeView';
import { getRemoteWorkspaceLocationData, RemoteLocationHistory } from './remoteLocationHistory';

export async function activate(context: vscode.ExtensionContext) {
    const logger = new Log('Remote - SSH');
    context.subscriptions.push(logger);

    const remoteSSHResolver = new RemoteSSHResolver(context, logger);
    try {
        context.subscriptions.push(vscode.workspace.registerRemoteAuthorityResolver(REMOTE_SSH_AUTHORITY, remoteSSHResolver));
        context.subscriptions.push(remoteSSHResolver);
    } catch (e) {
        // The 'resolvers' API proposal is not enabled for this extension id (VSCodium only enables it
        // for the ids in product.json). Explain how to enable it and keep commands and the log usable.
        logger.error('Failed to register the remote authority resolver', e);
        void showProposedApiInstructions(context, logger);
    }

    const locationHistory = new RemoteLocationHistory(context);
    const locationData = getRemoteWorkspaceLocationData();
    if (locationData) {
        await locationHistory.addLocation(locationData[0], locationData[1]);
    }

    const hostTreeDataProvider = new HostTreeDataProvider(locationHistory);
    context.subscriptions.push(vscode.window.createTreeView('sshHosts', { treeDataProvider: hostTreeDataProvider }));
    context.subscriptions.push(hostTreeDataProvider);

    context.subscriptions.push(vscode.commands.registerCommand('openremotessh.openEmptyWindow', () => promptOpenRemoteSSHWindow(false)));
    context.subscriptions.push(vscode.commands.registerCommand('openremotessh.openEmptyWindowInCurrentWindow', () => promptOpenRemoteSSHWindow(true)));
    context.subscriptions.push(vscode.commands.registerCommand('openremotessh.openConfigFile', () => openSSHConfigFile()));
    context.subscriptions.push(vscode.commands.registerCommand('openremotessh.showLog', () => logger.show()));
}

async function showProposedApiInstructions(context: vscode.ExtensionContext, logger: Log) {
    const extensionId = context.extension.id;
    const openArgv = 'Open argv.json';
    const showLog = 'Show Log';
    const choice = await vscode.window.showErrorMessage(
        `${extensionId} needs the 'resolvers' API proposal, which is not enabled. Add the extension to "enable-proposed-api" in argv.json and restart, or start with --enable-proposed-api ${extensionId}.`,
        { detail: `In argv.json add:\n  "enable-proposed-api": ["${extensionId}"]` },
        openArgv, showLog
    );
    if (choice === openArgv) {
        await vscode.commands.executeCommand('workbench.action.configureRuntimeArguments');
    } else if (choice === showLog) {
        logger.show();
    }
}

export function deactivate() {
}
