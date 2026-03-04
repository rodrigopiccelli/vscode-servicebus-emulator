import * as vscode from 'vscode';
import { SidecarClient } from '../sidecar/sidecarClient';

export class SendMessagePanel {
  public static onTreeRefreshNeeded: (() => void) | null = null;
  private static currentPanel: SendMessagePanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    _extensionUri: vscode.Uri,
    connectionName: string,
    entityPath: string,
    client: SidecarClient
  ): void {
    const column = vscode.ViewColumn.Beside;

    if (SendMessagePanel.currentPanel) {
      SendMessagePanel.currentPanel.panel.reveal(column);
      SendMessagePanel.currentPanel.updateEntity(connectionName, entityPath);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'serviceBusSendMessage',
      `Send to: ${entityPath}`,
      column,
      { enableScripts: true }
    );

    SendMessagePanel.currentPanel = new SendMessagePanel(panel, connectionName, entityPath, client);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private connectionName: string,
    private entityPath: string,
    private client: SidecarClient
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === 'send') {
          try {
            let appProps: Record<string, string> = {};
            if (msg.applicationProperties) {
              try {
                appProps = JSON.parse(msg.applicationProperties);
              } catch {
                vscode.window.showErrorMessage('Application Properties must be valid JSON');
                return;
              }
            }

            await this.client.sendMessage(this.connectionName, this.entityPath, msg.body, {
              contentType: msg.contentType || undefined,
              subject: msg.subject || undefined,
              correlationId: msg.correlationId || undefined,
              applicationProperties: appProps,
            });

            vscode.window.showInformationMessage(`Message sent to ${this.entityPath}`);
            this.panel.webview.postMessage({ command: 'sent' });
            SendMessagePanel.onTreeRefreshNeeded?.();
          } catch (err) {
            vscode.window.showErrorMessage(`Failed to send: ${err}`);
            this.panel.webview.postMessage({ command: 'error', message: String(err) });
          }
        }
      },
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => {
      SendMessagePanel.currentPanel = undefined;
      this.disposables.forEach((d) => d.dispose());
    });
  }

  updateEntity(connectionName: string, entityPath: string): void {
    this.connectionName = connectionName;
    this.entityPath = entityPath;
    this.panel.title = `Send to: ${entityPath}`;
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
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
    h2 { margin-top: 0; }
    label { display: block; margin-top: 12px; font-weight: bold; font-size: 12px; }
    input, textarea {
      width: 100%;
      padding: 6px 8px;
      margin-top: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      box-sizing: border-box;
      border-radius: 2px;
    }
    input:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    textarea { min-height: 200px; resize: vertical; }
    .actions { margin-top: 16px; display: flex; gap: 8px; align-items: center; }
    button {
      padding: 8px 20px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      border-radius: 2px;
      font-size: 13px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { font-size: 12px; color: var(--vscode-notificationsInfoIcon-foreground); }
    .status.error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <h2>Send Message to: ${escapeHtml(this.entityPath)}</h2>

  <label>Content Type</label>
  <input type="text" id="contentType" value="application/json" />

  <label>Subject (optional)</label>
  <input type="text" id="subject" />

  <label>Correlation ID (optional)</label>
  <input type="text" id="correlationId" />

  <label>Application Properties (JSON, optional)</label>
  <textarea id="appProps" rows="3">{}</textarea>

  <label>Message Body</label>
  <textarea id="body" placeholder='{"key": "value"}'></textarea>

  <div class="actions">
    <button id="sendBtn" onclick="sendMessage()">Send Message</button>
    <span class="status" id="status"></span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function sendMessage() {
      const btn = document.getElementById('sendBtn');
      const status = document.getElementById('status');
      btn.disabled = true;
      status.className = 'status';
      status.textContent = 'Sending...';

      vscode.postMessage({
        command: 'send',
        body: document.getElementById('body').value,
        contentType: document.getElementById('contentType').value,
        subject: document.getElementById('subject').value,
        correlationId: document.getElementById('correlationId').value,
        applicationProperties: document.getElementById('appProps').value,
      });
    }

    window.addEventListener('message', (event) => {
      const btn = document.getElementById('sendBtn');
      const status = document.getElementById('status');
      btn.disabled = false;

      if (event.data.command === 'sent') {
        status.className = 'status';
        status.textContent = 'Message sent successfully!';
      } else if (event.data.command === 'error') {
        status.className = 'status error';
        status.textContent = 'Error: ' + event.data.message;
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
