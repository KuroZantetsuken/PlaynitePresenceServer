# This script simulates Playnite sending a game stop event (clearing activity).

# The endpoint for your Vencord plugin's local server
$endpoint = "http://127.0.0.1:3000/clear-activity"

$postParams = @{
    title = $Game.Name
} | ConvertTo-Json

Write-Host "Sending game stop activity for: $($Game.Name)"
Write-Host "To endpoint: $($endpoint)"
Write-Host "Payload: $($postParams)"

try {
    # Send the HTTP POST request
    Invoke-RestMethod -Uri $endpoint -Method Post -Body $postParams -ContentType "application/json" | Out-Null
    Write-Host "Successfully sent game stop activity."
} catch {
    Write-Error "Failed to send game stop activity: $($_.Exception.Message)"
}
