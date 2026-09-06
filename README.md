# Service Bus Emulator Explorer

Browse queues, topics, and subscriptions on the [Azure Service Bus Emulator](https://learn.microsoft.com/en-us/azure/service-bus-messaging/overview-emulator) directly from VS Code.

Existing extensions for Azure Service Bus depend on the management REST API, which the emulator does not support. This extension uses a .NET sidecar with the full Azure SDK, so everything works out of the box with the local emulator.

## Features

- **Browse entities** — Tree view showing connections, queues (with message counts), topics, and subscriptions
- **Create and delete entities** — Create queues (optionally session-enabled), topics, and subscriptions, and delete any of them with a confirmation prompt
- **Peek messages** — View messages without consuming them, with expandable JSON body and metadata
- **Dead-letter queues** — Each queue and subscription has a **Dead-letter** child node in the tree showing its message count; open it to browse dead-lettered messages with their dead-letter reason and description
- **Send messages** — Compose and send test messages with custom body, content type, subject, correlation ID, and application properties; session-enabled queues require a Session ID
- **Purge messages** — Bulk-delete all messages from a queue, subscription, or dead-letter queue, including session-enabled queues
- **Delete individual messages** — Remove specific messages by sequence number
- **Multiple connections** — Manage several emulator instances or configurations side by side
- **Auto-refresh** — Configurable automatic refresh for both the tree view and message panels

## Requirements

- [.NET 8.0 Runtime or SDK](https://dotnet.microsoft.com/download/dotnet/8.0) installed and on PATH
- [Azure Service Bus Emulator](https://learn.microsoft.com/en-us/azure/service-bus-messaging/overview-emulator) running (Docker)

## Getting Started

1. Open the **Service Bus Emulator** panel in the Activity Bar
2. Click the **+** button in the view title to add a connection
3. Enter a display name, the AMQP connection string, and the admin HTTP connection string

### Default Emulator Connection Strings

| Setting | Default Value |
|---------|--------------|
| Messaging (AMQP) | `Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true` |
| Admin (HTTP) | `Endpoint=http://localhost:5300;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true` |

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `serviceBusEmulator.peekMessageCount` | `25` | Number of messages to peek at a time (1–100) |
| `serviceBusEmulator.autoRefreshInterval` | `30` | Tree view auto-refresh interval in seconds (0 to disable) |
| `serviceBusEmulator.dotnetPath` | `dotnet` | Path to the dotnet executable |

## Known Limitations

- **Message counts via AMQP peek** — The emulator admin API returns zero counts, so the extension peeks up to 100 messages to estimate counts. Queues with more than 100 messages will show "100".
- **Requires .NET 8** — The sidecar must run with `dotnet`. A clear error message is shown if it is not found.
- **Emulator only** — This extension is designed for the local Service Bus Emulator, not for Azure Service Bus in the cloud (use the official Azure Tools extension for that).

## License

[MIT](LICENSE)
