import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';
import { ConnectionStore } from '../models/connectionStore';
import { ServiceBusTreeProvider, ServiceBusTreeItem } from '../providers/serviceBusTreeProvider';
import { ConnectionConfig } from '../sidecar/protocol';

const DEFAULT_CONN_STR = 'Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;';
const DEFAULT_ADMIN_CONN_STR = 'Endpoint=sb://localhost:5300;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;';

export function registerConnectionCommands(
  context: vscode.ExtensionContext,
  connectionStore: ConnectionStore,
  treeProvider: ServiceBusTreeProvider,
  getClient: () => SidecarClient | null
): void {
  // Add Connection
  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.addConnection', async () => {
      const name = await vscode.window.showInputBox({
        title: 'Connection Name',
        prompt: 'Enter a name for this connection',
        placeHolder: 'e.g., Local Emulator',
        validateInput: (value) => {
          if (!value.trim()) return 'Name is required';
          if (connectionStore.get(value.trim())) return 'A connection with this name already exists';
          return null;
        },
      });
      if (!name) return;

      const connectionString = await vscode.window.showInputBox({
        title: 'Messaging Connection String',
        prompt: 'Connection string for messaging (AMQP)',
        value: DEFAULT_CONN_STR,
        ignoreFocusOut: true,
      });
      if (!connectionString) return;

      const adminConnectionString = await vscode.window.showInputBox({
        title: 'Admin Connection String',
        prompt: 'Connection string for administration (HTTP)',
        value: DEFAULT_ADMIN_CONN_STR,
        ignoreFocusOut: true,
      });
      if (!adminConnectionString) return;

      const connection: ConnectionConfig = {
        name: name.trim(),
        connectionString,
        adminConnectionString,
      };

      await connectionStore.add(connection);

      const client = getClient();
      if (client) {
        try {
          await client.addConnection(connection.name, connection.connectionString, connection.adminConnectionString);
        } catch (err) {
          vscode.window.showWarningMessage(`Connection saved but sidecar registration failed: ${err}`);
        }
      }

      treeProvider.refresh();
      vscode.window.showInformationMessage(`Connection '${connection.name}' added`);
    })
  );

  // Edit Connection
  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.editConnection', async (item?: ServiceBusTreeItem) => {
      let connName: string;
      if (item && item.itemType === 'connection') {
        connName = item.connectionName;
      } else {
        const connections = connectionStore.getAll();
        if (connections.length === 0) {
          vscode.window.showInformationMessage('No connections to edit');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          connections.map((c) => c.name),
          { title: 'Select connection to edit' }
        );
        if (!picked) return;
        connName = picked;
      }

      const existing = connectionStore.get(connName);
      if (!existing) return;

      const connectionString = await vscode.window.showInputBox({
        title: 'Messaging Connection String',
        prompt: 'Connection string for messaging (AMQP)',
        value: existing.connectionString,
        ignoreFocusOut: true,
      });
      if (!connectionString) return;

      const adminConnectionString = await vscode.window.showInputBox({
        title: 'Admin Connection String',
        prompt: 'Connection string for administration (HTTP)',
        value: existing.adminConnectionString,
        ignoreFocusOut: true,
      });
      if (!adminConnectionString) return;

      const updated: ConnectionConfig = {
        name: connName,
        connectionString,
        adminConnectionString,
      };

      await connectionStore.add(updated);

      const client = getClient();
      if (client) {
        try {
          await client.removeConnection(connName);
          await client.addConnection(updated.name, updated.connectionString, updated.adminConnectionString);
        } catch (err) {
          vscode.window.showWarningMessage(`Connection updated but sidecar re-registration failed: ${err}`);
        }
      }

      treeProvider.refresh();
      vscode.window.showInformationMessage(`Connection '${connName}' updated`);
    })
  );

  // Remove Connection
  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.removeConnection', async (item?: ServiceBusTreeItem) => {
      let connName: string;
      if (item && item.itemType === 'connection') {
        connName = item.connectionName;
      } else {
        const connections = connectionStore.getAll();
        if (connections.length === 0) {
          vscode.window.showInformationMessage('No connections to remove');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          connections.map((c) => c.name),
          { title: 'Select connection to remove' }
        );
        if (!picked) return;
        connName = picked;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Remove connection '${connName}'?`,
        { modal: true },
        'Remove'
      );
      if (confirm !== 'Remove') return;

      await connectionStore.remove(connName);

      const client = getClient();
      if (client) {
        try {
          await client.removeConnection(connName);
        } catch {
          // Ignore - may not have been registered
        }
      }

      treeProvider.refresh();
      vscode.window.showInformationMessage(`Connection '${connName}' removed`);
    })
  );
}
