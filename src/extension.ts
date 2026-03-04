import * as vscode from 'vscode';
import { SidecarProcess } from './sidecar/sidecarProcess';
import { SidecarClient } from './sidecar/sidecarClient';
import { ServiceBusTreeProvider, ServiceBusTreeItem } from './providers/serviceBusTreeProvider';
import { ConnectionStore } from './models/connectionStore';
import { registerPeekCommand } from './commands/peekMessages';
import { registerSendCommand } from './commands/sendMessage';
import { registerConnectionCommands } from './commands/manageConnections';
import { registerPurgeCommand } from './commands/purgeMessages';
import { registerCreateCommands } from './commands/createEntity';
import { MessageListPanel } from './views/messageListPanel';
import { SendMessagePanel } from './views/sendMessagePanel';

let sidecarProcess: SidecarProcess;
let sidecarClient: SidecarClient | null = null;
let treeProvider: ServiceBusTreeProvider;
let connectionStore: ConnectionStore;

export async function activate(context: vscode.ExtensionContext) {
  connectionStore = new ConnectionStore(context.globalState);

  // Create tree provider early (before sidecar starts)
  treeProvider = new ServiceBusTreeProvider(null, connectionStore);
  const treeView = vscode.window.createTreeView('serviceBusExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Wire tree refresh callbacks for webview panels
  MessageListPanel.onTreeRefreshNeeded = () => treeProvider.refresh();
  SendMessagePanel.onTreeRefreshNeeded = () => treeProvider.refresh();

  // Register commands that don't need the sidecar
  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.refresh', () => {
      treeProvider.refresh();
    })
  );

  registerConnectionCommands(context, connectionStore, treeProvider, () => sidecarClient);

  // Start sidecar
  await startSidecar(context);
}

async function startSidecar(context: vscode.ExtensionContext): Promise<void> {
  sidecarProcess = new SidecarProcess(context);
  context.subscriptions.push(sidecarProcess);

  try {
    const proc = await sidecarProcess.start();
    sidecarClient = new SidecarClient(proc);
    treeProvider.setClient(sidecarClient);

    // Register all stored connections with the sidecar
    const connections = connectionStore.getAll();
    for (const conn of connections) {
      try {
        await sidecarClient.addConnection(conn.name, conn.connectionString, conn.adminConnectionString);
      } catch (err) {
        vscode.window.showWarningMessage(`Failed to register connection '${conn.name}': ${err}`);
      }
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to start Service Bus sidecar. Is .NET 8 installed? Error: ${err}`
    );
    return;
  }

  // Register commands that need the client
  registerPeekCommand(context, sidecarClient);
  registerSendCommand(context, sidecarClient);
  registerPurgeCommand(context, sidecarClient, treeProvider);
  registerCreateCommands(context, sidecarClient, treeProvider);

  // Refresh individual entity (queue, subscription, topic, connection)
  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.refreshEntity', (item: ServiceBusTreeItem) => {
      treeProvider.refreshItem(item);
    })
  );

  vscode.commands.executeCommand('setContext', 'serviceBusEmulator.connected', true);

  // Auto-refresh if configured
  const config = vscode.workspace.getConfiguration('serviceBusEmulator');
  const autoRefresh = config.get<number>('autoRefreshInterval', 0);
  if (autoRefresh > 0) {
    const interval = setInterval(() => treeProvider.refresh(), autoRefresh * 1000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
  }

  treeProvider.refresh();
}

export function deactivate() {
  sidecarProcess?.dispose();
}
