using System.Text.Json;
using Azure.Messaging.ServiceBus;
using ServiceBusEmulatorSidecar.Models;

namespace ServiceBusEmulatorSidecar.Services;

public class ServiceBusMessagingService
{
    private readonly Dictionary<string, ServiceBusClient> _clients = new();

    public void AddConnection(string name, string connectionString)
    {
        if (_clients.TryGetValue(name, out var existing))
        {
            _ = existing.DisposeAsync();
        }
        _clients[name] = new ServiceBusClient(connectionString);
    }

    public void RemoveConnection(string name)
    {
        if (_clients.TryGetValue(name, out var client))
        {
            _ = client.DisposeAsync();
            _clients.Remove(name);
        }
    }

    private ServiceBusClient GetClient(JsonElement? paramsElement)
    {
        var name = paramsElement?.GetProperty("connectionName").GetString()
            ?? throw new InvalidOperationException("connectionName is required");
        return _clients.TryGetValue(name, out var client)
            ? client
            : throw new InvalidOperationException($"Connection '{name}' not found.");
    }

    public async Task<object> PeekMessagesAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var entityPath = paramsElement!.Value.GetProperty("entityPath").GetString()!;
        var maxCount = paramsElement.Value.TryGetProperty("maxCount", out var mc) ? mc.GetInt32() : 25;
        var fromSeq = paramsElement.Value.TryGetProperty("fromSequenceNumber", out var fs) ? fs.GetInt64() : 0;

        ServiceBusReceiver receiver;
        if (paramsElement.Value.TryGetProperty("subscriptionName", out var subName) &&
            subName.GetString() is string sub && !string.IsNullOrEmpty(sub))
        {
            receiver = client.CreateReceiver(entityPath, sub);
        }
        else
        {
            receiver = client.CreateReceiver(entityPath);
        }

        await using (receiver)
        {
            var messages = fromSeq > 0
                ? await receiver.PeekMessagesAsync(maxCount, fromSeq)
                : await receiver.PeekMessagesAsync(maxCount);
            return new { messages = messages.Select(MapMessage).ToList() };
        }
    }

    public async Task<object> PeekDeadLetterMessagesAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var entityPath = paramsElement!.Value.GetProperty("entityPath").GetString()!;
        var maxCount = paramsElement.Value.TryGetProperty("maxCount", out var mc) ? mc.GetInt32() : 25;

        ServiceBusReceiver receiver;
        if (paramsElement.Value.TryGetProperty("subscriptionName", out var subName) &&
            subName.GetString() is string sub && !string.IsNullOrEmpty(sub))
        {
            receiver = client.CreateReceiver(entityPath, sub,
                new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });
        }
        else
        {
            receiver = client.CreateReceiver(entityPath,
                new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });
        }

        await using (receiver)
        {
            var messages = await receiver.PeekMessagesAsync(maxCount);
            return new { messages = messages.Select(MapMessage).ToList() };
        }
    }

    public async Task<object> SendMessageAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var entityPath = paramsElement!.Value.GetProperty("entityPath").GetString()!;
        var body = paramsElement.Value.GetProperty("body").GetString()!;

        var message = new ServiceBusMessage(body);

        if (paramsElement.Value.TryGetProperty("contentType", out var ct) && ct.GetString() is string contentType)
            message.ContentType = contentType;
        if (paramsElement.Value.TryGetProperty("subject", out var subj) && subj.GetString() is string subject)
            message.Subject = subject;
        if (paramsElement.Value.TryGetProperty("correlationId", out var cid) && cid.GetString() is string correlationId)
            message.CorrelationId = correlationId;
        if (paramsElement.Value.TryGetProperty("applicationProperties", out var props) &&
            props.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in props.EnumerateObject())
                message.ApplicationProperties[prop.Name] = prop.Value.GetString() ?? "";
        }

        await using var sender = client.CreateSender(entityPath);
        await sender.SendMessageAsync(message);
        return new { ok = true };
    }

    public async Task<object> PurgeMessagesAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var entityPath = paramsElement!.Value.GetProperty("entityPath").GetString()!;

        ServiceBusReceiver receiver;
        if (paramsElement.Value.TryGetProperty("subscriptionName", out var subName) &&
            subName.GetString() is string sub && !string.IsNullOrEmpty(sub))
        {
            receiver = client.CreateReceiver(entityPath, sub,
                new ServiceBusReceiverOptions { ReceiveMode = ServiceBusReceiveMode.ReceiveAndDelete });
        }
        else
        {
            receiver = client.CreateReceiver(entityPath,
                new ServiceBusReceiverOptions { ReceiveMode = ServiceBusReceiveMode.ReceiveAndDelete });
        }

        int purgedCount = 0;
        await using (receiver)
        {
            while (true)
            {
                var batch = await receiver.ReceiveMessagesAsync(maxMessages: 100, maxWaitTime: TimeSpan.FromSeconds(2));
                if (batch.Count == 0) break;
                purgedCount += batch.Count;
            }
        }

        return new { purgedCount };
    }

    public async Task<object> DeleteMessageAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var entityPath = paramsElement!.Value.GetProperty("entityPath").GetString()!;
        var sequenceNumber = paramsElement.Value.GetProperty("sequenceNumber").GetInt64();

        ServiceBusReceiver receiver;
        if (paramsElement.Value.TryGetProperty("subscriptionName", out var subName) &&
            subName.GetString() is string sub && !string.IsNullOrEmpty(sub))
        {
            receiver = client.CreateReceiver(entityPath, sub);
        }
        else
        {
            receiver = client.CreateReceiver(entityPath);
        }

        await using (receiver)
        {
            // Receive messages in batches, complete the target, abandon the rest
            while (true)
            {
                var batch = await receiver.ReceiveMessagesAsync(
                    maxMessages: 50, maxWaitTime: TimeSpan.FromSeconds(3));
                if (batch.Count == 0) break;

                foreach (var msg in batch)
                {
                    if (msg.SequenceNumber == sequenceNumber)
                    {
                        await receiver.CompleteMessageAsync(msg);
                        // Abandon remaining messages in this batch
                        foreach (var other in batch)
                        {
                            if (other.SequenceNumber != sequenceNumber)
                            {
                                try { await receiver.AbandonMessageAsync(other); } catch { }
                            }
                        }
                        return new { ok = true, deletedSequenceNumber = sequenceNumber };
                    }
                }

                // Target not in this batch - abandon all and continue
                foreach (var msg in batch)
                {
                    try { await receiver.AbandonMessageAsync(msg); } catch { }
                }
            }
        }

        throw new InvalidOperationException(
            $"Message with sequence number {sequenceNumber} not found");
    }

    public async Task<(int active, int deadLetter)> CountMessagesAsync(
        string connectionName, string entityPath, string? subscriptionName = null)
    {
        if (!_clients.TryGetValue(connectionName, out var sbClient))
            return (0, 0);

        int active = 0;
        int deadLetter = 0;

        try
        {
            var receiver = string.IsNullOrEmpty(subscriptionName)
                ? sbClient.CreateReceiver(entityPath)
                : sbClient.CreateReceiver(entityPath, subscriptionName);
            await using (receiver)
            {
                var msgs = await receiver.PeekMessagesAsync(maxMessages: 100);
                active = msgs.Count;
            }
        }
        catch { /* queue may not be accessible */ }

        try
        {
            var dlqReceiver = string.IsNullOrEmpty(subscriptionName)
                ? sbClient.CreateReceiver(entityPath, new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter })
                : sbClient.CreateReceiver(entityPath, subscriptionName, new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });
            await using (dlqReceiver)
            {
                var msgs = await dlqReceiver.PeekMessagesAsync(maxMessages: 100);
                deadLetter = msgs.Count;
            }
        }
        catch { /* DLQ may not exist */ }

        return (active, deadLetter);
    }

    private static PeekedMessageInfo MapMessage(ServiceBusReceivedMessage m)
    {
        return new PeekedMessageInfo
        {
            MessageId = m.MessageId,
            SequenceNumber = m.SequenceNumber,
            EnqueuedTime = m.EnqueuedTime.ToString("O"),
            ExpiresAt = m.ExpiresAt.ToString("O"),
            ContentType = m.ContentType ?? "",
            Subject = m.Subject,
            CorrelationId = m.CorrelationId,
            Body = m.Body.ToString(),
            ApplicationProperties = m.ApplicationProperties
                .ToDictionary(kv => kv.Key, kv => kv.Value?.ToString() ?? ""),
            DeliveryCount = m.DeliveryCount,
            State = m.State.ToString()
        };
    }
}
