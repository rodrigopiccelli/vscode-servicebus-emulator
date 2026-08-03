import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionSecrets, ResolvedConnectionConfig } from '../sidecar/protocol';

const STORAGE_KEY = 'serviceBusEmulator.connections';
const MIGRATION_KEY = 'serviceBusEmulator.connections.migratedToSecrets';
const SECRET_KEY_PREFIX = 'serviceBusEmulator.connection.';

export class ConnectionStore {
  constructor(
    private globalState: vscode.Memento,
    private secretStorage: vscode.SecretStorage
  ) {}

  async initialize(): Promise<void> {
    const migrated = this.globalState.get<boolean>(MIGRATION_KEY, false);
    if (migrated) {
      return;
    }

    const existing = this.globalState.get<Array<ResolvedConnectionConfig | ConnectionConfig>>(STORAGE_KEY, []);
    if (existing.length === 0) {
      await this.globalState.update(MIGRATION_KEY, true);
      return;
    }

    const migratedConnections: ConnectionConfig[] = [];
    for (const connection of existing) {
      const resolved = this.asResolvedConnection(connection);
      if (resolved) {
        await this.secretStorage.store(this.getSecretKey(resolved.name), JSON.stringify({
          connectionString: resolved.connectionString,
          adminConnectionString: resolved.adminConnectionString,
        }));
        migratedConnections.push(this.toMetadata(resolved.name, resolved.connectionString, resolved.adminConnectionString));
      }
    }

    await this.globalState.update(STORAGE_KEY, migratedConnections);
    await this.globalState.update(MIGRATION_KEY, true);
  }

  getAll(): ConnectionConfig[] {
    return this.globalState.get<ConnectionConfig[]>(STORAGE_KEY, []);
  }

  async add(name: string, secrets: ConnectionSecrets): Promise<void> {
    const connection = this.toMetadata(name, secrets.connectionString, secrets.adminConnectionString);
    const connections = this.getAll();
    const existing = connections.findIndex((c) => c.name === connection.name);
    if (existing >= 0) {
      connections[existing] = connection;
    } else {
      connections.push(connection);
    }
    await this.secretStorage.store(this.getSecretKey(name), JSON.stringify(secrets));
    await this.globalState.update(STORAGE_KEY, connections);
  }

  async remove(name: string): Promise<void> {
    const connections = this.getAll().filter((c) => c.name !== name);
    await this.secretStorage.delete(this.getSecretKey(name));
    await this.globalState.update(STORAGE_KEY, connections);
  }

  get(name: string): ConnectionConfig | undefined {
    return this.getAll().find((c) => c.name === name);
  }

  async getResolved(name: string): Promise<ResolvedConnectionConfig | undefined> {
    const metadata = this.get(name);
    if (!metadata) {
      return undefined;
    }

    const secrets = await this.getSecrets(name);
    if (!secrets) {
      return undefined;
    }

    return { ...metadata, ...secrets };
  }

  async getAllResolved(): Promise<ResolvedConnectionConfig[]> {
    const connections = this.getAll();
    const resolved = await Promise.all(
      connections.map(async (connection) => {
        const secrets = await this.getSecrets(connection.name);
        return secrets ? { ...connection, ...secrets } : undefined;
      })
    );

    return resolved.filter((connection): connection is ResolvedConnectionConfig => connection !== undefined);
  }

  private toMetadata(
    name: string,
    connectionString: string,
    adminConnectionString: string
  ): ConnectionConfig {
    return {
      name,
      endpointHost: this.extractHost(connectionString),
      adminEndpointHost: this.extractHost(adminConnectionString),
    };
  }

  private extractHost(connectionString: string): string {
    const match = connectionString.match(/Endpoint=sb:\/\/([^;/]+)/i);
    return match ? match[1] : '';
  }

  private getSecretKey(name: string): string {
    return `${SECRET_KEY_PREFIX}${name}`;
  }

  private async getSecrets(name: string): Promise<ConnectionSecrets | undefined> {
    const raw = await this.secretStorage.get(this.getSecretKey(name));
    if (!raw) {
      return undefined;
    }

    try {
      return JSON.parse(raw) as ConnectionSecrets;
    } catch {
      return undefined;
    }
  }

  private asResolvedConnection(
    connection: ResolvedConnectionConfig | ConnectionConfig
  ): ResolvedConnectionConfig | undefined {
    if ('connectionString' in connection && 'adminConnectionString' in connection) {
      return {
        name: connection.name,
        endpointHost: this.extractHost(connection.connectionString),
        adminEndpointHost: this.extractHost(connection.adminConnectionString),
        connectionString: connection.connectionString,
        adminConnectionString: connection.adminConnectionString,
      };
    }

    return undefined;
  }
}
