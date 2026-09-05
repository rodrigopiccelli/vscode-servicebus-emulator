import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';
import { ServiceBusTreeItem, ServiceBusTreeProvider, resolveEntityTarget } from '../providers/serviceBusTreeProvider';

export function registerPurgeCommand(
  context: vscode.ExtensionContext,
  client: SidecarClient,
  treeProvider: ServiceBusTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serviceBusEmulator.purgeMessages',
      async (item: ServiceBusTreeItem) => {
        const target = resolveEntityTarget(item);
        if (!target) return;

        const confirm = await vscode.window.showWarningMessage(
          `Purge all messages from '${target.entityLabel}' on connection '${target.connectionName}'?`,
          { modal: true },
          'Purge'
        );
        if (confirm !== 'Purge') return;

        try {
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Purging messages from ${target.entityLabel}...`,
            },
            () =>
              client.purgeMessages(
                target.connectionName,
                target.entityPath,
                target.subscriptionName,
                target.deadLetter
              )
          );

          vscode.window.showInformationMessage(
            `Purged ${result.purgedCount} message(s) from '${target.entityLabel}'`
          );
          treeProvider.refresh();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to purge messages: ${err}`);
        }
      }
    )
  );
}
