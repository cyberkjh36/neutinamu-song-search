$ErrorActionPreference='Stop'
$dir=Join-Path $env:RUNNER_TEMP 'room-shortcut-check'
New-Item $dir -ItemType Directory -Force | Out-Null
$fixture=Join-Path $dir 'fixture.json'
[IO.File]::WriteAllText($fixture,'{"5":{"serial":"P0200000000","signer":"unused","ticket":"fixture"}}')
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$csc=& $vswhere -latest -products '*' -find 'MSBuild\Current\Bin\Roslyn\csc.exe' | Select-Object -First 1
if(!$csc){throw 'Visual Studio C# compiler not found'}
$app=Join-Path $dir 'Neutinamu_Room_Remote_1.3.0.exe'
Copy-Item (Join-Path $PSScriptRoot 'Program.cs') $dir
Copy-Item (Join-Path $PSScriptRoot 'Remote.ico') $dir
Push-Location $dir
try {
  & $csc /nologo /target:winexe /langversion:latest /out:Neutinamu_Room_Remote_1.3.0.exe /win32icon:Remote.ico /resource:fixture.json,rooms.json /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Net.Http.dll /r:System.Web.Extensions.dll /r:Microsoft.CSharp.dll Program.cs
  if($LASTEXITCODE){throw 'Build failed'}
} finally {Pop-Location}
$stderr=Join-Path $dir 'install.stderr.txt'
$p=Start-Process $app -ArgumentList '--install-only' -PassThru -RedirectStandardError $stderr
if(!$p.WaitForExit(30000)){throw 'Shortcut creation did not finish in 30 seconds'}
if($p.ExitCode -ne 0){throw ('Desktop installation failed: '+(Get-Content $stderr -Raw))}
$name=-join ([char[]](0xb290,0xd2f0,0xb098,0xbb34,0x20,0xb178,0xb798,0xbc29,0x20,0xb9ac,0xbaa8,0xcee8))
$linkPath=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ($name+'.lnk')
if(!(Test-Path -LiteralPath $linkPath)){throw 'Korean desktop shortcut missing'}
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut($linkPath)
if($link.Arguments -ne '--open' -or !(Test-Path -LiteralPath $link.TargetPath) -or $link.IconLocation -notlike '*RoomRemote.exe,0'){throw 'Invalid shortcut target, arguments, or icon'}
if((Get-FileHash $link.TargetPath).Hash -ne (Get-FileHash $app).Hash){throw 'Installed program mismatch'}
Add-Type -AssemblyName System.Drawing
$icon=[Drawing.Icon]::ExtractAssociatedIcon($link.TargetPath)
if(!$icon){throw 'Missing embedded remote icon'}
$icon.Dispose()
Write-Host 'Verified desktop shortcut, executable and remote icon on Windows.'

$assembly=[Reflection.Assembly]::LoadFile($app)
$type=$assembly.GetType('RoomShortcut',$true)
$method=$type.GetMethod('SignRoomChallenge',[Reflection.BindingFlags]'Static,NonPublic')
$testKey=New-Object System.Security.Cryptography.RSACryptoServiceProvider 2048
$testKey.PersistKeyInCsp=$false
try {
  $challenge='f'*64
  $sig=$method.Invoke($null,[string[]]@($testKey.ToXmlString($true),$challenge))
  $ok=$testKey.VerifyData([Text.Encoding]::ASCII.GetBytes($challenge),'SHA256',[Convert]::FromBase64String($sig))
  if(!$ok){throw 'Windows room registration proof failed'}
} finally {$testKey.Dispose()}
