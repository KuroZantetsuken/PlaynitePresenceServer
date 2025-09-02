# This script simulates Playnite sending a game stop event (clearing activity).

# The endpoint for your Vencord plugin's local server
$endpoint = "http://127.0.0.1:3000/clear-activity"

Write-Host "Sending game stop activity (clearing activity)."
Write-Host "To endpoint: $($endpoint)"

try {
    # Send the HTTP POST request
    Invoke-WebRequest -Uri $endpoint -Method Post | Out-Null
    Write-Host "Successfully sent game stop activity."
} catch {
    Write-Error "Failed to send game stop activity: $($_.Exception.Message)"
}
