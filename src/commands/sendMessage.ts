import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';
import { ServiceBusTreeItem } from '../providers/serviceBusTreeProvider';
import { SendMessagePanel } from '../views/sendMessagePanel';

export function registerSendCommand(
  context: vscode.ExtensionContext,
  client: SidecarClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serviceBusEmulator.sendMessage',
      async (item: ServiceBusTreeItem) => {
        if (item.itemType !== 'queue' && item.itemType !== 'topic') return;

        const entityPath = item.label as string;
        SendMessagePanel.createOrShow(context.extensionUri, item.connectionName, entityPath, client);
      }
    )
  );
}
