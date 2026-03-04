import * as vscode from 'vscode';
import { PeekedMessage } from '../sidecar/protocol';
import { SidecarClient } from '../sidecar/sidecarClient';

export interface PeekContext {
  connectionName: string;
  entityPath: string;
  subscriptionName?: string;
}

export class MessageListPanel {
  public static currentPanels = new Map<string, MessageListPanel>();
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private messages: PeekedMessage[] = [];
  private autoRefreshInterval: ReturnType<typeof setInterval> | null = null;

  public static onTreeRefreshNeeded: (() => void) | null = null;

  public static createOrShow(
    _extensionUri: vscode.Uri,
    displayName: string,
    messages: PeekedMessage[],
    client: SidecarClient,
    context: PeekContext
  ): void {
    const column = vscode.ViewColumn.Beside;

    const existing = MessageListPanel.currentPanels.get(displayName);
    if (existing) {
      existing.panel.reveal(column);
      existing.update(messages);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'serviceBusMessages',
      `Messages: ${displayName}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    const instance = new MessageListPanel(panel, displayName, messages, client, context);
    MessageListPanel.currentPanels.set(displayName, instance);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private displayName: string,
    messages: PeekedMessage[],
    private client: SidecarClient,
    private context: PeekContext
  ) {
    this.panel = panel;
    this.update(messages);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === 'refresh') {
          await this.refreshMessages();
        } else if (msg.command === 'setAutoRefresh') {
          this.setAutoRefresh(msg.seconds);
        } else if (msg.command === 'deleteMessage') {
          await this.deleteMessage(msg.sequenceNumber);
        } else if (msg.command === 'purge') {
          await this.purgeMessages();
        }
      },
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => {
      this.stopAutoRefresh();
      MessageListPanel.currentPanels.delete(this.displayName);
      this.disposables.forEach((d) => d.dispose());
    });
  }

  private async deleteMessage(sequenceNumber: number): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Delete message #${sequenceNumber}?`,
      { modal: true },
      'Delete'
    );
    if (confirm !== 'Delete') return;

    try {
      await this.client.deleteMessage(
        this.context.connectionName,
        this.context.entityPath,
        sequenceNumber,
        this.context.subscriptionName
      );
      await this.refreshMessages();
      MessageListPanel.onTreeRefreshNeeded?.();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to delete message: ${err}`);
    }
  }

  private async purgeMessages(): Promise<void> {
    const entity = this.context.subscriptionName
      ? `${this.context.entityPath}/${this.context.subscriptionName}`
      : this.context.entityPath;

    const confirm = await vscode.window.showWarningMessage(
      `Purge ALL messages from ${entity}?`,
      { modal: true },
      'Purge'
    );
    if (confirm !== 'Purge') return;

    try {
      await this.client.purgeMessages(
        this.context.connectionName,
        this.context.entityPath,
        this.context.subscriptionName
      );
      vscode.window.showInformationMessage(`Purged all messages from ${entity}`);
      await this.refreshMessages();
      MessageListPanel.onTreeRefreshNeeded?.();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to purge messages: ${err}`);
    }
  }

  private async refreshMessages(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('serviceBusEmulator');
      const maxCount = config.get<number>('peekMessageCount', 25);
      const result = await this.client.peekMessages(
        this.context.connectionName,
        this.context.entityPath,
        this.context.subscriptionName,
        maxCount
      );
      this.update(result.messages);
      MessageListPanel.onTreeRefreshNeeded?.();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to refresh messages: ${err}`);
    }
  }

  private setAutoRefresh(seconds: number): void {
    this.stopAutoRefresh();
    if (seconds > 0) {
      this.autoRefreshInterval = setInterval(() => this.refreshMessages(), seconds * 1000);
    }
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  public update(messages: PeekedMessage[]): void {
    this.messages = messages;
    this.panel.webview.html = this.getHtml(messages);
  }

  private getHtml(messages: PeekedMessage[]): string {
    const rows = messages
      .map(
        (m, i) => `
        <tr class="message-row" onclick="toggleDetail(${i})">
          <td>${m.sequenceNumber}</td>
          <td title="${escapeAttr(m.messageId)}">${truncate(m.messageId, 20)}</td>
          <td>${formatDate(m.enqueuedTime)}</td>
          <td>${escapeHtml(m.contentType)}</td>
          <td>${escapeHtml(m.subject ?? '')}</td>
          <td>${escapeHtml(m.state)}</td>
          <td class="actions-cell"><button class="delete-btn" onclick="deleteMessage(event, ${m.sequenceNumber})" title="Delete message">&#x2715;</button></td>
        </tr>
        <tr class="detail-row" id="detail-${i}" style="display:none">
          <td colspan="7">
            <div class="detail-section">
              <strong>Body:</strong>
              <pre>${escapeHtml(tryFormatJson(m.body))}</pre>
            </div>
            <div class="detail-section">
              <strong>Application Properties:</strong>
              <pre>${escapeHtml(JSON.stringify(m.applicationProperties, null, 2))}</pre>
            </div>
            <div class="detail-meta">
              <span><strong>Correlation ID:</strong> ${escapeHtml(m.correlationId ?? 'N/A')}</span>
              <span><strong>Delivery Count:</strong> ${m.deliveryCount}</span>
              <span><strong>Expires:</strong> ${formatDate(m.expiresAt)}</span>
            </div>
          </td>
        </tr>`
      )
      .join('');

    const emptyMessage = messages.length === 0
      ? '<p class="empty">No messages found in this entity.</p>'
      : '';

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      font-size: 13px;
    }
    h2 { margin-top: 0; display: inline; }
    .count { color: var(--vscode-descriptionForeground); font-weight: normal; }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .toolbar-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 12px;
      cursor: pointer;
      border-radius: 2px;
      font-size: 12px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.refreshing { opacity: 0.6; cursor: wait; }
    select {
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      padding: 2px 6px;
      font-size: 12px;
      border-radius: 2px;
    }
    label { font-size: 12px; color: var(--vscode-descriptionForeground); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th {
      text-align: left;
      padding: 8px;
      border-bottom: 2px solid var(--vscode-panel-border);
      background: var(--vscode-editor-selectionBackground);
      position: sticky;
      top: 0;
    }
    td { padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    .message-row { cursor: pointer; }
    .message-row:hover { background: var(--vscode-list-hoverBackground); }
    .detail-row td { background: var(--vscode-editor-inactiveSelectionBackground); }
    pre {
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 400px;
      overflow: auto;
      background: var(--vscode-textCodeBlock-background);
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    .detail-section { margin: 8px 0; }
    .detail-meta { display: flex; gap: 24px; margin-top: 8px; font-size: 12px; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    .last-refresh { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .actions-cell { width: 36px; text-align: center; }
    .delete-btn {
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid transparent;
      padding: 2px 6px;
      cursor: pointer;
      border-radius: 3px;
      font-size: 12px;
      opacity: 0.5;
    }
    .delete-btn:hover { opacity: 1; border-color: var(--vscode-errorForeground); }
    .delete-btn.deleting { opacity: 0.3; cursor: wait; }
    .purge-btn {
      background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
    }
    .purge-btn:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="toolbar">
    <h2>${escapeHtml(this.displayName)} <span class="count">(${messages.length} messages)</span></h2>
    <div class="toolbar-right">
      <span class="last-refresh" id="lastRefresh">Updated: ${new Date().toLocaleTimeString()}</span>
      <label for="autoRefresh">Auto:</label>
      <select id="autoRefresh" onchange="setAutoRefresh(this.value)">
        <option value="0">Off</option>
        <option value="5">5s</option>
        <option value="10">10s</option>
        <option value="30">30s</option>
      </select>
      <button id="refreshBtn" onclick="refresh()">Refresh</button>
      <button class="purge-btn" onclick="purge()">Purge All</button>
    </div>
  </div>
  ${emptyMessage}
  ${messages.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Seq#</th>
        <th>Message ID</th>
        <th>Enqueued</th>
        <th>Content Type</th>
        <th>Subject</th>
        <th>State</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>` : ''}
  <script>
    const vscode = acquireVsCodeApi();
    function toggleDetail(i) {
      const row = document.getElementById('detail-' + i);
      if (row) {
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
      }
    }
    function refresh() {
      const btn = document.getElementById('refreshBtn');
      btn.classList.add('refreshing');
      btn.textContent = 'Refreshing...';
      vscode.postMessage({ command: 'refresh' });
    }
    function setAutoRefresh(seconds) {
      vscode.postMessage({ command: 'setAutoRefresh', seconds: parseInt(seconds, 10) });
    }
    function purge() {
      vscode.postMessage({ command: 'purge' });
    }
    function deleteMessage(e, sequenceNumber) {
      e.stopPropagation();
      e.target.classList.add('deleting');
      e.target.disabled = true;
      vscode.postMessage({ command: 'deleteMessage', sequenceNumber: sequenceNumber });
    }
  </script>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
