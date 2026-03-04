import { ChildProcess } from 'child_process';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  QueueInfo,
  TopicInfo,
  SubscriptionInfo,
  PeekedMessage,
} from './protocol';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class SidecarClient {
  private requestId = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private buffer = '';

  constructor(private process: ChildProcess) {
    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.on('exit', () => {
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Sidecar process exited'));
        this.pendingRequests.delete(id);
      }
    });
  }

  private processBuffer(): void {
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIdx).trim();
      this.buffer = this.buffer.substring(newlineIdx + 1);

      if (!line) continue;

      try {
        const response: JsonRpcResponse = JSON.parse(line);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          clearTimeout(pending.timer);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch {
        // Malformed JSON, skip
      }
    }
  }

  private invoke<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = `req-${++this.requestId}`;
    const request: JsonRpcRequest = { id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out after 30 seconds`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });

      const json = JSON.stringify(request) + '\n';
      this.process.stdin?.write(json);
    });
  }

  // Connection management

  async addConnection(
    name: string,
    connectionString: string,
    adminConnectionString: string
  ): Promise<{ ok: boolean }> {
    return this.invoke('addConnection', { name, connectionString, adminConnectionString });
  }

  async removeConnection(name: string): Promise<{ ok: boolean }> {
    return this.invoke('removeConnection', { name });
  }

  // Querying (all require connectionName)

  async listQueues(connectionName: string): Promise<{ queues: QueueInfo[] }> {
    return this.invoke('listQueues', { connectionName });
  }

  async listTopics(connectionName: string): Promise<{ topics: TopicInfo[] }> {
    return this.invoke('listTopics', { connectionName });
  }

  async listSubscriptions(connectionName: string, topicName: string): Promise<{ subscriptions: SubscriptionInfo[] }> {
    return this.invoke('listSubscriptions', { connectionName, topicName });
  }

  async peekMessages(
    connectionName: string,
    entityPath: string,
    subscriptionName?: string,
    maxCount?: number,
    fromSequenceNumber?: number
  ): Promise<{ messages: PeekedMessage[] }> {
    return this.invoke('peekMessages', {
      connectionName,
      entityPath,
      subscriptionName: subscriptionName ?? '',
      maxCount: maxCount ?? 25,
      fromSequenceNumber: fromSequenceNumber ?? 0,
    });
  }

  async peekDeadLetterMessages(
    connectionName: string,
    entityPath: string,
    subscriptionName?: string,
    maxCount?: number
  ): Promise<{ messages: PeekedMessage[] }> {
    return this.invoke('peekDeadLetterMessages', {
      connectionName,
      entityPath,
      subscriptionName: subscriptionName ?? '',
      maxCount: maxCount ?? 25,
    });
  }

  async sendMessage(
    connectionName: string,
    entityPath: string,
    body: string,
    properties?: {
      contentType?: string;
      subject?: string;
      correlationId?: string;
      applicationProperties?: Record<string, string>;
    }
  ): Promise<{ ok: boolean }> {
    return this.invoke('sendMessage', {
      connectionName,
      entityPath,
      body,
      ...properties,
    });
  }

  async purgeMessages(
    connectionName: string,
    entityPath: string,
    subscriptionName?: string
  ): Promise<{ purgedCount: number }> {
    return this.invoke('purgeMessages', {
      connectionName,
      entityPath,
      subscriptionName: subscriptionName ?? '',
    });
  }

  async deleteMessage(
    connectionName: string,
    entityPath: string,
    sequenceNumber: number,
    subscriptionName?: string
  ): Promise<{ ok: boolean; deletedSequenceNumber: number }> {
    return this.invoke('deleteMessage', {
      connectionName,
      entityPath,
      sequenceNumber,
      subscriptionName: subscriptionName ?? '',
    });
  }

  async ping(): Promise<{ ok: boolean }> {
    return this.invoke('ping');
  }
}
