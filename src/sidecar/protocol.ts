// JSON-RPC envelope types
export interface JsonRpcRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface JsonRpcResponse {
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

// Stored connection definition
export interface ConnectionConfig {
  name: string;
  endpointHost: string;
  adminEndpointHost: string;
}

export interface ConnectionSecrets {
  connectionString: string;
  adminConnectionString: string;
}

export interface ResolvedConnectionConfig extends ConnectionConfig, ConnectionSecrets {
}

// Domain types matching sidecar output

export interface QueueInfo {
  name: string;
  activeMessageCount: number;
  deadLetterMessageCount: number;
  scheduledMessageCount: number;
  totalMessageCount: number;
  sizeInBytes: number;
  requiresSession: boolean;
}

export interface TopicInfo {
  name: string;
  subscriptionCount: number;
  scheduledMessageCount: number;
  sizeInBytes: number;
}

export interface SubscriptionInfo {
  subscriptionName: string;
  topicName: string;
  activeMessageCount: number;
  deadLetterMessageCount: number;
  totalMessageCount: number;
}

export interface PeekedMessage {
  messageId: string;
  sequenceNumber: number;
  enqueuedTime: string;
  expiresAt: string;
  contentType: string;
  subject: string | null;
  correlationId: string | null;
  sessionId: string | null;
  body: string;
  applicationProperties: Record<string, string>;
  deliveryCount: number;
  state: string;
}
