using System.Text.Json;
using ServiceBusEmulatorSidecar.Protocol;
using ServiceBusEmulatorSidecar.Services;

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false
};

var adminService = new ServiceBusAdminService();
var messagingService = new ServiceBusMessagingService();
adminService.SetMessagingService(messagingService);
var router = new RequestRouter(adminService, messagingService);

// Ensure stdout is not buffered (critical for piped communication)
Console.OutputEncoding = System.Text.Encoding.UTF8;
var stdout = new StreamWriter(Console.OpenStandardOutput(), System.Text.Encoding.UTF8)
{
    AutoFlush = true
};

// Send ready signal
stdout.WriteLine(JsonSerializer.Serialize(new { ready = true }, jsonOptions));

// Main read loop
while (true)
{
    var line = await Console.In.ReadLineAsync();
    if (line is null) break; // stdin closed = extension shut down

    if (string.IsNullOrWhiteSpace(line)) continue;

    try
    {
        var request = JsonSerializer.Deserialize<JsonRpcRequest>(line, jsonOptions);
        if (request is null)
        {
            Console.Error.WriteLine("[WARN] Received null request, skipping");
            continue;
        }

        var response = await router.HandleAsync(request);
        stdout.WriteLine(JsonSerializer.Serialize(response, jsonOptions));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[ERROR] Unhandled: {ex}");
        var errorResponse = new JsonRpcResponse
        {
            Id = "unknown",
            Error = new JsonRpcError { Code = -1, Message = ex.Message }
        };
        stdout.WriteLine(JsonSerializer.Serialize(errorResponse, jsonOptions));
    }
}
