import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';
import { ConnectionStore } from '../models/connectionStore';
import { QueueInfo, TopicInfo, SubscriptionInfo, ConnectionConfig } from '../sidecar/protocol';

export type TreeItemType =
  | 'connection'
  | 'queuesFolder'
  | 'topicsFolder'
  | 'queue'
  | 'topic'
  | 'subscription';

export class ServiceBusTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly itemType: TreeItemType,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly connectionName: string,
    public readonly metadata?: QueueInfo | TopicInfo | SubscriptionInfo | ConnectionConfig
  ) {
    super(label, collapsibleState);
    this.contextValue = itemType;

    switch (itemType) {
      case 'connection': {
        this.iconPath = new vscode.ThemeIcon('plug');
        const cfg = metadata as ConnectionConfig;
        this.tooltip = new vscode.MarkdownString(
          `**${cfg.name}**\n\n` +
          `Messaging: \`${truncateConnStr(cfg.connectionString)}\`\n\n` +
          `Admin: \`${truncateConnStr(cfg.adminConnectionString)}\``
        );
        this.description = extractHost(cfg.connectionString);
        break;
      }
      case 'queuesFolder':
        this.iconPath = new vscode.ThemeIcon('layers');
        break;
      case 'topicsFolder':
        this.iconPath = new vscode.ThemeIcon('broadcast');
        break;
      case 'queue': {
        const q = metadata as QueueInfo;
        this.iconPath = new vscode.ThemeIcon('inbox');
        this.description = `${q.activeMessageCount} active, ${q.deadLetterMessageCount} DLQ`;
        this.tooltip = new vscode.MarkdownString(
          `**${q.name}**\n\n` +
          `Active: ${q.activeMessageCount}\n\n` +
          `Dead Letter: ${q.deadLetterMessageCount}\n\n` +
          `Scheduled: ${q.scheduledMessageCount}\n\n` +
          `Size: ${q.sizeInBytes} bytes`
        );
        this.command = {
          command: 'serviceBusEmulator.peekMessages',
          title: 'Peek Messages',
          arguments: [this],
        };
        break;
      }
      case 'topic': {
        const t = metadata as TopicInfo;
        this.iconPath = new vscode.ThemeIcon('broadcast');
        this.description = `${t.subscriptionCount} sub(s)`;
        this.tooltip = new vscode.MarkdownString(
          `**${t.name}**\n\n` +
          `Subscriptions: ${t.subscriptionCount}\n\n` +
          `Scheduled: ${t.scheduledMessageCount}\n\n` +
          `Size: ${t.sizeInBytes} bytes`
        );
        break;
      }
      case 'subscription': {
        const s = metadata as SubscriptionInfo;
        this.iconPath = new vscode.ThemeIcon('mail');
        this.description = `${s.activeMessageCount} active, ${s.deadLetterMessageCount} DLQ`;
        this.tooltip = new vscode.MarkdownString(
          `**${s.subscriptionName}** (topic: ${s.topicName})\n\n` +
          `Active: ${s.activeMessageCount}\n\n` +
          `Dead Letter: ${s.deadLetterMessageCount}`
        );
        this.command = {
          command: 'serviceBusEmulator.peekMessages',
          title: 'Peek Messages',
          arguments: [this],
        };
        break;
      }
    }
  }
}

export class ServiceBusTreeProvider implements vscode.TreeDataProvider<ServiceBusTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ServiceBusTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private client: SidecarClient | null,
    private connectionStore: ConnectionStore
  ) {}

  setClient(client: SidecarClient): void {
    this.client = client;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  refreshItem(_item: ServiceBusTreeItem): void {
    // Full refresh since leaf nodes (queue/subscription) need parent re-fetch to update counts
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ServiceBusTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ServiceBusTreeItem): Promise<ServiceBusTreeItem[]> {
    if (!element) {
      const connections = this.connectionStore.getAll();
      if (connections.length === 0) {
        const placeholder = new vscode.TreeItem('No connections. Click + to add.');
        placeholder.contextValue = 'placeholder';
        return [placeholder as unknown as ServiceBusTreeItem];
      }
      return connections.map(
        (c) =>
          new ServiceBusTreeItem(
            c.name,
            'connection',
            vscode.TreeItemCollapsibleState.Collapsed,
            c.name,
            c
          )
      );
    }

    if (element.itemType === 'connection') {
      return [
        new ServiceBusTreeItem('Queues', 'queuesFolder', vscode.TreeItemCollapsibleState.Collapsed, element.connectionName),
        new ServiceBusTreeItem('Topics', 'topicsFolder', vscode.TreeItemCollapsibleState.Collapsed, element.connectionName),
      ];
    }

    if (!this.client) return [];

    try {
      if (element.itemType === 'queuesFolder') {
        const result = await this.client.listQueues(element.connectionName);
        return result.queues.map(
          (q) => new ServiceBusTreeItem(q.name, 'queue', vscode.TreeItemCollapsibleState.None, element.connectionName, q)
        );
      }

      if (element.itemType === 'topicsFolder') {
        const result = await this.client.listTopics(element.connectionName);
        return result.topics.map(
          (t) =>
            new ServiceBusTreeItem(
              t.name,
              'topic',
              vscode.TreeItemCollapsibleState.Collapsed,
              element.connectionName,
              t
            )
        );
      }

      if (element.itemType === 'topic') {
        const topicMeta = element.metadata as TopicInfo;
        const result = await this.client.listSubscriptions(element.connectionName, topicMeta.name);
        return result.subscriptions.map(
          (s) =>
            new ServiceBusTreeItem(
              s.subscriptionName,
              'subscription',
              vscode.TreeItemCollapsibleState.None,
              element.connectionName,
              s
            )
        );
      }
    } catch (err) {
      vscode.window.showWarningMessage(`Service Bus Explorer [${element.connectionName}]: ${err}`);
    }

    return [];
  }
}

function truncateConnStr(str: string): string {
  return str.length > 60 ? str.substring(0, 60) + '...' : str;
}

function extractHost(connStr: string): string {
  const match = connStr.match(/Endpoint=sb:\/\/([^;/]+)/i);
  return match ? match[1] : '';
}
