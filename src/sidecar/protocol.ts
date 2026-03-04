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
  connectionString: string;
  adminConnectionString: string;
}

// Domain types matching sidecar output

export interface QueueInfo {
  name: string;
  activeMessageCount: number;
  deadLetterMessageCount: number;
  scheduledMessageCount: number;
  totalMessageCount: number;
  sizeInBytes: number;
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
  body: string;
  applicationProperties: Record<string, string>;
  deliveryCount: number;
  state: string;
}
