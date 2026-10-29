param(
  [string]$SdkRoot="$env:LOCALAPPDATA\Android\Sdk",
  [string]$JavaRoot='C:\Program Files\Android\Android Studio\jbr',
  [string]$WorkRoot=([IO.Path]::Combine([IO.Path]::GetTempPath(),'calisma-takip-build')),
  [switch]$WithTests
)
$ErrorActionPreference='Stop'
$projectRoot=$PSScriptRoot
$toolsRoot=Join-Path $SdkRoot 'build-tools\36.1.0'
$platformJar=Join-Path $SdkRoot 'platforms\android-36.1\android.jar'
$buildRoot=Join-Path $WorkRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$outputRoot=Join-Path $projectRoot 'dist'
$signingRoot=Join-Path $projectRoot '.signing'
New-Item -ItemType Directory -Force -Path $buildRoot,$outputRoot,$signingRoot | Out-Null
function Invoke-Checked([string]$Executable,[string[]]$Arguments){
  & $Executable @Arguments
  if($LASTEXITCODE -ne 0){throw "Build step failed: $Executable"}
}
$keyPath=Join-Path $signingRoot 'calisma-takip.p12'
$passwordPath=Join-Path $signingRoot 'password.txt'
if(!(Test-Path -LiteralPath $keyPath)){
  $bytes=New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  [IO.File]::WriteAllText($passwordPath,[Convert]::ToBase64String($bytes))
}
$env:CALISMA_APK_PASSWORD=[IO.File]::ReadAllText($passwordPath)
try{
  if(!(Test-Path -LiteralPath $keyPath)){
    Invoke-Checked (Join-Path $JavaRoot 'bin\keytool.exe') @('-genkeypair','-keystore',$keyPath,'-storetype','PKCS12','-storepass:env','CALISMA_APK_PASSWORD','-keypass:env','CALISMA_APK_PASSWORD','-alias','calisma-takip','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Calisma Takip Personal App')
  }
  $compiled=Join-Path $buildRoot 'resources.zip'
  Copy-Item -LiteralPath (Join-Path $projectRoot 'res') -Destination (Join-Path $buildRoot 'res') -Recurse
  Copy-Item -LiteralPath (Join-Path $projectRoot 'AndroidManifest.xml') -Destination (Join-Path $buildRoot 'AndroidManifest.xml')
  Invoke-Checked (Join-Path $toolsRoot 'aapt2.exe') @('compile','--dir',(Join-Path $buildRoot 'res'),'-o',$compiled)
  $generated=Join-Path $buildRoot 'generated';$classes=Join-Path $buildRoot 'classes';$dex=Join-Path $buildRoot 'dex'
  New-Item -ItemType Directory -Force -Path $generated,$classes,$dex | Out-Null
  $unsigned=Join-Path $buildRoot 'unsigned.apk'
  Invoke-Checked (Join-Path $toolsRoot 'aapt2.exe') @('link','-o',$unsigned,'--manifest',(Join-Path $buildRoot 'AndroidManifest.xml'),'-I',$platformJar,'--java',$generated,$compiled)
  $sourceFiles=@(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src'),$generated -Recurse -Filter '*.java' | ForEach-Object FullName)
  Invoke-Checked (Join-Path $JavaRoot 'bin\javac.exe') (@('-encoding','UTF-8','-source','8','-target','8','-classpath',$platformJar,'-d',$classes)+$sourceFiles)
  $classJar=Join-Path $buildRoot 'classes.jar'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::CreateFromDirectory($classes,$classJar)
  Invoke-Checked (Join-Path $JavaRoot 'bin\java.exe') @('-cp',(Join-Path $toolsRoot 'lib\d8.jar'),'com.android.tools.r8.D8','--release','--min-api','26','--lib',$platformJar,'--output',$dex,$classJar)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive=[IO.Compression.ZipFile]::Open($unsigned,[IO.Compression.ZipArchiveMode]::Update)
  try{[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $dex 'classes.dex'),'classes.dex') | Out-Null}finally{$archive.Dispose()}
  $aligned=Join-Path $buildRoot 'aligned.apk'
  Invoke-Checked (Join-Path $toolsRoot 'zipalign.exe') @('-f','-p','4',$unsigned,$aligned)
  $apk=Join-Path $outputRoot 'calisma-takip-1.0.0.apk'
  Invoke-Checked (Join-Path $JavaRoot 'bin\java.exe') @('-jar',(Join-Path $toolsRoot 'lib\apksigner.jar'),'sign','--ks',$keyPath,'--ks-key-alias','calisma-takip','--ks-pass','env:CALISMA_APK_PASSWORD','--key-pass','env:CALISMA_APK_PASSWORD','--out',$apk,$aligned)
  Invoke-Checked (Join-Path $JavaRoot 'bin\java.exe') @('-jar',(Join-Path $toolsRoot 'lib\apksigner.jar'),'verify','--verbose',$apk)
  if($WithTests){& (Join-Path $projectRoot 'build-tests.ps1') -SdkRoot $SdkRoot -JavaRoot $JavaRoot -BuildRoot $buildRoot -KeyPath $keyPath}
  Get-FileHash -LiteralPath $apk -Algorithm SHA256 | Format-List
  Write-Output "APK: $apk"
}finally{Remove-Item Env:CALISMA_APK_PASSWORD -ErrorAction SilentlyContinue}
