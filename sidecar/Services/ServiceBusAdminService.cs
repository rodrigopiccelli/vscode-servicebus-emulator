using System.Text.Json;
using Azure.Messaging.ServiceBus.Administration;
using ServiceBusEmulatorSidecar.Models;

namespace ServiceBusEmulatorSidecar.Services;

public class ServiceBusAdminService
{
    private readonly Dictionary<string, ServiceBusAdministrationClient> _clients = new();
    private ServiceBusMessagingService? _messagingService;

    public void SetMessagingService(ServiceBusMessagingService messagingService)
    {
        _messagingService = messagingService;
    }

    public void AddConnection(string name, string adminConnectionString)
    {
        _clients[name] = new ServiceBusAdministrationClient(adminConnectionString);
    }

    public void RemoveConnection(string name)
    {
        _clients.Remove(name);
    }

    private ServiceBusAdministrationClient GetClient(JsonElement? paramsElement)
    {
        var name = paramsElement?.GetProperty("connectionName").GetString()
            ?? throw new InvalidOperationException("connectionName is required");
        return _clients.TryGetValue(name, out var client)
            ? client
            : throw new InvalidOperationException($"Connection '{name}' not found. Call 'addConnection' first.");
    }

    private string GetConnectionName(JsonElement? paramsElement)
    {
        return paramsElement?.GetProperty("connectionName").GetString()
            ?? throw new InvalidOperationException("connectionName is required");
    }

    public async Task<object> ListQueuesAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var connectionName = GetConnectionName(paramsElement);
        var queues = new List<QueueInfo>();

        // Collect queue names from admin API
        var queueNames = new List<string>();
        await foreach (var props in client.GetQueuesRuntimePropertiesAsync())
        {
            queueNames.Add(props.Name);
        }

        // Use AMQP peek to get accurate message counts
        // (the emulator's admin HTTP API always returns zeros)
        foreach (var name in queueNames)
        {
            var (active, deadLetter) = _messagingService != null
                ? await _messagingService.CountMessagesAsync(connectionName, name)
                : (0, 0);

            queues.Add(new QueueInfo
            {
                Name = name,
                ActiveMessageCount = active,
                DeadLetterMessageCount = deadLetter,
                ScheduledMessageCount = 0,
                TotalMessageCount = active + deadLetter,
                SizeInBytes = 0
            });
        }

        return new { queues };
    }

    public async Task<object> ListTopicsAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var topics = new List<TopicInfo>();

        await foreach (var props in client.GetTopicsRuntimePropertiesAsync())
        {
            topics.Add(new TopicInfo
            {
                Name = props.Name,
                SubscriptionCount = props.SubscriptionCount,
                ScheduledMessageCount = props.ScheduledMessageCount,
                SizeInBytes = props.SizeInBytes
            });
        }

        return new { topics };
    }

    public async Task<object> ListSubscriptionsAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var connectionName = GetConnectionName(paramsElement);
        var topicName = paramsElement!.Value.GetProperty("topicName").GetString()!;
        var subs = new List<SubscriptionInfo>();

        // Collect subscription names from admin API
        var subNames = new List<string>();
        await foreach (var props in client.GetSubscriptionsRuntimePropertiesAsync(topicName))
        {
            subNames.Add(props.SubscriptionName);
        }

        // Use AMQP peek to get accurate message counts
        foreach (var subName in subNames)
        {
            var (active, deadLetter) = _messagingService != null
                ? await _messagingService.CountMessagesAsync(connectionName, topicName, subName)
                : (0, 0);

            subs.Add(new SubscriptionInfo
            {
                SubscriptionName = subName,
                TopicName = topicName,
                ActiveMessageCount = active,
                DeadLetterMessageCount = deadLetter,
                TotalMessageCount = active + deadLetter
            });
        }

        return new { subscriptions = subs };
    }

    public async Task<object> CreateQueueAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var queueName = paramsElement!.Value.GetProperty("queueName").GetString()!;
        await client.CreateQueueAsync(queueName);
        return new { ok = true, name = queueName };
    }

    public async Task<object> CreateTopicAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var topicName = paramsElement!.Value.GetProperty("topicName").GetString()!;
        await client.CreateTopicAsync(topicName);
        return new { ok = true, name = topicName };
    }

    public async Task<object> CreateSubscriptionAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var topicName = paramsElement!.Value.GetProperty("topicName").GetString()!;
        var subscriptionName = paramsElement!.Value.GetProperty("subscriptionName").GetString()!;
        await client.CreateSubscriptionAsync(topicName, subscriptionName);
        return new { ok = true, topicName, subscriptionName };
    }

    public async Task<object> GetQueueRuntimeAsync(JsonElement? paramsElement)
    {
        var connectionName = GetConnectionName(paramsElement);
        var queueName = paramsElement!.Value.GetProperty("queueName").GetString()!;

        var (active, deadLetter) = _messagingService != null
            ? await _messagingService.CountMessagesAsync(connectionName, queueName)
            : (0, 0);

        return new QueueInfo
        {
            Name = queueName,
            ActiveMessageCount = active,
            DeadLetterMessageCount = deadLetter,
            ScheduledMessageCount = 0,
            TotalMessageCount = active + deadLetter,
            SizeInBytes = 0
        };
    }

    public async Task<object> GetTopicRuntimeAsync(JsonElement? paramsElement)
    {
        var client = GetClient(paramsElement);
        var topicName = paramsElement!.Value.GetProperty("topicName").GetString()!;
        var props = await client.GetTopicRuntimePropertiesAsync(topicName);

        return new TopicInfo
        {
            Name = props.Value.Name,
            SubscriptionCount = props.Value.SubscriptionCount,
            ScheduledMessageCount = props.Value.ScheduledMessageCount,
            SizeInBytes = props.Value.SizeInBytes
        };
    }
}
