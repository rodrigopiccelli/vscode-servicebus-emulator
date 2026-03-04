using System.Text.Json.Serialization;

namespace ServiceBusEmulatorSidecar.Models;

public class QueueInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("activeMessageCount")]
    public long ActiveMessageCount { get; set; }

    [JsonPropertyName("deadLetterMessageCount")]
    public long DeadLetterMessageCount { get; set; }

    [JsonPropertyName("scheduledMessageCount")]
    public long ScheduledMessageCount { get; set; }

    [JsonPropertyName("totalMessageCount")]
    public long TotalMessageCount { get; set; }

    [JsonPropertyName("sizeInBytes")]
    public long SizeInBytes { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";
}

public class TopicInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("subscriptionCount")]
    public int SubscriptionCount { get; set; }

    [JsonPropertyName("scheduledMessageCount")]
    public long ScheduledMessageCount { get; set; }

    [JsonPropertyName("sizeInBytes")]
    public long SizeInBytes { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";
}

public class SubscriptionInfo
{
    [JsonPropertyName("subscriptionName")]
    public string SubscriptionName { get; set; } = "";

    [JsonPropertyName("topicName")]
    public string TopicName { get; set; } = "";

    [JsonPropertyName("activeMessageCount")]
    public long ActiveMessageCount { get; set; }

    [JsonPropertyName("deadLetterMessageCount")]
    public long DeadLetterMessageCount { get; set; }

    [JsonPropertyName("totalMessageCount")]
    public long TotalMessageCount { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";
}

public class PeekedMessageInfo
{
    [JsonPropertyName("messageId")]
    public string MessageId { get; set; } = "";

    [JsonPropertyName("sequenceNumber")]
    public long SequenceNumber { get; set; }

    [JsonPropertyName("enqueuedTime")]
    public string EnqueuedTime { get; set; } = "";

    [JsonPropertyName("expiresAt")]
    public string ExpiresAt { get; set; } = "";

    [JsonPropertyName("contentType")]
    public string ContentType { get; set; } = "";

    [JsonPropertyName("subject")]
    public string? Subject { get; set; }

    [JsonPropertyName("correlationId")]
    public string? CorrelationId { get; set; }

    [JsonPropertyName("body")]
    public string Body { get; set; } = "";

    [JsonPropertyName("applicationProperties")]
    public Dictionary<string, string> ApplicationProperties { get; set; } = new();

    [JsonPropertyName("deliveryCount")]
    public int DeliveryCount { get; set; }

    [JsonPropertyName("state")]
    public string State { get; set; } = "";
}
