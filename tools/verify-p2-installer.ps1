# Run in a disposable Windows user profile on the GitHub Actions runner.
$ErrorActionPreference = 'Stop'
if ($env:RUNNER_OS -ne 'Windows' -or $env:GITHUB_ACTIONS -ne 'true') {
    throw 'This check installs the published package in a disposable Windows runner profile.'
}
$installer = Get-ChildItem (Join-Path $PSScriptRoot '../downloads') -Filter 'Neutinamu_P2_WebRemote_Setup_*.exe' |
    Sort-Object { [version]($_.BaseName -replace '^Neutinamu_P2_WebRemote_Setup_', '') } -Descending |
    Select-Object -First 1
$setup = [Reflection.Assembly]::LoadFile($installer.FullName)
$type = $setup.GetType('Setup+SetupForm', $true)
$private = [Reflection.BindingFlags]'Instance,NonPublic'
$otherDir = Join-Path $env:RUNNER_TEMP 'world-karaoke-fixture'
$otherExe = Join-Path $otherDir 'P2_Room_Link_Test.exe'
New-Item -ItemType Directory -Path $otherDir -Force | Out-Null
Copy-Item "$env:SystemRoot/System32/ping.exe" $otherExe
$otherHash = (Get-FileHash $otherExe).Hash
$running = Start-Process $otherExe -ArgumentList '-t','127.0.0.1' -WindowStyle Hidden -PassThru
$form = $null
try {
    $form = [Activator]::CreateInstance($type, $true)
    $destination = $type.GetField('destination', $private).GetValue($form)
    $integration = $type.GetField('integrate', $private).GetValue($form)
    $state = $type.GetField('state', $private).GetValue($form)
    $install = $type.GetMethod('DoInstall', $private)
    if ($integration.Checked -or $running.HasExited) { throw 'Invalid independent-install fixture' }
    $null = $install.Invoke($form, @())
    $completed = '설치 완료'
    if (-not $state.Text.StartsWith($completed)) { throw $state.Text }
    $target = Join-Path $destination 'P2_Room_Link_Test.exe'
    $hash = (Get-FileHash $target).Hash
    if ($running.HasExited -or (Get-FileHash $otherExe).Hash -ne $otherHash) { throw 'Other room-link process changed' }
    Write-Output 'Standalone installation succeeded while a different room-link executable was running.'
    $lock = [IO.File]::Open($target, 'Open', 'Read', 'None')
    try {
        $null = $install.Invoke($form, @())
        if (-not $state.Text.Contains($target) -or $state.Text.StartsWith($completed)) { throw "Missing target lock message: $($state.Text)" }
    } finally { $lock.Dispose() }
    if ((Get-FileHash $target).Hash -ne $hash) { throw 'Locked executable changed' }
    $null = $install.Invoke($form, @())
    if (-not $state.Text.StartsWith($completed) -or $running.HasExited) { throw $state.Text }
    Write-Output 'Locked target was preserved; retry succeeded after releasing only that file.'
} finally {
    if ($form) { $form.Dispose() }
    if (-not $running.HasExited) { $running.Kill(); $running.WaitForExit() }
    $running.Dispose()
}
