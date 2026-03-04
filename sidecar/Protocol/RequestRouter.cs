using System.Text.Json;
using ServiceBusEmulatorSidecar.Services;

namespace ServiceBusEmulatorSidecar.Protocol;

public class RequestRouter
{
    private readonly Dictionary<string, Func<JsonElement?, Task<object>>> _handlers;

    public RequestRouter(ServiceBusAdminService admin, ServiceBusMessagingService messaging)
    {
        _handlers = new Dictionary<string, Func<JsonElement?, Task<object>>>
        {
            ["ping"] = _ => Task.FromResult<object>(new { ok = true }),
            ["addConnection"] = p =>
            {
                var name = p?.GetProperty("name").GetString() ?? "";
                var connStr = p?.GetProperty("connectionString").GetString() ?? "";
                var adminConnStr = p?.GetProperty("adminConnectionString").GetString() ?? "";
                admin.AddConnection(name, adminConnStr);
                messaging.AddConnection(name, connStr);
                return Task.FromResult<object>(new { ok = true });
            },
            ["removeConnection"] = p =>
            {
                var name = p?.GetProperty("name").GetString() ?? "";
                admin.RemoveConnection(name);
                messaging.RemoveConnection(name);
                return Task.FromResult<object>(new { ok = true });
            },
            ["listQueues"] = p => admin.ListQueuesAsync(p),
            ["listTopics"] = p => admin.ListTopicsAsync(p),
            ["listSubscriptions"] = p => admin.ListSubscriptionsAsync(p),
            ["getQueueRuntime"] = p => admin.GetQueueRuntimeAsync(p),
            ["getTopicRuntime"] = p => admin.GetTopicRuntimeAsync(p),
            ["peekMessages"] = p => messaging.PeekMessagesAsync(p),
            ["peekDeadLetterMessages"] = p => messaging.PeekDeadLetterMessagesAsync(p),
            ["sendMessage"] = p => messaging.SendMessageAsync(p),
            ["purgeMessages"] = p => messaging.PurgeMessagesAsync(p),
            ["deleteMessage"] = p => messaging.DeleteMessageAsync(p),
            ["shutdown"] = _ =>
            {
                Environment.Exit(0);
                return Task.FromResult<object>(new { ok = true });
            }
        };
    }

    public async Task<JsonRpcResponse> HandleAsync(JsonRpcRequest request)
    {
        if (!_handlers.TryGetValue(request.Method, out var handler))
        {
            return new JsonRpcResponse
            {
                Id = request.Id,
                Error = new JsonRpcError { Code = -32601, Message = $"Unknown method: {request.Method}" }
            };
        }

        try
        {
            var result = await handler(request.Params);
            return new JsonRpcResponse { Id = request.Id, Result = result };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ERROR] {request.Method}: {ex}");
            return new JsonRpcResponse
            {
                Id = request.Id,
                Error = new JsonRpcError { Code = -1, Message = ex.Message }
            };
        }
    }
}
