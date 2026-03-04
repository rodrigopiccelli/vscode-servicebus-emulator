import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';
import { ServiceBusTreeItem } from '../providers/serviceBusTreeProvider';
import { MessageListPanel } from '../views/messageListPanel';
import { SubscriptionInfo } from '../sidecar/protocol';

export function registerPeekCommand(
  context: vscode.ExtensionContext,
  client: SidecarClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serviceBusEmulator.peekMessages',
      async (item: ServiceBusTreeItem) => {
        const config = vscode.workspace.getConfiguration('serviceBusEmulator');
        const maxCount = config.get<number>('peekMessageCount', 25);

        let entityPath: string;
        let subscriptionName: string | undefined;
        let displayName: string;
        const connName = item.connectionName;

        if (item.itemType === 'queue') {
          entityPath = item.label as string;
          displayName = `[${connName}] ${entityPath}`;
        } else if (item.itemType === 'subscription') {
          const subMeta = item.metadata as SubscriptionInfo;
          entityPath = subMeta.topicName;
          subscriptionName = subMeta.subscriptionName;
          displayName = `[${connName}] ${entityPath}/${subscriptionName}`;
        } else {
          return;
        }

        try {
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Peeking messages from ${displayName}...`,
            },
            () => client.peekMessages(connName, entityPath, subscriptionName, maxCount)
          );

          MessageListPanel.createOrShow(
            context.extensionUri,
            displayName,
            result.messages,
            client,
            { connectionName: connName, entityPath, subscriptionName }
          );
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to peek messages: ${err}`);
        }
      }
    )
  );
}
