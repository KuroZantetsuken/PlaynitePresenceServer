# This script simulates Playnite sending a game start event.

# The endpoint for your Vencord plugin's local server
$endpoint = "http://127.0.0.1:3000/set-activity"

# The data to be sent in the request body
# The Vencord plugin expects a JSON object with a "title" and "exeName" property.
$postParams = @{
    title = $Game.Name;
    exeName = Split-Path -Path $Game.GameActions[0].Path -Leaf
} | ConvertTo-Json

Write-Host "Sending game start activity for: $($Game.Name)"
Write-Host "To endpoint: $($endpoint)"
Write-Host "Payload: $($postParams)"

try {
    # Send the HTTP POST request
    Invoke-RestMethod -Uri $endpoint -Method Post -Body $postParams -ContentType "application/json" | Out-Null
    Write-Host "Successfully sent game start activity."
} catch {
    Write-Error "Failed to send game start activity: $($_.Exception.Message)"
}
