$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$installer = Get-Item (Join-Path $PSScriptRoot '../../downloads/WorldKaraoke_P2_WebRemote_Update_1.2.1.exe')
$assembly = [Reflection.Assembly]::LoadFile($installer.FullName)
$setup = $assembly.GetType('AutoConnectSetup', $true)
$private = [Reflection.BindingFlags]'Static,NonPublic'
$dir = Join-Path $env:RUNNER_TEMP 'P2 test room'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$path = Join-Path $dir 'WorldKaraoke.P2Background.exe'
$actual = $setup.GetMethod('DirectoryFromRunValue',$private).Invoke($null,@('"' + $path + '" --background'))
if ($actual -ne $dir) { throw 'Registered startup path parsing failed' }
$package = $setup.GetMethod('Package',$private).Invoke($null,@())
$rejected = $false
try { $null=$package.GetType().GetMethod('Install',[Reflection.BindingFlags]'Instance,NonPublic').Invoke($package,[string[]]@($dir)) }
catch { if ($_.Exception.GetBaseException() -is [IO.InvalidDataException]) { $rejected=$true } else { throw } }
if (!$rejected -or (Get-ChildItem $dir).Count -gt 0) { throw 'Unknown installation was accepted or modified' }
$stream = $assembly.GetManifestResourceStream('update.zip')
$zip = New-Object IO.Compression.ZipArchive $stream
try {
  foreach ($name in 'Neutinamu.P2Wifi.dll','QRCoder.dll') {
    $inputStream=$zip.GetEntry($name).Open()
    $target=[IO.File]::Create((Join-Path $dir $name))
    try { $inputStream.CopyTo($target) } finally { $target.Dispose(); $inputStream.Dispose() }
  }
} finally { $zip.Dispose(); $stream.Dispose() }
$csc = "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe"
$fixture=Join-Path $dir 'RoomFixture.exe'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'RoomFixture.cs') -Destination (Join-Path $dir 'RoomFixture.cs')
Push-Location -LiteralPath $dir
try {
  & $csc /nologo /target:exe /out:RoomFixture.exe /r:Neutinamu.P2Wifi.dll RoomFixture.cs
  if ($LASTEXITCODE) { throw 'Fixture compilation failed' }
} finally { Pop-Location }
$conf = '<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup><runtime><AppContextSwitchOverrides value="Switch.System.Net.DontEnableSchUseStrongCrypto=false;Switch.System.Net.DontEnableSystemDefaultTlsVersions=false"/></runtime></configuration>'
[IO.File]::WriteAllText("$fixture.config",$conf)
node (Join-Path $PSScriptRoot 'verify.mjs') $fixture
exit $LASTEXITCODE
