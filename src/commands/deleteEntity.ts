import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';
import { ServiceBusTreeItem, ServiceBusTreeProvider } from '../providers/serviceBusTreeProvider';
import { SubscriptionInfo } from '../sidecar/protocol';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerDeleteCommands(
  context: vscode.ExtensionContext,
  client: SidecarClient,
  treeProvider: ServiceBusTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.deleteQueue', async (item?: ServiceBusTreeItem) => {
      if (!item || item.itemType !== 'queue') return;

      const queueName = item.label;
      const connectionName = item.connectionName;
      const confirm = await vscode.window.showWarningMessage(
        `Delete queue '${queueName}' on connection '${connectionName}'?`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') return;

      try {
        await client.deleteQueue(connectionName, queueName);
        vscode.window.showInformationMessage(`Queue '${queueName}' deleted`);
        treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to delete queue: ${errorMessage(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.deleteTopic', async (item?: ServiceBusTreeItem) => {
      if (!item || item.itemType !== 'topic') return;

      const topicName = item.label;
      const connectionName = item.connectionName;
      const confirm = await vscode.window.showWarningMessage(
        `Delete topic '${topicName}' on connection '${connectionName}'?`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') return;

      try {
        await client.deleteTopic(connectionName, topicName);
        vscode.window.showInformationMessage(`Topic '${topicName}' deleted`);
        treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to delete topic: ${errorMessage(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.deleteSubscription', async (item?: ServiceBusTreeItem) => {
      if (!item || item.itemType !== 'subscription') return;

      const subMeta = item.metadata as SubscriptionInfo;
      const connectionName = item.connectionName;
      const topicName = subMeta.topicName;
      const subscriptionName = subMeta.subscriptionName;
      const displayName = `${topicName}/${subscriptionName}`;
      const confirm = await vscode.window.showWarningMessage(
        `Delete subscription '${displayName}' on connection '${connectionName}'?`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') return;

      try {
        await client.deleteSubscription(connectionName, topicName, subscriptionName);
        vscode.window.showInformationMessage(`Subscription '${displayName}' deleted`);
        treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to delete subscription: ${errorMessage(err)}`);
      }
    })
  );
}
