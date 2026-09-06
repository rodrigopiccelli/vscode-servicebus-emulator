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

    // Optional 'deadLetter' flag: when set, the operation targets the entity's
    // dead-letter sub-queue instead of its main queue.
    private static bool IsDeadLetter(JsonElement? paramsElement)
    {
        return paramsElement!.Value.TryGetProperty("deadLetter", out var dl) &&
               dl.ValueKind == JsonValueKind.True;
    }

    // Creates a receiver for the requested entity, honouring the optional
    // 'subscriptionName' param and the dead-letter sub-queue.
    private ServiceBusReceiver CreateReceiver(
        JsonElement? paramsElement,
        bool deadLetter,
        ServiceBusReceiveMode? receiveMode = null)
    {
        var client = GetClient(paramsElement);
        var entityPath = paramsElement!.Value.GetProperty("entityPath").GetString()!;

        var options = new ServiceBusReceiverOptions();
        if (deadLetter)
        {
            options.SubQueue = SubQueue.DeadLetter;
        }
        if (receiveMode.HasValue)
        {
            options.ReceiveMode = receiveMode.Value;
        }

        return paramsElement.Value.TryGetProperty("subscriptionName", out var subName) &&
               subName.GetString() is string sub && !string.IsNullOrEmpty(sub)
            ? client.CreateReceiver(entityPath, sub, options)
            : client.CreateReceiver(entityPath, options);
    }

    public Task<object> PeekMessagesAsync(JsonElement? paramsElement)
        => PeekAsync(paramsElement, IsDeadLetter(paramsElement));

    public Task<object> PeekDeadLetterMessagesAsync(JsonElement? paramsElement)
        => PeekAsync(paramsElement, deadLetter: true);

    private async Task<object> PeekAsync(JsonElement? paramsElement, bool deadLetter)
    {
        var maxCount = paramsElement!.Value.TryGetProperty("maxCount", out var mc) ? mc.GetInt32() : 25;
        var fromSeq = paramsElement.Value.TryGetProperty("fromSequenceNumber", out var fs) ? fs.GetInt64() : 0;

        await using var receiver = CreateReceiver(paramsElement, deadLetter);
        var messages = fromSeq > 0
            ? await receiver.PeekMessagesAsync(maxCount, fromSeq)
            : await receiver.PeekMessagesAsync(maxCount);
        return new { messages = messages.Select(MapMessage).ToList() };
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
        if (paramsElement.Value.TryGetProperty("sessionId", out var sid) && sid.GetString() is string sessionId)
            message.SessionId = sessionId;
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
        var deadLetter = IsDeadLetter(paramsElement);
        var requiresSession = paramsElement!.Value.TryGetProperty("requiresSession", out var rs) &&
            rs.ValueKind == JsonValueKind.True;

        // Session-enabled entities reject a plain receiver; every session must be drained individually.
        int purgedCount = requiresSession && !deadLetter
            ? await PurgeAllSessionsAsync(paramsElement)
            : await PurgeReceiverAsync(paramsElement, deadLetter);

        return new { purgedCount };
    }

    private async Task<int> PurgeReceiverAsync(JsonElement? paramsElement, bool deadLetter)
    {
        await using var receiver = CreateReceiver(
            paramsElement, deadLetter, ServiceBusReceiveMode.ReceiveAndDelete);

        int purgedCount = 0;
        while (true)
        {
            var batch = await receiver.ReceiveMessagesAsync(maxMessages: 100, maxWaitTime: TimeSpan.FromSeconds(2));
            if (batch.Count == 0) break;
            purgedCount += batch.Count;
        }

        return purgedCount;
    }

    private async Task<int> PurgeAllSessionsAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var entityPath = paramsElement!.Value.GetProperty("entityPath").GetString()!;
        var subscriptionName = paramsElement.Value.TryGetProperty("subscriptionName", out var subName) &&
            subName.GetString() is string sub && !string.IsNullOrEmpty(sub) ? sub : null;

        var options = new ServiceBusSessionReceiverOptions { ReceiveMode = ServiceBusReceiveMode.ReceiveAndDelete };
        int purgedCount = 0;

        while (true)
        {
            // The emulator doesn't reliably throw ServiceTimeout when no sessions remain,
            // so bound the wait ourselves to avoid hanging forever.
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            ServiceBusSessionReceiver sessionReceiver;
            try
            {
                sessionReceiver = subscriptionName != null
                    ? await client.AcceptNextSessionAsync(entityPath, subscriptionName, options, cts.Token)
                    : await client.AcceptNextSessionAsync(entityPath, options, cts.Token);
            }
            catch (ServiceBusException ex) when (ex.Reason == ServiceBusFailureReason.ServiceTimeout)
            {
                // No more sessions available - every session has been drained.
                break;
            }
            catch (OperationCanceledException)
            {
                // No session became available within the timeout - treat as drained.
                break;
            }

            await using (sessionReceiver)
            {
                while (true)
                {
                    var batch = await sessionReceiver.ReceiveMessagesAsync(maxMessages: 100, maxWaitTime: TimeSpan.FromSeconds(2));
                    if (batch.Count == 0) break;
                    purgedCount += batch.Count;
                }
            }
        }

        return purgedCount;
    }

    public async Task<object> DeleteMessageAsync(JsonElement? paramsElement)
    {
        var sequenceNumber = paramsElement!.Value.GetProperty("sequenceNumber").GetInt64();
        var sessionId = paramsElement.Value.TryGetProperty("sessionId", out var sidProp)
            ? sidProp.GetString()
            : null;
        var deadLetter = IsDeadLetter(paramsElement);

        // Session-enabled entities require a session-scoped receiver to lock and complete messages.
        await using (var receiver = !string.IsNullOrEmpty(sessionId) && !deadLetter
            ? await CreateSessionReceiverAsync(paramsElement, sessionId!)
            : CreateReceiver(paramsElement, deadLetter))
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

    // Accepts a session-locked receiver for the requested entity/session, honouring the
    // optional 'subscriptionName' param.
    private async Task<ServiceBusSessionReceiver> CreateSessionReceiverAsync(
        JsonElement? paramsElement, string sessionId)
    {
        var client = GetClient(paramsElement);
        var entityPath = paramsElement!.Value.GetProperty("entityPath").GetString()!;

        return paramsElement.Value.TryGetProperty("subscriptionName", out var subName) &&
               subName.GetString() is string sub && !string.IsNullOrEmpty(sub)
            ? await client.AcceptSessionAsync(entityPath, sub, sessionId)
            : await client.AcceptSessionAsync(entityPath, sessionId);
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
            SessionId = m.SessionId,
            Body = m.Body.ToString(),
            ApplicationProperties = m.ApplicationProperties
                .ToDictionary(kv => kv.Key, kv => kv.Value?.ToString() ?? ""),
            DeliveryCount = m.DeliveryCount,
            State = m.State.ToString(),
            DeadLetterReason = m.DeadLetterReason,
            DeadLetterErrorDescription = m.DeadLetterErrorDescription
        };
    }
}
