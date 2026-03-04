import { ChildProcess, spawn } from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';

export class SidecarProcess implements vscode.Disposable {
  private process: ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('Service Bus Emulator Sidecar');
  }

  async start(): Promise<ChildProcess> {
    const config = vscode.workspace.getConfiguration('serviceBusEmulator');
    const dotnetPath = config.get<string>('dotnetPath', 'dotnet');

    const sidecarDll = path.join(
      this.context.extensionPath,
      'sidecar',
      'bin',
      'ServiceBusEmulatorSidecar.dll'
    );

    this.outputChannel.appendLine(`[sidecar] Starting: ${dotnetPath} ${sidecarDll}`);

    this.process = spawn(dotnetPath, [sidecarDll], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.outputChannel.appendLine(`[sidecar] ${data.toString().trim()}`);
    });

    this.process.on('error', (err) => {
      this.outputChannel.appendLine(`[sidecar] Process error: ${err.message}`);
    });

    this.process.on('exit', (code) => {
      this.outputChannel.appendLine(`[sidecar] Process exited with code ${code}`);
      this.process = null;
    });

    await this.waitForReady();

    this.outputChannel.appendLine('[sidecar] Ready');
    return this.process;
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sidecar did not send ready signal within 15 seconds'));
      }, 15000);

      let buffer = '';
      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line.trim());
            if (msg.ready) {
              clearTimeout(timeout);
              this.process?.stdout?.removeListener('data', onData);
              resolve();
              return;
            }
          } catch {
            // Not the ready signal yet
          }
        }
        // Keep incomplete last line in buffer
        buffer = lines[lines.length - 1];
      };

      this.process?.stdout?.on('data', onData);
    });
  }

  getProcess(): ChildProcess | null {
    return this.process;
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  dispose(): void {
    if (this.process) {
      try {
        this.process.stdin?.write(
          JSON.stringify({ id: 'shutdown', method: 'shutdown', params: {} }) + '\n'
        );
      } catch {
        // Process may already be dead
      }
      setTimeout(() => {
        this.process?.kill();
        this.process = null;
      }, 2000);
    }
    this.outputChannel.dispose();
  }
}
