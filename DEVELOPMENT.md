# Service Bus Emulator Explorer

A Visual Studio Code extension for browsing and managing queues, topics, and subscriptions on the [Azure Service Bus Emulator](https://learn.microsoft.com/en-us/azure/service-bus-messaging/overview-emulator).

Existing VS Code extensions for Azure Service Bus depend on the management REST API, which the emulator does not implement. This extension works around that limitation by using a .NET sidecar that leverages the full Azure SDK — `ServiceBusAdministrationClient` for entity listing and `ServiceBusClient` for AMQP messaging operations.

## Features

- **Browse** — Tree view showing connections, queues (with message counts), topics, and subscriptions
- **Peek Messages** — View messages without consuming them, with expandable JSON body and metadata
- **Send Messages** — Compose and send test messages with custom body, content type, subject, correlation ID, and application properties
- **Purge Messages** — Bulk-delete all messages from a queue or subscription
- **Delete Individual Messages** — Remove specific messages by sequence number
- **Multiple Connections** — Manage several emulator instances or configurations side by side
- **Auto-Refresh** — Configurable automatic refresh for both the tree view and message panels

## Prerequisites

- [.NET 8.0 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) installed and on PATH
- [Azure Service Bus Emulator](https://learn.microsoft.com/en-us/azure/service-bus-messaging/overview-emulator) running (Docker)

## Getting Started

### Install from Source

```bash
git clone <repo-url>
cd vscode-servicebus-emulator
npm install
npm run vscode:prepublish
```

Then press **F5** in VS Code to launch the Extension Development Host.

### Package as VSIX

```bash
npm run package
```

Install the resulting `.vsix` file via **Extensions > Install from VSIX...** in VS Code.

### Add a Connection

1. Open the **Service Bus Emulator** panel in the Activity Bar
2. Click the **+** button in the view title
3. Enter a display name, the AMQP connection string, and the admin HTTP connection string

Default emulator connection strings:

| Setting | Default Value |
|---------|--------------|
| Messaging (AMQP) | `Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true` |
| Admin (HTTP) | `Endpoint=http://localhost:5300;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true` |

## Architecture

```
VS Code Extension (TypeScript)
    │  stdin/stdout JSON-RPC (newline-delimited JSON)
    ▼
.NET 8 Sidecar (Console App)
    ├── ServiceBusAdministrationClient → HTTP admin API (list entities)
    └── ServiceBusClient → AMQP (peek, send, delete, purge, count messages)
```

The extension spawns the sidecar on activation and communicates via newline-delimited JSON messages over stdin/stdout. The sidecar emits `{"ready":true}` when it's ready to accept requests. Each request is correlated by a unique `id` field.

### Why a .NET Sidecar?

The `ServiceBusAdministrationClient` (for listing queues, topics, and subscriptions) only works with the emulator from .NET. The JavaScript/TypeScript SDK cannot list entities on the emulator. Using stdin/stdout avoids port management and ties the sidecar lifecycle to the extension.

### Message Counts

The emulator's admin HTTP API always returns zero for message counts. To work around this, the sidecar uses AMQP peek operations (`ServiceBusReceiver.PeekMessagesAsync`) to count active and dead-letter messages.

## Project Structure

```
vscode-servicebus-emulator/
├── src/                                  # TypeScript extension
│   ├── extension.ts                      # Activation, sidecar startup, command registration
│   ├── sidecar/
│   │   ├── protocol.ts                   # JSON-RPC types and domain interfaces
│   │   ├── sidecarProcess.ts             # Spawn .NET process, wait for ready signal
│   │   └── sidecarClient.ts              # JSON-RPC client with request correlation
│   ├── providers/
│   │   └── serviceBusTreeProvider.ts     # Tree view data provider
│   ├── commands/
│   │   ├── manageConnections.ts          # Add, edit, remove connections
│   │   ├── peekMessages.ts              # Open message list webview
│   │   ├── sendMessage.ts               # Open send message webview
│   │   └── purgeMessages.ts             # Purge all messages from entity
│   ├── views/
│   │   ├── messageListPanel.ts           # Peek messages webview (table, detail, delete, purge)
│   │   └── sendMessagePanel.ts           # Send message form webview
│   └── models/
│       └── connectionStore.ts            # Persist connections in VS Code globalState
├── sidecar/                              # .NET 8 console app
│   ├── ServiceBusEmulatorSidecar.csproj
│   ├── Program.cs                        # stdin/stdout read loop, ready signal
│   ├── Protocol/
│   │   ├── JsonRpcMessage.cs             # Request/Response/Error types
│   │   └── RequestRouter.cs              # Method → handler dispatch
│   ├── Services/
│   │   ├── ServiceBusAdminService.cs     # List entities via admin HTTP API
│   │   └── ServiceBusMessagingService.cs # Peek, send, delete, purge via AMQP
│   └── Models/
│       └── QueueInfo.cs                  # QueueInfo, TopicInfo, SubscriptionInfo, PeekedMessage
├── media/                                # SVG icons
├── package.json                          # Extension manifest
├── tsconfig.json
└── webpack.config.js
```

## JSON-RPC Protocol

| Method | Params | Returns |
|--------|--------|---------|
| `ping` | `{}` | `{ok}` |
| `addConnection` | `{name, connectionString, adminConnectionString}` | `{ok}` |
| `removeConnection` | `{name}` | `{ok}` |
| `listQueues` | `{connectionName}` | `{queues: [...]}` |
| `listTopics` | `{connectionName}` | `{topics: [...]}` |
| `listSubscriptions` | `{connectionName, topicName}` | `{subscriptions: [...]}` |
| `getQueueRuntime` | `{connectionName, queueName}` | `{...runtimeProps}` |
| `getTopicRuntime` | `{connectionName, topicName}` | `{...runtimeProps}` |
| `peekMessages` | `{connectionName, entityPath, subscriptionName?, maxCount?}` | `{messages: [...]}` |
| `peekDeadLetterMessages` | `{connectionName, entityPath, subscriptionName?, maxCount?}` | `{messages: [...]}` |
| `sendMessage` | `{connectionName, entityPath, body, contentType?, subject?, ...}` | `{ok}` |
| `deleteMessage` | `{connectionName, entityPath, sequenceNumber, subscriptionName?}` | `{ok, deletedSequenceNumber}` |
| `purgeMessages` | `{connectionName, entityPath, subscriptionName?}` | `{purgedCount}` |
| `shutdown` | `{}` | `{ok}` then exit |

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `serviceBusEmulator.peekMessageCount` | `25` | Number of messages to peek at a time (1–100) |
| `serviceBusEmulator.autoRefreshInterval` | `30` | Tree view auto-refresh interval in seconds (0 to disable) |
| `serviceBusEmulator.dotnetPath` | `dotnet` | Path to the dotnet executable |

## Development

```bash
# Install dependencies
npm install

# Build sidecar
dotnet publish sidecar/ServiceBusEmulatorSidecar.csproj -c Release -o sidecar/bin

# Watch TypeScript changes
npm run watch

# Launch extension (F5 in VS Code)
```

## Known Limitations

- **Message counts via AMQP peek**: Since the emulator admin API returns zero counts, the extension peeks up to 100 messages to estimate counts. Queues with more than 100 messages will show a count of 100.
- **Requires .NET 8 SDK**: The sidecar must be compiled and run with `dotnet`. A clear error message is shown if .NET is not found.
- **Emulator only**: This extension is designed for the local Service Bus Emulator, not for Azure Service Bus in the cloud (use the official Azure Tools extension for that).
