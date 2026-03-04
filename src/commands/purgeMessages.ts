import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';
import { ServiceBusTreeItem, ServiceBusTreeProvider } from '../providers/serviceBusTreeProvider';
import { SubscriptionInfo } from '../sidecar/protocol';

export function registerPurgeCommand(
  context: vscode.ExtensionContext,
  client: SidecarClient,
  treeProvider: ServiceBusTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serviceBusEmulator.purgeMessages',
      async (item: ServiceBusTreeItem) => {
        let entityPath: string;
        let subscriptionName: string | undefined;
        let displayName: string;
        const connName = item.connectionName;

        if (item.itemType === 'queue') {
          entityPath = item.label as string;
          displayName = entityPath;
        } else if (item.itemType === 'subscription') {
          const subMeta = item.metadata as SubscriptionInfo;
          entityPath = subMeta.topicName;
          subscriptionName = subMeta.subscriptionName;
          displayName = `${entityPath}/${subscriptionName}`;
        } else {
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Purge all messages from '${displayName}' on connection '${connName}'?`,
          { modal: true },
          'Purge'
        );
        if (confirm !== 'Purge') return;

        try {
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Purging messages from ${displayName}...`,
            },
            () => client.purgeMessages(connName, entityPath, subscriptionName)
          );

          vscode.window.showInformationMessage(
            `Purged ${result.purgedCount} message(s) from '${displayName}'`
          );
          treeProvider.refresh();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to purge messages: ${err}`);
        }
      }
    )
  );
}
