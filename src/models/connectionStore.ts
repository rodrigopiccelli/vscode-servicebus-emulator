import * as vscode from 'vscode';
import { ConnectionConfig } from '../sidecar/protocol';

const STORAGE_KEY = 'serviceBusEmulator.connections';

export class ConnectionStore {
  constructor(private globalState: vscode.Memento) {}

  getAll(): ConnectionConfig[] {
    return this.globalState.get<ConnectionConfig[]>(STORAGE_KEY, []);
  }

  async add(connection: ConnectionConfig): Promise<void> {
    const connections = this.getAll();
    const existing = connections.findIndex((c) => c.name === connection.name);
    if (existing >= 0) {
      connections[existing] = connection;
    } else {
      connections.push(connection);
    }
    await this.globalState.update(STORAGE_KEY, connections);
  }

  async remove(name: string): Promise<void> {
    const connections = this.getAll().filter((c) => c.name !== name);
    await this.globalState.update(STORAGE_KEY, connections);
  }

  get(name: string): ConnectionConfig | undefined {
    return this.getAll().find((c) => c.name === name);
  }
}
