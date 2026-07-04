param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerVersion,
  [string]$ServiceUrl = "https://install.kingkung.men",
  [string]$ReceiptPath = (Join-Path $env:LOCALAPPDATA "codyx-installer\verification.json"),
  [switch]$NonInteractive,
  [string]$DisplayName = "",
  [scriptblock]$RequestAction,
  [scriptblock]$ReadAction = { param($Prompt) Read-Host $Prompt },
  [scriptblock]$SleepAction = { param($Seconds) Start-Sleep -Seconds $Seconds }
)

$ErrorActionPreference = "Stop"

function Write-VerificationStep($Message) {
  Write-Host ">> $Message" -ForegroundColor Cyan
}

function Write-VerificationOk($Message) {
  Write-Host "[ok] $Message" -ForegroundColor Green
}

function Write-VerificationWarn($Message) {
  Write-Host "[warn] $Message" -ForegroundColor Yellow
}

function Write-VerificationError($Message) {
  Write-Host "[error] $Message" -ForegroundColor Red
}

function New-VerificationResult($Success, $Status, $Message = "", $RetryAfter = $null) {
  return [pscustomobject]@{
    Success = [bool]$Success
    Status = $Status
    Message = $Message
    RetryAfter = $RetryAfter
  }
}

function Test-InstallId($Value) {
  $parsed = [guid]::Empty
  return $Value -and [guid]::TryParse([string]$Value, [ref]$parsed)
}

function Test-EmailAddress($Value) {
  if (-not $Value -or $Value.Length -gt 254) { return $false }
  try {
    $address = [System.Net.Mail.MailAddress]::new($Value)
    return $address.Address.Equals($Value, [System.StringComparison]::OrdinalIgnoreCase)
  } catch {
    return $false
  }
}

function Get-EmailTypoSuggestion($Value) {
  if (-not $Value -or $Value -notmatch "@") { return $null }
  $parts = [string]$Value -split "@", 2
  if ($parts.Count -ne 2) { return $null }
  $localPart = $parts[0]
  $domain = $parts[1].ToLowerInvariant()
  $suggestions = @{
    "agmail.com" = "gmail.com"
    "gamil.com" = "gmail.com"
    "gmial.com" = "gmail.com"
    "gmai.com" = "gmail.com"
    "gmail.co" = "gmail.com"
    "gmail.con" = "gmail.com"
    "hotnail.com" = "hotmail.com"
    "hotmai.com" = "hotmail.com"
    "hotmail.co" = "hotmail.com"
    "outlok.com" = "outlook.com"
    "outlook.co" = "outlook.com"
    "yaho.com" = "yahoo.com"
    "yahoo.co" = "yahoo.com"
  }
  if (-not $suggestions.ContainsKey($domain)) { return $null }
  return "$localPart@$($suggestions[$domain])"
}

function Test-DisplayName($Value) {
  return -not [string]::IsNullOrWhiteSpace($Value) -and $Value.Trim().Length -le 100
}

function Get-ErrorResponse($ErrorRecord) {
  $statusCode = 0
  $retryAfter = $null
  try {
    $statusCode = [int]$ErrorRecord.Exception.Response.StatusCode
    $retryAfter = $ErrorRecord.Exception.Response.Headers["Retry-After"]
  } catch {}

  $code = "request_failed"
  $message = "The verification service could not process the request."
  try {
    $details = $ErrorRecord.ErrorDetails.Message | ConvertFrom-Json
    if ($details.error) { $code = [string]$details.error }
    if ($details.message) { $message = [string]$details.message }
  } catch {
    if ($ErrorRecord.Exception.Message) { $message = $ErrorRecord.Exception.Message }
  }

  return [pscustomobject]@{
    Success = $false
    StatusCode = $statusCode
    Code = $code
    Message = $message
    RetryAfter = $retryAfter
    Transient = ($statusCode -eq 0 -or $statusCode -eq 408 -or $statusCode -ge 500)
  }
}

$Script:isDefaultRequestAction = -not $RequestAction
if (-not $RequestAction) {
  $RequestAction = {
    param($Method, $Uri, $Body)
    try {
      $parameters = @{
        Uri = $Uri
        Method = $Method
        TimeoutSec = 20
        Headers = @{ Accept = "application/json" }
      }
      if ($null -ne $Body) {
        $parameters.ContentType = "application/json"
        $parameters.Body = $Body | ConvertTo-Json -Depth 5 -Compress
      }
      $response = Invoke-RestMethod @parameters
      return [pscustomobject]@{
        Success = $true
        StatusCode = 200
        Body = $response
        Code = $null
        Message = $null
        RetryAfter = $null
        Transient = $false
      }
    } catch {
      return Get-ErrorResponse $_
    }
  }
}

function Invoke-VerificationRequestSync($Method, $Uri, $Body) {
  try {
    $parameters = @{
      Uri = $Uri
      Method = $Method
      TimeoutSec = 20
      Headers = @{ Accept = "application/json" }
    }
    if ($null -ne $Body) {
      $parameters.ContentType = "application/json"
      $parameters.Body = $Body | ConvertTo-Json -Depth 5 -Compress
    }
    $response = Invoke-RestMethod @parameters
    return [pscustomobject]@{
      Success = $true
      StatusCode = 200
      Body = $response
      Code = $null
      Message = $null
      RetryAfter = $null
      Transient = $false
    }
  } catch {
    return Get-ErrorResponse $_
  }
}

function Invoke-WithProgress {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body,
    [string]$StatusText = "Connecting..."
  )

  # Check if we are in non-interactive mode or launcher UI mode
  if ($NonInteractive -or $env:CODY_LAUNCHER_UI -eq "1") {
    return Invoke-VerificationRequestSync $Method $Uri $Body
  }

  $ps = [PowerShell]::Create()
  
  $sb = {
    param($Method, $Uri, $BodyJson)
    
    function Get-ErrorResponseInternal($ErrorRecord) {
      $statusCode = 0
      $retryAfter = $null
      try {
        $statusCode = [int]$ErrorRecord.Exception.Response.StatusCode
        $retryAfter = $ErrorRecord.Exception.Response.Headers["Retry-After"]
      } catch {}

      $code = "request_failed"
      $message = "The verification service could not process the request."
      try {
        $details = $ErrorRecord.ErrorDetails.Message | ConvertFrom-Json
        if ($details.error) { $code = [string]$details.error }
        if ($details.message) { $message = [string]$details.message }
      } catch {
        if ($ErrorRecord.Exception.Message) { $message = $ErrorRecord.Exception.Message }
      }

      return [pscustomobject]@{
        Success = $false
        StatusCode = $statusCode
        Code = $code
        Message = $message
        RetryAfter = $retryAfter
        Transient = ($statusCode -eq 0 -or $statusCode -eq 408 -or $statusCode -ge 500)
      }
    }

    try {
      $parameters = @{
        Uri = $Uri
        Method = $Method
        TimeoutSec = 20
        Headers = @{ Accept = "application/json" }
      }
      if ($null -ne $BodyJson -and $BodyJson -ne "") {
        $parameters.ContentType = "application/json"
        $parameters.Body = $BodyJson
      }
      $response = Invoke-RestMethod @parameters
      return [pscustomobject]@{
        Success = $true
        StatusCode = 200
        Body = $response
        Code = $null
        Message = $null
        RetryAfter = $null
        Transient = $false
      }
    } catch {
      return Get-ErrorResponseInternal $_
    }
  }

  $bodyJson = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 5 -Compress } else { "" }
  $null = $ps.AddScript($sb)
  $null = $ps.AddArgument($Method)
  $null = $ps.AddArgument($Uri)
  $null = $ps.AddArgument($bodyJson)
  
  $asyncResult = $ps.BeginInvoke()

  $colors = @(196, 202, 208, 214, 220, 226, 190, 154, 118, 82, 46, 51, 21, 57, 93, 129, 165, 201)
  $chars = @([char]0x2588, [char]0x2593, [char]0x2592, [char]0x2591)
  $tick = 0

  while (-not $asyncResult.IsCompleted) {
    $bar = ""
    for ($i = 0; $i -lt 25; $i++) {
      $color = $colors[($tick + $i) % $colors.Count]
      if ((Get-Random -Minimum 0 -Maximum 10) -eq 0) {
        $bar += "$([char]27)[38;5;231m$([char]0x2726)"
      } else {
        $charIndex = [math]::Floor(($tick + $i) / 2) % $chars.Count
        $char = $chars[$charIndex]
        $bar += "$([char]27)[38;5;${color}m$char"
      }
    }
    Write-Host -NoNewline "`r$([char]27)[94m[Codyx]$([char]27)[0m $StatusText $bar$([char]27)[0m"
    $tick++
    Start-Sleep -Milliseconds 80
  }

  Write-Host -NoNewline "`r$([char]27)[K"

  $res = $ps.EndInvoke($asyncResult)
  $ps.Dispose()

  if ($null -eq $res -or $res.Count -eq 0) {
    return [pscustomobject]@{
      Success = $false
      StatusCode = 0
      Code = "unexpected_null_response"
      Message = "Background request returned no output."
      RetryAfter = $null
      Transient = $true
    }
  }

  return $res[0]
}

function Invoke-VerificationApi($Method, $Path, $Body = $null) {
  $backoff = 1
  $url = "$($ServiceUrl.TrimEnd('/'))$Path"
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    if ($Script:isDefaultRequestAction) {
      $statusText = "Connecting..."
      if ($Path -like "*/validate") { $statusText = "Checking saved verification..." }
      elseif ($Path -like "*/challenges" -and $Path -notlike "*/resend") { $statusText = "Sending verification code..." }
      elseif ($Path -like "*/verify") { $statusText = "Verifying code..." }
      elseif ($Path -like "*/resend") { $statusText = "Resending code..." }

      $result = Invoke-WithProgress -Method $Method -Uri $url -Body $Body -StatusText $statusText
    } else {
      $result = & $RequestAction $Method $url $Body
    }

    if ($result.Success -or -not $result.Transient) { return $result }
    if ($attempt -lt 3) {
      Write-VerificationWarn "Verification service unavailable (attempt $attempt/3). Retrying..."
      & $SleepAction $backoff
      $backoff = [Math]::Min($backoff * 2, 4)
    }
  }
  return $result
}

function Read-InstallerValue($Prompt) {
  if ($env:CODY_LAUNCHER_UI -eq "1") {
    Write-Host "::codyx-prompt::$Prompt"
    $value = [Console]::In.ReadLine()
    if ($null -eq $value) { return "" }
    return $value
  }
  return [string](& $ReadAction $Prompt)
}

function Get-CodyxMachineId {
  if ($env:CODY_MACHINE_ID -and $env:CODY_MACHINE_ID.Trim().Length -le 512) {
    return $env:CODY_MACHINE_ID.Trim()
  }
  try {
    $value = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid).MachineGuid
    if ($value -and "$value".Trim().Length -le 512) { return "$value".Trim() }
  } catch {}
  return ""
}

function Save-VerificationReceipt($InstallId, $Receipt, $ExpiresAt, $MachineId) {
  $directory = Split-Path -Parent $ReceiptPath
  $null = New-Item -ItemType Directory -Force -Path $directory
  $temporary = "$ReceiptPath.tmp"
  $state = @{
    version = 1
    install_id = $InstallId
    receipt = $Receipt
    expires_at = $ExpiresAt
    server_url = $ServiceUrl
  }
  if ($MachineId) { $state.machine_id = $MachineId }
  $state | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -LiteralPath $temporary -Destination $ReceiptPath -Force
}

function Read-VerificationState {
  if (-not (Test-Path -LiteralPath $ReceiptPath)) { return $null }
  try {
    return Get-Content -LiteralPath $ReceiptPath -Raw | ConvertFrom-Json
  } catch {
    Write-VerificationWarn "The saved installer verification receipt is unreadable. A new one is required."
    return $null
  }
}

function Stop-ForServiceFailure($Result) {
  $message = if ($Result.Message) { $Result.Message } else { "The verification service is unavailable." }
  Write-VerificationError $message

  if ($Result.Code -eq "machine_banned" -and -not $NonInteractive) {
    try {
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.MessageBox]::Show($message, "Codyx Installer", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    } catch {}
  }

  if ($Result.Transient) {
    Write-VerificationError "Git and Bun will remain installed. Rerun the installer when the service is available."
    return New-VerificationResult $false "service_unavailable"
  }
  if ($Result.RetryAfter) {
    Write-VerificationWarn "Try again after $($Result.RetryAfter) seconds."
  } else {
    Write-VerificationWarn "Correct the information or wait before rerunning the installer."
  }
  if ($Result.StatusCode -eq 429 -or $Result.RetryAfter -or $Result.Code -match "rate|limit|too_many") {
    return New-VerificationResult $false "rate_limited" $message $Result.RetryAfter
  }
  return New-VerificationResult $false "verification_failed" $message $Result.RetryAfter
}

$state = Read-VerificationState
$installId = if ($state -and (Test-InstallId $state.install_id)) {
  [string]$state.install_id
} else {
  [guid]::NewGuid().ToString()
}
$machineId = Get-CodyxMachineId

if ($state -and $state.receipt -and (Test-InstallId $state.install_id)) {
  Write-VerificationStep "Checking saved installer verification..."
  $validation = Invoke-VerificationApi "POST" "/v1/receipts/validate" @{
    install_id = $installId
    receipt = [string]$state.receipt
    installer_version = $InstallerVersion
    platform = "windows"
    machine_id = if ($state.machine_id) { [string]$state.machine_id } else { $machineId }
  }
  if (-not $validation.Success) { return Stop-ForServiceFailure $validation }
  if ($validation.Body.valid) {
    Write-VerificationOk "Email verification receipt is valid."
    return New-VerificationResult $true "valid_receipt"
  }
  Write-VerificationWarn "The saved verification has expired or was revoked."
  Write-VerificationWarn "Using locally cached receipt. You can re-verify later by reinstalling."
  return New-VerificationResult $true "cached_receipt"
}

if ($NonInteractive) {
  Write-VerificationError "Email verification is required before installation can continue."
  Write-VerificationError "Run the installer in an interactive PowerShell window and enter the emailed code."
  return New-VerificationResult $false "interaction_required"
}

Write-Host ""
Write-Host "Installer email verification" -ForegroundColor Cyan
Write-Host "Codyx collects your email address to verify email ownership and send"
Write-Host "essential installer, service, or security notices."
Write-Host "No source code, prompts, project content, or model conversations are collected by this step."
Write-Host "Verified registration data is retained for up to 24 months."
$privacyUrl = "$($ServiceUrl.TrimEnd('/'))/privacy"
if ($env:CODY_LAUNCHER_UI -eq "1") {
  Write-Host "Privacy: $privacyUrl"
} else {
  $esc = [char]27
  $privacyLink = "$esc]8;;$privacyUrl$esc\\$privacyUrl$esc]8;;$esc\\"
  Write-Host "Privacy: $privacyLink"
}
Write-Host "Deletion requests: privacy@kingkung.men"
Write-Host "wish you smooth installation (Mufasa)"
Write-Host ""

$email = $null

while (-not (Test-DisplayName $DisplayName)) {
  $value = (Read-InstallerValue "Display name (required, or 'cancel')").Trim()
  if ($value.Equals("cancel", [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-VerificationWarn "Installation cancelled before registration."
    return New-VerificationResult $false "cancelled"
  }
  if (-not (Test-DisplayName $value)) {
    Write-VerificationWarn "Enter a name between 1 and 100 characters."
    continue
  }
  $DisplayName = $value
}

while ($true) {
  while (-not $email) {
    $value = (Read-InstallerValue "Email address (or 'cancel')").Trim()
    if ($value.Equals("cancel", [System.StringComparison]::OrdinalIgnoreCase)) {
      Write-VerificationWarn "Installation cancelled before registration."
      return New-VerificationResult $false "cancelled"
    }
    if (-not (Test-EmailAddress $value)) {
      Write-VerificationWarn "Enter a valid email address."
      continue
    }
    $candidateEmail = $value.ToLowerInvariant()
    $suggestion = Get-EmailTypoSuggestion $candidateEmail
    if ($suggestion) {
      Write-VerificationWarn "That email looks like a typo. Did you mean ${suggestion}?"
    }

    while ($true) {
      Write-Host ""
      Write-Host "Make sure the email in the input is correct and press use"
      Write-Host "or use reenter to correct the mail address"
      Write-Host ""
      $choice = (Read-InstallerValue "Use email: $candidateEmail").Trim().ToLowerInvariant()
      if ($choice -eq "" -or $choice -eq "u" -or $choice -eq "use" -or $choice -eq $candidateEmail.ToLowerInvariant()) {
        $email = $candidateEmail
        break
      }
      if ($choice -eq "n" -or $choice -eq "r" -or $choice -eq "reenter" -or $choice -eq "edit" -or $choice -eq "change") {
        break
      }
      if ($choice -eq "c" -or $choice.StartsWith("cancel")) {
        Write-VerificationWarn "Installation cancelled before registration."
        return New-VerificationResult $false "cancelled"
      }
      Write-VerificationWarn "Press Enter to confirm, or type n to reenter, or cancel."
    }
  }

  Write-VerificationStep "Sending a verification code to $email..."
  $challenge = Invoke-VerificationApi "POST" "/v1/challenges" @{
    install_id = $installId
    display_name = $DisplayName
    email = $email
    installer_version = $InstallerVersion
    platform = "windows"
    machine_id = $machineId
  }
  if (-not $challenge.Success) { return Stop-ForServiceFailure $challenge }
  $challengeId = [string]$challenge.Body.challenge_id
  Write-VerificationOk "Verification code sent. It expires in 10 minutes."

  $changeEmail = $false
  while (-not $changeEmail) {
    $inputValue = (Read-InstallerValue "Enter code, resend, change-email, retry, or cancel").Trim()
    $command = $inputValue.ToLowerInvariant()

    if ($command -eq "cancel") {
      Write-VerificationWarn "Installation cancelled before verification."
      return New-VerificationResult $false "cancelled"
    }
    if ($command -eq "change-email") {
      $email = $null
      $changeEmail = $true
      continue
    }
    if ($command -eq "resend") {
      $resent = Invoke-VerificationApi "POST" "/v1/challenges/$challengeId/resend"
      if ($resent.Success) {
        Write-VerificationOk "A new code was sent."
      } elseif ($resent.Code -eq "resend_too_soon") {
        $wait = if ($resent.RetryAfter) { " Wait $($resent.RetryAfter) seconds." } else { "" }
        Write-VerificationWarn "$($resent.Message)$wait"
      } elseif ($resent.Transient) {
        return Stop-ForServiceFailure $resent
      } else {
        Write-VerificationWarn $resent.Message
      }
      continue
    }

    if ($command -eq "retry") {
      $inputValue = (Read-InstallerValue "Enter the six-digit code to retry").Trim()
    }
    if ($inputValue -notmatch "^\d{6}$") {
      Write-VerificationWarn "Enter the six-digit code or one of the listed commands."
      continue
    }

    $verified = Invoke-VerificationApi "POST" "/v1/challenges/$challengeId/verify" @{
      code = $inputValue
      machine_id = $machineId
    }
    if ($verified.Success) {
      Save-VerificationReceipt $installId $verified.Body.receipt $verified.Body.expires_at $machineId
      Write-VerificationOk "Email ownership verified. Installation can continue."
      return New-VerificationResult $true "verified"
    }
    if ($verified.Transient) { return Stop-ForServiceFailure $verified }

    switch ($verified.Code) {
      "incorrect_code" { Write-VerificationWarn "That code is incorrect. Try again." }
      "code_expired" { Write-VerificationWarn "That code expired. Type 'resend' for a new code." }
      "attempts_exhausted" { Write-VerificationWarn "Too many incorrect attempts. Type 'resend' for a new code." }
      default { Write-VerificationWarn $verified.Message }
    }
  }
}
