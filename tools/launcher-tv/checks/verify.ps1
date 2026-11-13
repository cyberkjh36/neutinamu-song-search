$ErrorActionPreference = 'Stop'
$target = (New-Item -ItemType Directory 'test room 한글').FullName
$config = Join-Path $target 'WorldKaraokeYouTubeLauncher.runtimeconfig.json'
Copy-Item tools/launcher-tv/checks/launcher-config.sample $config
$setup = [Reflection.Assembly]::LoadFrom((Resolve-Path 'setup-output/WorldKaraoke_TV_Update.exe').Path)
$btType = $setup.GetType('BluetoothCode')
$btFlags = [Reflection.BindingFlags]'Static,NonPublic'
$generate = $btType.GetMethod('NewCode', $btFlags)
$valid = $btType.GetMethod('Valid', $btFlags)
1..32 | ForEach-Object {
    if ($generate.Invoke($null,@()) -notmatch '^[1-9][0-9]{5}$') { throw 'Invalid generated Bluetooth code' }
}
foreach ($bad in @('12345','1234567','012345','ABC123','１２３４５６')) {
    if ($valid.Invoke($null,@($bad))) { throw 'Malformed Bluetooth code accepted' }
}
$apply = $btType.GetMethod('Apply', $btFlags)
$inputs = [object[]]::new(2)
$inputs[0] = [byte[]]::new(357376)
$inputs[1] = '123456'
try { $apply.Invoke($null,$inputs); throw 'Unsupported launcher build accepted' }
catch [System.Management.Automation.MethodInvocationException] { }
$install = $setup.GetType('Setup').GetMethod('Install', [Reflection.BindingFlags]'Static,NonPublic')
$install.Invoke($null, @($target))
$once = (Get-FileHash $config).Hash
$install.Invoke($null, @($target))
if ((Get-FileHash $config).Hash -ne $once) { throw 'Update was not idempotent' }
if ((Get-FileHash "$config.before-tv-link").Hash -ne (Get-FileHash tools/launcher-tv/checks/launcher-config.sample).Hash) { throw 'Original config was not preserved' }
$updated = Get-Content -Raw -Encoding UTF8 $config | ConvertFrom-Json
$hook = $updated.runtimeOptions.configProperties.STARTUP_HOOKS
if (!(Test-Path $hook)) { throw 'Hook missing' }
$installed = [IO.File]::ReadAllBytes($config)
$updated.runtimeOptions.tfm = 'changed'
[IO.File]::WriteAllText($config, ($updated | ConvertTo-Json -Depth 10))
$changed = (Get-FileHash $config).Hash
try { $install.Invoke($null,@($target)); throw 'Unrecognized change was accepted' } catch [System.Management.Automation.MethodInvocationException] { }
if ($changed -ne (Get-FileHash $config).Hash) { throw 'Unrecognized change was overwritten' }
[IO.File]::WriteAllBytes($config, $installed)
$fixturePath = (Resolve-Path fixture-output).Path
# Replace one metadata string of equal length in the test-only assembly.
$fixtureDll = Join-Path $fixturePath 'LauncherFixture.dll'
$latin = [Text.Encoding]::GetEncoding(28591)
$image = $latin.GetString([IO.File]::ReadAllBytes($fixtureDll))
if ($image.IndexOf("OpenGuestPanel") -lt 0) { throw 'Test entry missing' }
[IO.File]::WriteAllBytes($fixtureDll, $latin.GetBytes($image.Replace('OpenGuestPanel','<.ctor>b__22_8')))
$fixtureConfig = Join-Path $fixturePath 'LauncherFixture.runtimeconfig.json'
$c = Get-Content -Raw $fixtureConfig | ConvertFrom-Json
$c.runtimeOptions.configProperties | Add-Member -NotePropertyName STARTUP_HOOKS -NotePropertyValue $hook
[IO.File]::WriteAllText($fixtureConfig, ($c | ConvertTo-Json -Depth 9))
function Test-Launcher {
    Remove-Item (Join-Path $target 'tv-fixture.ok') -ErrorAction SilentlyContinue
    $process = Start-Process (Join-Path $fixturePath 'LauncherFixture.exe') -WorkingDirectory $target -PassThru
    if (!$process.WaitForExit(35000)) { $process.Kill(); throw 'Launcher integration timed out' }
    if (!(Test-Path (Join-Path $target 'tv-fixture.ok'))) {
        Get-Content (Join-Path $target 'tv-fixture.error') -ErrorAction SilentlyContinue
        throw 'Launch / settings / hide / second click check failed'
    }
    $childId = [int](Get-Content (Join-Path $target 'tv-child.pid'))
    Start-Sleep -Seconds 3
    if (Get-Process -Id $childId -ErrorAction SilentlyContinue) { throw 'Companion survived launcher exit' }
}
Test-Launcher
# A .09 room only has ConfirmedP2. Test that migration starts silently with no
# radio on the runner and still lets the operator explicitly open the TV panel.
$reg = 'HKCU:\Software\WorldKaraokeLauncher\TvLink'
New-Item -Path $reg -Force | Out-Null
New-ItemProperty -Path $reg -Name ConfirmedP2 -PropertyType String -Value 'TJ_P2_1234567_7_B' -Force | Out-Null
$env:WK_CHECK_REMEMBERED = '1'
try {
    Test-Launcher
    # A removed or unavailable endpoint also stays in the background.
    New-ItemProperty -Path $reg -Name ConfirmedEndpoint -PropertyType MultiString -Value @('TJ_P2_1234567_7_B', 'missing-test-endpoint', 'AEP') -Force | Out-Null
    Test-Launcher
} finally {
    Remove-Item Env:\WK_CHECK_REMEMBERED -ErrorAction SilentlyContinue
    Remove-Item $reg -Recurse
}
