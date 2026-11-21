$ErrorActionPreference='Stop'
$dir=Join-Path $env:RUNNER_TEMP 'room-shortcut-check'
New-Item $dir -ItemType Directory -Force | Out-Null
$fixture=Join-Path $dir 'fixture.json'
[IO.File]::WriteAllText($fixture,'{"5":{"serial":"P0200000000","signer":"unused","ticket":"fixture"}}')
$output=Join-Path $dir 'build'
& dotnet build (Join-Path $PSScriptRoot 'RoomShortcut.csproj') -c Release "-p:RoomProfiles=$fixture" -o $output
if($LASTEXITCODE){throw 'Build failed'}
# Only the executable is shipped. Exercise that layout, with no sibling QR assembly.
$app=Join-Path $dir 'Neutinamu_Room_Remote_1.3.1.exe'
Copy-Item (Join-Path $output 'Neutinamu_Room_Remote_1.3.1.exe') $app
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=$app
$start.Arguments='--install-only'
$start.UseShellExecute=$false
$start.RedirectStandardError=$true
$p=[Diagnostics.Process]::Start($start)
if(!$p.WaitForExit(30000)){throw 'Shortcut creation did not finish in 30 seconds'}
$exitCode=$p.ExitCode
$detail=$p.StandardError.ReadToEnd()
$p.Dispose()
if($exitCode -ne 0){throw "Desktop installation failed ($exitCode): $detail"}
$name=-join ([char[]](0xb290,0xd2f0,0xb098,0xbb34,0x20,0xb178,0xb798,0xbc29,0x20,0xb9ac,0xbaa8,0xcee8))
$linkPath=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ($name+'.lnk')
if(!(Test-Path -LiteralPath $linkPath)){throw 'Korean desktop shortcut missing'}
$shell=New-Object -ComObject WScript.Shell
$readPath=Join-Path $dir 'installed-shortcut.lnk'
Copy-Item -LiteralPath $linkPath -Destination $readPath
$link=$shell.CreateShortcut($readPath)
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

Add-Type -AssemblyName System.Windows.Forms
$flags=[Reflection.BindingFlags]'Static,NonPublic'
$resolver=[Delegate]::CreateDelegate([ResolveEventHandler],$type.GetMethod('EmbeddedQrLibrary',$flags))
[AppDomain]::CurrentDomain.add_AssemblyResolve($resolver)
$instanceFlags=[Reflection.BindingFlags]'Instance,NonPublic'
$windowType=$type.GetNestedType('RoomQrWindow',[Reflection.BindingFlags]::NonPublic)
$form=[Activator]::CreateInstance($windowType,$true)
try {
    $url=$type.GetMethod('DirectPage',$flags).Invoke($null,@('5','00001234'))
    if($url -cne 'https://cyberkjh36.github.io/neutinamu-song-search/p2wifi/index.html#room=00001234&label=5'){throw 'Wrong room URL'}
    $windowType.GetMethod('ShowActiveQr',$instanceFlags).Invoke($form,@('5','00001234',$url))
    $picture=$windowType.GetField('picture',$instanceFlags).GetValue($form)
    if(!$picture.Image -or $picture.Image.Width -lt 300){throw 'Native QR is missing'}
    $png=Join-Path $dir 'desktop-qr.png'
    $picture.Image.Save($png,[Drawing.Imaging.ImageFormat]::Png)
    $windowType.GetMethod('ClearQr',$instanceFlags).Invoke($form,@('Waiting'))
    if($picture.Image){throw 'Stale QR survived disconnect'}
} finally {
    $form.Dispose()
    [AppDomain]::CurrentDomain.remove_AssemblyResolve($resolver)
}
& python -m pip -q install zxing-cpp pillow
if($LASTEXITCODE){throw 'QR decoder installation failed'}
& python -c "import sys,zxingcpp;from PIL import Image;code=zxingcpp.read_barcode(Image.open(sys.argv[1]));assert code and code.text==sys.argv[2]" $png $url
if($LASTEXITCODE){throw 'The rendered QR did not open the configured room'}
Write-Host 'Verified native QR scan, leading zeroes, and QR removal after disconnect.'
