import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';
import { ServiceBusTreeItem, resolveEntityTarget } from '../providers/serviceBusTreeProvider';
import { MessageListPanel } from '../views/messageListPanel';

export function registerPeekCommand(
  context: vscode.ExtensionContext,
  client: SidecarClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serviceBusEmulator.peekMessages',
      async (item: ServiceBusTreeItem) => {
        const target = resolveEntityTarget(item);
        if (!target) return;

        const config = vscode.workspace.getConfiguration('serviceBusEmulator');
        const maxCount = config.get<number>('peekMessageCount', 25);
        const displayName = `[${target.connectionName}] ${target.entityLabel}`;

        try {
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Peeking messages from ${displayName}...`,
            },
            () => client.peekEntityMessages(target, maxCount)
          );

          MessageListPanel.createOrShow(
            context.extensionUri,
            displayName,
            result.messages,
            client,
            target
          );
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to peek messages: ${err}`);
        }
      }
    )
  );
}
