$endpoint = "http://127.0.0.1:3000/sync-activity"

try {
    Invoke-RestMethod -Uri $endpoint -Method Post -ErrorAction Stop | Out-Null
}
catch {}