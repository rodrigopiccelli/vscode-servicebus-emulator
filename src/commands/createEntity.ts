import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';
import { ServiceBusTreeProvider, ServiceBusTreeItem } from '../providers/serviceBusTreeProvider';
import { TopicInfo } from '../sidecar/protocol';

export function registerCreateCommands(
  context: vscode.ExtensionContext,
  client: SidecarClient,
  treeProvider: ServiceBusTreeProvider
): void {
  // Create Queue
  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.createQueue', async (item?: ServiceBusTreeItem) => {
      const connectionName = item?.connectionName;
      if (!connectionName) return;

      const queueName = await vscode.window.showInputBox({
        title: 'Create Queue',
        prompt: 'Enter the queue name',
        placeHolder: 'e.g., my-queue',
        validateInput: (value) => {
          if (!value.trim()) return 'Queue name is required';
          return null;
        },
      });
      if (!queueName) return;

      try {
        await client.createQueue(connectionName, queueName.trim());
        vscode.window.showInformationMessage(`Queue '${queueName.trim()}' created`);
        treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create queue: ${err}`);
      }
    })
  );

  // Create Topic
  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.createTopic', async (item?: ServiceBusTreeItem) => {
      const connectionName = item?.connectionName;
      if (!connectionName) return;

      const topicName = await vscode.window.showInputBox({
        title: 'Create Topic',
        prompt: 'Enter the topic name',
        placeHolder: 'e.g., my-topic',
        validateInput: (value) => {
          if (!value.trim()) return 'Topic name is required';
          return null;
        },
      });
      if (!topicName) return;

      try {
        await client.createTopic(connectionName, topicName.trim());
        vscode.window.showInformationMessage(`Topic '${topicName.trim()}' created`);
        treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create topic: ${err}`);
      }
    })
  );

  // Create Subscription
  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusEmulator.createSubscription', async (item?: ServiceBusTreeItem) => {
      if (!item || item.itemType !== 'topic') return;

      const topicName = (item.metadata as TopicInfo).name;
      const connectionName = item.connectionName;

      const subscriptionName = await vscode.window.showInputBox({
        title: `Create Subscription on '${topicName}'`,
        prompt: 'Enter the subscription name',
        placeHolder: 'e.g., my-subscription',
        validateInput: (value) => {
          if (!value.trim()) return 'Subscription name is required';
          return null;
        },
      });
      if (!subscriptionName) return;

      try {
        await client.createSubscription(connectionName, topicName, subscriptionName.trim());
        vscode.window.showInformationMessage(`Subscription '${subscriptionName.trim()}' created on topic '${topicName}'`);
        treeProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create subscription: ${err}`);
      }
    })
  );
}
