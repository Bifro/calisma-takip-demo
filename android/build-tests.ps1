param([string]$SdkRoot,[string]$JavaRoot,[string]$BuildRoot,[string]$KeyPath)
$ErrorActionPreference='Stop'
$toolsRoot=Join-Path $SdkRoot 'build-tools\36.1.0'
$platformJar=Join-Path $SdkRoot 'platforms\android-36.1\android.jar'
$testRoot=Join-Path $BuildRoot 'test'
New-Item -ItemType Directory -Force -Path $testRoot,(Join-Path $testRoot 'classes'),(Join-Path $testRoot 'dex') | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tests\AndroidManifest.xml') -Destination (Join-Path $testRoot 'AndroidManifest.xml')
$testUnsigned=Join-Path $testRoot 'unsigned.apk'
Invoke-Checked (Join-Path $toolsRoot 'aapt2.exe') @('link','-o',$testUnsigned,'--manifest',(Join-Path $testRoot 'AndroidManifest.xml'),'-I',$platformJar)
$sources=@(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'tests\src') -Recurse -Filter '*.java' | ForEach-Object FullName)
Invoke-Checked (Join-Path $JavaRoot 'bin\javac.exe') (@('-encoding','UTF-8','-source','8','-target','8','-classpath',($platformJar+';'+(Join-Path $BuildRoot 'classes')),'-d',(Join-Path $testRoot 'classes'))+$sources)
$testJar=Join-Path $testRoot 'tests.jar'
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $testRoot 'classes'),$testJar)
Invoke-Checked (Join-Path $JavaRoot 'bin\java.exe') @('-cp',(Join-Path $toolsRoot 'lib\d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',$platformJar,'--classpath',(Join-Path $BuildRoot 'classes.jar'),'--output',(Join-Path $testRoot 'dex'),$testJar)
$zip=[IO.Compression.ZipFile]::Open($testUnsigned,[IO.Compression.ZipArchiveMode]::Update)
try{[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $testRoot 'dex\classes.dex'),'classes.dex') | Out-Null}finally{$zip.Dispose()}
$aligned=Join-Path $testRoot 'aligned.apk'
Invoke-Checked (Join-Path $toolsRoot 'zipalign.exe') @('-f','-p','4',$testUnsigned,$aligned)
Invoke-Checked (Join-Path $JavaRoot 'bin\java.exe') @('-jar',(Join-Path $toolsRoot 'lib\apksigner.jar'),'sign','--ks',$KeyPath,'--ks-key-alias','calisma-takip','--ks-pass','env:CALISMA_APK_PASSWORD','--key-pass','env:CALISMA_APK_PASSWORD','--out',(Join-Path $PSScriptRoot 'dist\timer-tests.apk'),$aligned)
