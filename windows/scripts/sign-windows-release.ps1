[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$UnsignedZipPath,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9A-Fa-f]{64}$')]
    [string]$ReviewedUnsignedZipSha256,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{40}$')]
    [string]$SourceRevision,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9A-Fa-f]{40}$')]
    [string]$CertificateThumbprint,

    [Parameter(Mandatory = $true)]
    [ValidateScript({
        $_.IsAbsoluteUri -and
        $_.Scheme -eq 'https' -and
        [string]::IsNullOrEmpty($_.UserInfo) -and
        [string]::IsNullOrEmpty($_.Query) -and
        [string]::IsNullOrEmpty($_.Fragment)
    })]
    [uri]$TimestampUrl,

    [string]$OutputDirectory,

    [string]$SignToolPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$windowsRoot = Split-Path -Parent $scriptDirectory
$projectRoot = Split-Path -Parent $windowsRoot
$publicReadmeTemplate = Join-Path $windowsRoot 'distribution\READ-ME-FIRST-PUBLIC-SIGNED.txt'
$maximumArchiveBytes = 1GB
$maximumExpandedBytes = 2GB
$maximumArchiveEntries = 10000
$codeSigningEkuOid = '1.3.6.1.5.5.7.3.3'
$sourceRevisionBindingMethod = 'cms-signed-release-binding-v1'
$bundledDemoSha256 = '1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584'
$bundledDemoRelativeDirectory = 'resources/PS2SDK-Cube-Demo'
$bundledDemoElfRelativePath = "$bundledDemoRelativeDirectory/ps2sdk-cube.elf"
$bundledDemoFiles = @(
    [pscustomobject]@{ SourceName = 'ps2sdk-cube.elf'; PackageName = 'ps2sdk-cube.elf' },
    [pscustomobject]@{ SourceName = 'PS2SDK-AFL-2.0.txt'; PackageName = 'PS2SDK-AFL-2.0.txt' },
    [pscustomobject]@{ SourceName = 'PS2SDK-CUBE-NOTICE.md'; PackageName = 'PS2SDK-CUBE-NOTICE.md' },
    [pscustomobject]@{ SourceName = 'NEWLIB-COPYING.txt'; PackageName = 'NEWLIB-COPYING.txt' },
    [pscustomobject]@{ SourceName = 'GCC-COPYING.RUNTIME.txt'; PackageName = 'GCC-COPYING.RUNTIME.txt' },
    [pscustomobject]@{ SourceName = 'GCC-COPYING3.txt'; PackageName = 'GCC-COPYING3.txt' }
)
$workRoot = $null
$temporaryOutputZip = $null
$temporaryChecksumPath = $null
$temporaryEvidencePath = $null
$temporarySourceBindingPath = $null
$createdOutputs = [System.Collections.Generic.List[string]]::new()

function Fail([string]$Message) {
    throw [System.InvalidOperationException]::new($Message)
}

function Get-NormalizedSha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-CertificateSha256([System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($Certificate.RawData) | ForEach-Object { $_.ToString('x2') }) -join '')
    }
    finally {
        $sha.Dispose()
    }
}

function New-SourceRevisionBindingEvidence(
    [string]$Path,
    [System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate,
    [string]$Version,
    [string]$PlatformID,
    [string]$Revision,
    [string]$ArtifactName,
    [long]$ArtifactSizeBytes,
    [string]$ArtifactSha256
) {
    Add-Type -AssemblyName System.Security.Cryptography.Pkcs
    $certificateSha256 = Get-CertificateSha256 $Certificate
    $manifest = [ordered]@{
        schemaVersion = 1
        bindingMethod = $sourceRevisionBindingMethod
        product = 'PS2 Emu'
        version = $Version
        platformID = $PlatformID
        sourceRevisionAlgorithm = 'git-sha1'
        sourceRevision = $Revision
        finalArtifactName = $ArtifactName
        finalArtifactSizeBytes = $ArtifactSizeBytes
        finalArtifactSha256 = $ArtifactSha256
        signerCertificateSha256 = $certificateSha256
    }
    $canonicalBytes = [System.Text.UTF8Encoding]::new($false).GetBytes((($manifest | ConvertTo-Json -Compress) + "`n"))
    $contentInfo = [System.Security.Cryptography.Pkcs.ContentInfo]::new($canonicalBytes)
    $cms = [System.Security.Cryptography.Pkcs.SignedCms]::new($contentInfo, $false)
    $signer = [System.Security.Cryptography.Pkcs.CmsSigner]::new(
        [System.Security.Cryptography.Pkcs.SubjectIdentifierType]::IssuerAndSerialNumber,
        $Certificate
    )
    $signer.IncludeOption = [System.Security.Cryptography.X509Certificates.X509IncludeOption]::EndCertOnly
    $signer.DigestAlgorithm = [System.Security.Cryptography.Oid]::new('2.16.840.1.101.3.4.2.1')
    $cms.ComputeSignature($signer)
    [System.IO.File]::WriteAllBytes($Path, $cms.Encode())
    return [pscustomobject]@{
        CanonicalBytes = $canonicalBytes
        CertificateSha256 = $certificateSha256
    }
}

function Test-SourceRevisionBindingEvidence(
    [string]$Path,
    [byte[]]$ExpectedContent,
    [string]$ExpectedCertificateSha256
) {
    Add-Type -AssemblyName System.Security.Cryptography.Pkcs
    $cms = [System.Security.Cryptography.Pkcs.SignedCms]::new()
    $cms.Decode([System.IO.File]::ReadAllBytes($Path))
    if ($cms.SignerInfos.Count -ne 1) { Fail 'Source binding CMS must contain exactly one signer.' }
    $cms.CheckSignature($true)
    $cms.CheckSignature($false)
    $signerCertificate = $cms.SignerInfos[0].Certificate
    if ($null -eq $signerCertificate -or (Get-CertificateSha256 $signerCertificate) -cne $ExpectedCertificateSha256) {
        Fail 'Source binding CMS signer certificate does not match the selected code-signing certificate.'
    }
    if ([System.Convert]::ToBase64String($cms.ContentInfo.Content) -cne [System.Convert]::ToBase64String($ExpectedContent)) {
        Fail 'Source binding CMS content changed after signing.'
    }
    return @(
        'cmsCryptographicSignature=pass',
        'cmsCertificateChain=pass',
        "cmsSignerCertificateSha256=$ExpectedCertificateSha256"
    )
}

function Test-ReviewedSourceCheckout([string]$Revision) {
    $git = Get-Command 'git.exe' -CommandType Application -ErrorAction SilentlyContinue
    if ($null -eq $git) { Fail 'git.exe is required to bind the release candidate to a reviewed checkout.' }

    $headOutput = @(& $git.Source -C $projectRoot rev-parse HEAD 2>$null)
    if ($LASTEXITCODE -ne 0 -or $headOutput.Count -ne 1 -or $headOutput[0].Trim() -cne $Revision) {
        Fail 'SourceRevision does not match the checked-out public repository HEAD.'
    }
    $statusOutput = @(& $git.Source -C $projectRoot status --porcelain --untracked-files=all 2>$null)
    if ($LASTEXITCODE -ne 0) { Fail 'The public source worktree status could not be verified.' }
    if ($statusOutput.Count -ne 0) { Fail 'The public source worktree must be clean before release signing.' }

    $originOutput = @(& $git.Source -C $projectRoot remote get-url origin 2>$null)
    if ($LASTEXITCODE -ne 0 -or $originOutput.Count -ne 1 -or
        $originOutput[0].Trim() -notin @(
            'git@github.com:tenten-10-10/ps2-emu.git',
            'https://github.com/tenten-10-10/ps2-emu.git'
        )) {
        Fail 'The source checkout origin is not the owner-approved public PS2 Emu repository.'
    }
    $remoteMainOutput = @(& $git.Source -C $projectRoot ls-remote origin refs/heads/main 2>$null)
    if ($LASTEXITCODE -ne 0 -or $remoteMainOutput.Count -ne 1 -or
        $remoteMainOutput[0].Split("`t")[0] -cne $Revision) {
        Fail 'SourceRevision is not the current published origin/main revision.'
    }
    $symlinkOutput = @(& $git.Source -C $projectRoot ls-files -s 2>$null | Where-Object { $_ -match '^120000 ' })
    if ($LASTEXITCODE -ne 0) { Fail 'Tracked source modes could not be verified.' }
    if ($symlinkOutput.Count -ne 0) { Fail 'The reviewed public source must not contain tracked symbolic links.' }
    foreach ($fixturePath in @(
        'Resources/Fixtures/ps2sdk-cube.elf',
        'Resources/Fixtures/PS2SDK-AFL-2.0.txt',
        'Resources/Fixtures/PS2SDK-CUBE-NOTICE.md',
        'Resources/Fixtures/NEWLIB-COPYING.txt',
        'Resources/Fixtures/GCC-COPYING.RUNTIME.txt',
        'Resources/Fixtures/GCC-COPYING3.txt'
    )) {
        $trackedOutput = @(& $git.Source -C $projectRoot ls-files --error-unmatch -- $fixturePath 2>$null)
        if ($LASTEXITCODE -ne 0 -or $trackedOutput.Count -ne 1 -or $trackedOutput[0].Trim() -cne $fixturePath) {
            Fail "Required bundled demo source is not tracked by the reviewed commit: $fixturePath"
        }
    }
}

function Get-PeMachine([string]$Path) {
    $stream = [System.IO.File]::Open(
        $Path,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::Read
    )
    try {
        if ($stream.Length -lt 64) { Fail "PE file is too small: $([System.IO.Path]::GetFileName($Path))" }
        $reader = [System.IO.BinaryReader]::new($stream)
        if ($reader.ReadUInt16() -ne 0x5A4D) { Fail 'Launcher does not have an MZ header.' }
        [void]$stream.Seek(0x3c, [System.IO.SeekOrigin]::Begin)
        $peOffset = $reader.ReadUInt32()
        if ($peOffset -lt 0x40 -or $peOffset -gt 16MB -or ($peOffset + 6) -gt $stream.Length) {
            Fail 'Launcher has an invalid PE header offset.'
        }
        [void]$stream.Seek($peOffset, [System.IO.SeekOrigin]::Begin)
        if ($reader.ReadUInt32() -ne 0x00004550) { Fail 'Launcher does not have a valid PE signature.' }
        return $reader.ReadUInt16()
    }
    finally {
        $stream.Dispose()
    }
}

function Get-ProhibitedPayloadReason([string]$RelativePath) {
    $normalized = $RelativePath.Replace('\', '/').Trim('/')
    $name = [System.IO.Path]::GetFileName($normalized).ToLowerInvariant()
    $extension = [System.IO.Path]::GetExtension($name).ToLowerInvariant()

    if ($name -eq 'play.exe') { return 'bundled Play.exe' }
    if ($name -match '^qt.*\.dll$') { return 'bundled Qt runtime' }
    if ($name -eq 'states.db') { return 'bundled Play! compatibility database' }
    if ($extension -in @('.iso', '.mds', '.isz', '.cso', '.cue', '.chd', '.elf', '.rom', '.rom0', '.rom1', '.rom2')) {
        if ($extension -eq '.elf' -and (Test-ExactBundledDemoElfPath $normalized)) { return $null }
        return 'bundled game or homebrew image'
    }
    if ($extension -in @('.key', '.keys', '.p8', '.p12', '.pfx', '.pvk', '.snk', '.pem')) {
        return 'bundled private key or signing credential'
    }
    if ($name -eq '.env' -or $name.StartsWith('.env.')) { return 'bundled environment secret file' }
    if ($name -in @('id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'credentials', 'credentials.json')) {
        return 'bundled credential file'
    }
    if ($name -match '(^|[-_.])bios([-_.]|$)' -or $name -match '^scph\d+\.(bin|rom\d?)$') {
        return 'bundled BIOS file'
    }
    if ($extension -eq '.pdb') { return 'debug symbol file' }
    return $null
}

function Test-ExactBundledDemoElfPath([string]$RelativePath) {
    $normalized = $RelativePath.Replace('\', '/').Trim('/')
    if ($normalized -ceq $bundledDemoElfRelativePath) { return $true }
    $components = $normalized.Split('/')
    if ($components.Count -ne 4) { return $false }
    return ([string]::Join('/', $components[1..3]) -ceq $bundledDemoElfRelativePath)
}

function Test-BundledDemoResources([string]$PackageRoot) {
    $packageDirectory = Join-Path $PackageRoot $bundledDemoRelativeDirectory.Replace('/', '\')
    $sourceDirectory = Join-Path $projectRoot 'Resources\Fixtures'
    $actualEntries = @(Get-ChildItem -LiteralPath $packageDirectory -Force)
    if ($actualEntries.Count -ne $bundledDemoFiles.Count) {
        Fail 'Packaged PS2SDK Cube Demo directory does not have the exact reviewed inventory.'
    }
    foreach ($entry in $actualEntries) {
        if ($entry.PSIsContainer -or ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
            -not ($bundledDemoFiles.PackageName -ccontains $entry.Name)) {
            Fail "Unexpected PS2SDK Cube Demo package entry: $($entry.Name)"
        }
    }
    foreach ($spec in $bundledDemoFiles) {
        $packagedPath = Join-Path $packageDirectory $spec.PackageName
        $sourcePath = Join-Path $sourceDirectory $spec.SourceName
        foreach ($candidate in @($packagedPath, $sourcePath)) {
            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                Fail "Required PS2SDK Cube Demo resource is missing: $candidate"
            }
            $item = Get-Item -LiteralPath $candidate
            if ($item.Length -eq 0 -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
                Fail "PS2SDK Cube Demo resource is empty or unsafe: $candidate"
            }
        }
        $packagedSha = Get-NormalizedSha256 $packagedPath
        $sourceSha = Get-NormalizedSha256 $sourcePath
        if ($spec.PackageName -ceq 'ps2sdk-cube.elf' -and $packagedSha -cne $bundledDemoSha256) {
            Fail "Packaged PS2SDK Cube Demo SHA-256 does not match the pinned identity."
        }
        if ($packagedSha -cne $sourceSha) {
            Fail "Packaged PS2SDK Cube Demo resource does not match reviewed source bytes: $($spec.PackageName)"
        }
    }
}

function Test-ReviewedAppAsar([string]$AsarPath) {
    $node = Get-Command 'node.exe' -CommandType Application -ErrorAction SilentlyContinue
    if ($null -eq $node) { Fail 'node.exe is required to verify the reviewed app.asar against public source.' }
    $nodeItem = Get-Item -LiteralPath $node.Source
    if ($nodeItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Fail 'node.exe must not be a reparse point on the release-signing host.'
    }
    $nodeSignature = Get-AuthenticodeSignature -LiteralPath $node.Source
    if ($nodeSignature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or
        $null -eq $nodeSignature.SignerCertificate) {
        Fail 'node.exe must have a valid Authenticode signature on the release-signing host.'
    }

    $verifier = Join-Path $scriptDirectory 'verify-release-app-asar.mjs'
    $verifierItem = Get-Item -LiteralPath $verifier
    if (-not $verifierItem.PSIsContainer -and
        ($verifierItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0 -and
        $verifierItem.Length -gt 0) {
        # The clean source checkout and helper are verified before use.
    }
    else {
        Fail 'The reviewed app.asar source verifier is missing or unsafe.'
    }
    $null = & $node.Source $verifier $AsarPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        Fail 'app.asar does not match the exact public source allowlist, or pinned verifier dependencies are unavailable. Run npm ci and npm test in windows before retrying.'
    }
}

function Test-ZipEntries([string]$ArchivePath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        if ($archive.Entries.Count -eq 0) { Fail 'ZIP is empty.' }
        if ($archive.Entries.Count -gt $maximumArchiveEntries) { Fail 'ZIP contains too many entries.' }

        $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
        $roots = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
        $normalizedEntries = [System.Collections.Generic.List[string]]::new()
        [long]$expandedBytes = 0

        foreach ($entry in $archive.Entries) {
            $rawName = $entry.FullName
            if ([string]::IsNullOrWhiteSpace($rawName)) { Fail 'ZIP contains an empty entry name.' }
            if ([regex]::IsMatch($rawName, '[\x00-\x1f\x7f]')) { Fail 'ZIP contains a control character in an entry name.' }
            if ($rawName.Contains('\')) { Fail "ZIP entry uses a backslash: $rawName" }
            if ($rawName.StartsWith('/') -or $rawName -match '^[A-Za-z]:') { Fail "ZIP contains an absolute path: $rawName" }

            $normalized = $rawName.TrimEnd('/')
            if ([string]::IsNullOrEmpty($normalized)) { Fail 'ZIP contains an invalid root entry.' }
            $components = $normalized.Split('/')
            if ($components -contains '' -or $components -contains '.' -or $components -contains '..') {
                Fail "ZIP contains an unsafe path component: $rawName"
            }
            if ($normalized.Length -gt 240) { Fail "ZIP entry path exceeds the Windows release limit: $rawName" }
            foreach ($component in $components) {
                if ($component.Length -gt 255 -or $component -match '[<>:"|?*]' -or
                    $component.EndsWith('.') -or $component.EndsWith(' ')) {
                    Fail "ZIP contains a Windows-unsafe path component: $rawName"
                }
                $deviceBase = $component.Split('.')[0]
                if ($deviceBase -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') {
                    Fail "ZIP contains a reserved Windows device path: $rawName"
                }
            }
            [void]$roots.Add($components[0])
            if (-not $seen.Add($normalized)) { Fail "ZIP contains a duplicate case-insensitive path: $rawName" }

            [int64]$externalAttributes = $entry.ExternalAttributes
            if ($externalAttributes -lt 0) { $externalAttributes += 4294967296 }
            $unixMode = (($externalAttributes -shr 16) -band 0xF000)
            if ($unixMode -eq 0xA000) { Fail "ZIP contains a symbolic link: $rawName" }

            $reason = Get-ProhibitedPayloadReason $normalized
            if ($null -ne $reason) { Fail "ZIP contains ${reason}: $rawName" }
            $expandedBytes += $entry.Length
            if ($expandedBytes -gt $maximumExpandedBytes) { Fail 'ZIP expanded size exceeds the release limit.' }
            if (-not $rawName.EndsWith('/')) {
                $entryStream = $entry.Open()
                $demoBytes = if (Test-ExactBundledDemoElfPath $normalized) { [System.IO.MemoryStream]::new() } else { $null }
                try {
                    $buffer = [byte[]]::new(1MB)
                    [long]$readBytes = 0
                    while (($count = $entryStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                        $readBytes += $count
                        if ($null -ne $demoBytes) { $demoBytes.Write($buffer, 0, $count) }
                    }
                    if ($readBytes -ne $entry.Length) { Fail "ZIP entry length changed while reading: $rawName" }
                    if ($null -ne $demoBytes) {
                        $sha = [System.Security.Cryptography.SHA256]::Create()
                        try {
                            $digest = ($sha.ComputeHash($demoBytes.ToArray()) | ForEach-Object { $_.ToString('x2') }) -join ''
                        }
                        finally {
                            $sha.Dispose()
                        }
                        if ($digest -cne $bundledDemoSha256) {
                            Fail 'ZIP PS2SDK Cube Demo SHA-256 does not match the pinned identity.'
                        }
                    }
                }
                finally {
                    if ($null -ne $demoBytes) { $demoBytes.Dispose() }
                    $entryStream.Dispose()
                }
            }
            $normalizedEntries.Add($normalized)
        }

        if ($roots.Count -ne 1) { Fail "ZIP must contain exactly one top-level directory; found $($roots.Count)." }
        return [pscustomobject]@{
            Root = [string]($roots | Select-Object -First 1)
            Entries = [string[]]$normalizedEntries
        }
    }
    finally {
        $archive.Dispose()
    }
}

function Test-ExtractedPackage(
    [string]$PackageRoot,
    [string]$ExpectedRootName,
    [int]$ExpectedMachine,
    [bool]$RequireUnsignedWarning
) {
    if ((Split-Path -Leaf $PackageRoot) -cne $ExpectedRootName) { Fail 'Extracted package root does not match the reviewed architecture.' }
    if (-not (Test-Path -LiteralPath $PackageRoot -PathType Container)) { Fail 'Expected package root is missing.' }

    $requiredFiles = @(
        'PS2 Emu.exe',
        'resources\app.asar',
        'LICENSE',
        'LICENSES.chromium.html',
        'PS2-EMU-LICENSE.txt',
        'READ-ME-FIRST.txt',
        'PRIVACY.md',
        'SECURITY.md',
        'resources\PS2SDK-Cube-Demo\ps2sdk-cube.elf',
        'resources\PS2SDK-Cube-Demo\PS2SDK-AFL-2.0.txt',
        'resources\PS2SDK-Cube-Demo\PS2SDK-CUBE-NOTICE.md',
        'resources\PS2SDK-Cube-Demo\NEWLIB-COPYING.txt',
        'resources\PS2SDK-Cube-Demo\GCC-COPYING.RUNTIME.txt',
        'resources\PS2SDK-Cube-Demo\GCC-COPYING3.txt'
    )
    foreach ($required in $requiredFiles) {
        $candidate = Join-Path $PackageRoot $required
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { Fail "Required release file is missing: $required" }
        if ((Get-Item -LiteralPath $candidate).Length -eq 0) { Fail "Required release file is empty: $required" }
    }

    $allItems = @(Get-ChildItem -LiteralPath $PackageRoot -Force -Recurse)
    foreach ($item in $allItems) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            Fail "Package contains a reparse point: $($item.Name)"
        }
        if (-not $item.PSIsContainer) {
            $relative = $item.FullName.Substring($PackageRoot.Length).TrimStart('\', '/').Replace('\', '/')
            $reason = Get-ProhibitedPayloadReason $relative
            if ($null -ne $reason) { Fail "Package contains ${reason}: $relative" }
        }
    }
    Test-BundledDemoResources $PackageRoot

    $executables = @($allItems | Where-Object { -not $_.PSIsContainer -and $_.Extension -ieq '.exe' })
    $launcherPath = Join-Path $PackageRoot 'PS2 Emu.exe'
    if ($executables.Count -ne 1 -or $executables[0].FullName -ine $launcherPath) {
        Fail 'Package must contain exactly one executable: PS2 Emu.exe.'
    }
    $machine = Get-PeMachine $launcherPath
    if ($machine -ne $ExpectedMachine) {
        Fail ('Launcher PE Machine mismatch: expected 0x{0:X4}, found 0x{1:X4}.' -f $ExpectedMachine, $machine)
    }

    $packageReadme = [System.IO.File]::ReadAllText((Join-Path $PackageRoot 'READ-ME-FIRST.txt'))
    foreach ($requiredDisclosure in @('ps2dev/ps2sdk', 'AFL 2.0', $bundledDemoSha256, 'commercial games')) {
        if (-not $packageReadme.Contains($requiredDisclosure)) {
            Fail "Package README is missing the bundled demo disclosure: $requiredDisclosure"
        }
    }

    if ($RequireUnsignedWarning) {
        if (-not $packageReadme.Contains('UNSIGNED') -or -not $packageReadme.Contains('DO NOT DISTRIBUTE')) {
            Fail 'Reviewed input ZIP does not contain the required unsigned, non-distributable warning.'
        }
        if (Test-Path -LiteralPath (Join-Path $PackageRoot 'SOURCE-REVISION.txt')) {
            Fail 'Reviewed unsigned input unexpectedly contains SOURCE-REVISION.txt.'
        }
        $unsignedSignature = Get-AuthenticodeSignature -LiteralPath $launcherPath
        if ($unsignedSignature.Status -ne [System.Management.Automation.SignatureStatus]::NotSigned -or
            $null -ne $unsignedSignature.SignerCertificate -or
            $null -ne $unsignedSignature.TimeStamperCertificate) {
            Fail 'Reviewed unsigned input launcher is already signed or has unexpected signature metadata.'
        }
    }

    return [pscustomobject]@{
        LauncherPath = $launcherPath
        Machine = $machine
    }
}

function Resolve-SignTool([string]$RequestedPath) {
    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        $resolved = (Resolve-Path -LiteralPath $RequestedPath).Path
        if ((Split-Path -Leaf $resolved) -ine 'signtool.exe') { Fail 'SignToolPath must point to signtool.exe.' }
        $candidatePath = $resolved
    }
    else {
        $kitsRoot = ${env:ProgramFiles(x86)}
        if ([string]::IsNullOrWhiteSpace($kitsRoot)) { Fail 'The Windows SDK root is unavailable.' }
        $candidates = @(Get-ChildItem -Path (Join-Path $kitsRoot 'Windows Kits\10\bin\*\x64\signtool.exe') -File -ErrorAction SilentlyContinue |
            Sort-Object { [version]$_.Directory.Parent.Name } -Descending)
        if ($candidates.Count -eq 0) {
            Fail 'signtool.exe was not found. Install an owner-reviewed Windows SDK or pass -SignToolPath.'
        }
        $candidatePath = $candidates[0].FullName
    }

    $item = Get-Item -LiteralPath $candidatePath
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { Fail 'signtool.exe must not be a reparse point.' }
    $toolSignature = Get-AuthenticodeSignature -LiteralPath $candidatePath
    if ($toolSignature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or
        $null -eq $toolSignature.SignerCertificate -or
        $toolSignature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') {
        Fail 'signtool.exe is not validly signed by Microsoft Corporation.'
    }
    return $candidatePath
}

function Get-ReleaseCertificate([string]$Thumbprint) {
    $normalized = $Thumbprint.Replace(' ', '').ToUpperInvariant()
    $store = [System.Security.Cryptography.X509Certificates.X509Store]::new(
        [System.Security.Cryptography.X509Certificates.StoreName]::My,
        [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
    )
    try {
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
        $matches = @($store.Certificates | Where-Object { $_.Thumbprint.Replace(' ', '').ToUpperInvariant() -ceq $normalized })
        if ($matches.Count -ne 1) { Fail 'Exactly one matching certificate is required in CurrentUser\My.' }
        $certificate = $matches[0]
        if (-not $certificate.HasPrivateKey) { Fail 'The selected code-signing certificate has no accessible private key.' }
        $now = [DateTime]::UtcNow
        if ($certificate.NotBefore.ToUniversalTime() -gt $now -or $certificate.NotAfter.ToUniversalTime() -le $now) {
            Fail 'The selected code-signing certificate is not currently valid.'
        }

        $ekuExtension = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' })
        if ($ekuExtension.Count -ne 1) { Fail 'The selected certificate does not contain exactly one EKU extension.' }
        $codeSigningEku = @($ekuExtension[0].EnhancedKeyUsages | Where-Object { $_.Value -eq $codeSigningEkuOid })
        if ($codeSigningEku.Count -ne 1) { Fail 'The selected certificate does not permit Code Signing.' }
        return $certificate
    }
    finally {
        $store.Close()
    }
}

if ($env:OS -ne 'Windows_NT') { Fail 'The signed release lane must run on Windows.' }
Test-ReviewedSourceCheckout $SourceRevision

$resolvedUnsignedZip = (Resolve-Path -LiteralPath $UnsignedZipPath).Path
$unsignedInfo = Get-Item -LiteralPath $resolvedUnsignedZip
if (-not $unsignedInfo.PSIsContainer -and $unsignedInfo.Length -gt 0 -and $unsignedInfo.Length -le $maximumArchiveBytes) {
    # Validated below.
}
else {
    Fail 'UnsignedZipPath must be a non-empty regular ZIP below the release size limit.'
}
if ($unsignedInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { Fail 'UnsignedZipPath must not be a reparse point.' }

$inputNamePattern = '^PS2-Emu-(?<version>[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)-Windows-(?<arch>x64|ARM64)-UNSIGNED-DO-NOT-DISTRIBUTE\.zip$'
$nameMatch = [regex]::Match($unsignedInfo.Name, $inputNamePattern)
if (-not $nameMatch.Success) { Fail 'Unsigned ZIP filename is not an approved architecture-specific candidate name.' }
$version = $nameMatch.Groups['version'].Value
$architectureLabel = $nameMatch.Groups['arch'].Value
$sourceAppManifestPath = Join-Path $windowsRoot 'app\package.json'
try {
    $sourceAppManifest = [System.IO.File]::ReadAllText($sourceAppManifestPath) | ConvertFrom-Json
}
catch {
    Fail 'The clean public checkout application manifest could not be read.'
}
if ($sourceAppManifest.name -cne 'ps2-emulator-windows' -or
    $sourceAppManifest.productName -cne 'PS2 Emu' -or
    $sourceAppManifest.version -cne $version -or
    $sourceAppManifest.main -cne 'main.mjs') {
    Fail 'Unsigned ZIP filename version or product identity does not match the clean public checkout.'
}
if ($architectureLabel -ceq 'x64') {
    $expectedRootName = 'PS2 Emu-win32-x64'
    $expectedMachine = 0x8664
    $publicArchitecture = 'x64'
}
else {
    $expectedRootName = 'PS2 Emu-win32-arm64'
    $expectedMachine = 0xAA64
    $publicArchitecture = 'ARM64 launcher / external x64 Play! core'
}

$actualInputSha = Get-NormalizedSha256 $resolvedUnsignedZip
if ($actualInputSha -cne $ReviewedUnsignedZipSha256.ToLowerInvariant()) {
    Fail 'Reviewed unsigned ZIP SHA-256 does not match the input bytes.'
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $windowsRoot 'dist\signed-candidates'
}
$resolvedOutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $resolvedOutputDirectory) {
    $outputItem = Get-Item -LiteralPath $resolvedOutputDirectory
    if (-not $outputItem.PSIsContainer -or ($outputItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        Fail 'OutputDirectory must be a normal directory, not a file or reparse point.'
    }
}
else {
    [void][System.IO.Directory]::CreateDirectory($resolvedOutputDirectory)
}

$publicArchToken = if ($architectureLabel -ceq 'x64') { 'x64' } else { 'ARM64' }
$publicZipName = "PS2-Emu-$version-launcher-Windows-$publicArchToken.zip"
$publicZipPath = Join-Path $resolvedOutputDirectory $publicZipName
$checksumPath = "$publicZipPath.sha256"
$evidencePath = "$publicZipPath.release-evidence.json"
$sourceBindingPath = "$publicZipPath.source-binding.p7m"
foreach ($target in @($publicZipPath, $checksumPath, $evidencePath, $sourceBindingPath)) {
    if (Test-Path -LiteralPath $target) { Fail "Refusing to overwrite an existing release output: $(Split-Path -Leaf $target)" }
}

$tempBase = [System.IO.Path]::GetTempPath()
$workRoot = Join-Path $tempBase ("ps2-emu-sign-{0}" -f [guid]::NewGuid().ToString('N'))
$extractRoot = Join-Path $workRoot 'extract'
[void][System.IO.Directory]::CreateDirectory($extractRoot)

try {
    $reviewedInputCopy = Join-Path $workRoot 'reviewed-unsigned-input.zip'
    [System.IO.File]::Copy($resolvedUnsignedZip, $reviewedInputCopy, $false)
    if ((Get-NormalizedSha256 $reviewedInputCopy) -cne $actualInputSha) {
        Fail 'Unsigned ZIP bytes changed while the reviewed input was being isolated.'
    }
    $inputIndex = Test-ZipEntries $reviewedInputCopy
    if ($inputIndex.Root -cne $expectedRootName) { Fail 'Unsigned ZIP root does not match its architecture.' }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($reviewedInputCopy, $extractRoot)
    if ((Get-NormalizedSha256 $reviewedInputCopy) -cne $actualInputSha) {
        Fail 'Reviewed unsigned ZIP bytes changed during archive inspection or extraction.'
    }
    $packageRoot = Join-Path $extractRoot $expectedRootName
    $package = Test-ExtractedPackage $packageRoot $expectedRootName $expectedMachine $true
    Test-ReviewedAppAsar (Join-Path $packageRoot 'resources\app.asar')

    $certificate = Get-ReleaseCertificate $CertificateThumbprint
    $resolvedSignTool = Resolve-SignTool $SignToolPath
    $normalizedThumbprint = $certificate.Thumbprint.Replace(' ', '').ToUpperInvariant()

    $signArguments = @(
        'sign', '/sha1', $normalizedThumbprint, '/s', 'My',
        '/fd', 'SHA256', '/tr', $TimestampUrl.AbsoluteUri, '/td', 'SHA256',
        '/d', 'PS2 Emu', $package.LauncherPath
    )
    $null = & $resolvedSignTool @signArguments 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "signtool sign failed with exit code $LASTEXITCODE." }

    $verifyArguments = @('verify', '/pa', '/all', '/v', '/tw', $package.LauncherPath)
    $null = & $resolvedSignTool @verifyArguments 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "signtool verify failed with exit code $LASTEXITCODE." }

    $signature = Get-AuthenticodeSignature -LiteralPath $package.LauncherPath
    if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
        Fail 'PowerShell does not report a valid Authenticode signature for the launcher.'
    }
    if ($null -eq $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint.Replace(' ', '').ToUpperInvariant() -cne $normalizedThumbprint) {
        Fail 'The final launcher signer does not match the selected CurrentUser certificate.'
    }
    if ($null -eq $signature.TimeStamperCertificate) { Fail 'The final launcher has no verifiable RFC3161 timestamp certificate.' }
    if ((Get-PeMachine $package.LauncherPath) -ne $expectedMachine) { Fail 'Signing changed or corrupted the launcher architecture.' }
    $template = [System.IO.File]::ReadAllText($publicReadmeTemplate)
    if (-not $template.Contains('@VERSION@') -or -not $template.Contains('@ARCHITECTURE@') -or -not $template.Contains('@SOURCE_REVISION@')) {
        Fail 'The signed public README template is missing a required placeholder.'
    }
    $publicReadme = $template.Replace('@VERSION@', $version).Replace('@ARCHITECTURE@', $publicArchitecture).Replace('@SOURCE_REVISION@', $SourceRevision)
    if ($publicReadme.Contains('@VERSION@') -or $publicReadme.Contains('@ARCHITECTURE@') -or $publicReadme.Contains('@SOURCE_REVISION@')) {
        Fail 'The signed public README still contains an unresolved placeholder.'
    }
    if (-not $publicReadme.Contains('SIGNED PUBLIC RELEASE CANDIDATE') -or
        -not $publicReadme.Contains('DO NOT DISTRIBUTE UNTIL ALL HUMAN RELEASE GATES PASS')) {
        Fail 'The signed public README does not preserve the human-gated candidate warning.'
    }
    [System.IO.File]::WriteAllText(
        (Join-Path $packageRoot 'READ-ME-FIRST.txt'),
        $publicReadme,
        [System.Text.UTF8Encoding]::new($false)
    )
    [System.IO.File]::WriteAllText(
        (Join-Path $packageRoot 'SOURCE-REVISION.txt'),
        "$SourceRevision`r`n",
        [System.Text.UTF8Encoding]::new($false)
    )

    $finalPackage = Test-ExtractedPackage $packageRoot $expectedRootName $expectedMachine $false
    $finalSignature = Get-AuthenticodeSignature -LiteralPath $finalPackage.LauncherPath
    if ($finalSignature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
        Fail 'Final package validation lost the launcher signature.'
    }

    $temporaryOutputZip = Join-Path $resolvedOutputDirectory (".{0}.{1}.tmp" -f $publicZipName, [guid]::NewGuid().ToString('N'))
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $extractRoot,
        $temporaryOutputZip,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )
    $publicIndex = Test-ZipEntries $temporaryOutputZip
    if ($publicIndex.Root -cne $expectedRootName) { Fail 'Final public ZIP root changed unexpectedly.' }
    foreach ($requiredPublicEntry in @(
        "$expectedRootName/PS2 Emu.exe",
        "$expectedRootName/READ-ME-FIRST.txt",
        "$expectedRootName/SOURCE-REVISION.txt",
        "$expectedRootName/resources/app.asar",
        "$expectedRootName/$bundledDemoElfRelativePath"
    )) {
        if (-not ($publicIndex.Entries -ccontains $requiredPublicEntry)) {
            Fail "Final public ZIP is missing: $requiredPublicEntry"
        }
    }

    [System.IO.File]::Move($temporaryOutputZip, $publicZipPath)
    $temporaryOutputZip = $null
    $createdOutputs.Add($publicZipPath)
    $publicZipSha = Get-NormalizedSha256 $publicZipPath
    $publicZipInfo = Get-Item -LiteralPath $publicZipPath
    $launcherSha = Get-NormalizedSha256 $finalPackage.LauncherPath
    $readmeSha = Get-NormalizedSha256 (Join-Path $packageRoot 'READ-ME-FIRST.txt')
    $sourceRevisionFileSha = Get-NormalizedSha256 (Join-Path $packageRoot 'SOURCE-REVISION.txt')
    $platformID = if ($architectureLabel -ceq 'x64') { 'windows-x64' } else { 'windows-arm64' }
    $temporarySourceBindingPath = Join-Path $resolvedOutputDirectory (".{0}.{1}.tmp" -f (Split-Path -Leaf $sourceBindingPath), [guid]::NewGuid().ToString('N'))
    $sourceBinding = New-SourceRevisionBindingEvidence `
        $temporarySourceBindingPath `
        $certificate `
        $version `
        $platformID `
        $SourceRevision `
        $publicZipName `
        $publicZipInfo.Length `
        $publicZipSha
    $sourceBindingVerification = Test-SourceRevisionBindingEvidence `
        $temporarySourceBindingPath `
        $sourceBinding.CanonicalBytes `
        $sourceBinding.CertificateSha256
    $sourceBindingSha256 = Get-NormalizedSha256 $temporarySourceBindingPath
    [System.IO.File]::Move($temporarySourceBindingPath, $sourceBindingPath)
    $temporarySourceBindingPath = $null
    $createdOutputs.Add($sourceBindingPath)

    $evidence = [ordered]@{
        schemaVersion = 2
        product = 'PS2 Emu'
        releaseState = 'signed-candidate-human-gates-incomplete'
        publicDistributionApproved = $false
        version = $version
        architecture = if ($architectureLabel -ceq 'x64') { 'windows-x64' } else { 'windows-arm64-launcher-x64-core' }
        sourceRevision = $SourceRevision
        sourceBinding = [ordered]@{
            method = $sourceRevisionBindingMethod
            artifactReportedRevision = $SourceRevision
            signedEvidenceFileName = Split-Path -Leaf $sourceBindingPath
            signedEvidenceSha256 = $sourceBindingSha256
            signerCertificateSha256 = $sourceBinding.CertificateSha256
            signedPayloadCoversFinalArtifact = $true
            cmsCryptographicSignatureVerified = $true
            cmsCertificateChainVerified = $true
            rfc3161Timestamped = $false
            timestampNote = 'The launcher Authenticode signature is RFC3161 timestamped; the CMS source-binding sidecar is not independently timestamped.'
            verificationOutput = [string[]]$sourceBindingVerification
        }
        generatedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        unsignedInput = [ordered]@{
            fileName = $unsignedInfo.Name
            bytes = $unsignedInfo.Length
            reviewedSha256 = $actualInputSha
        }
        signedOutput = [ordered]@{
            fileName = $publicZipName
            bytes = $publicZipInfo.Length
            sha256 = $publicZipSha
            launcherSha256 = $launcherSha
            peMachine = ('0x{0:X4}' -f $expectedMachine)
            readmeSha256 = $readmeSha
            sourceRevisionFileSha256 = $sourceRevisionFileSha
        }
        signing = [ordered]@{
            store = 'CurrentUser\\My'
            certificateThumbprint = $normalizedThumbprint
            certificateSubject = $certificate.Subject
            certificateNotBeforeUtc = $certificate.NotBefore.ToUniversalTime().ToString('o')
            certificateNotAfterUtc = $certificate.NotAfter.ToUniversalTime().ToString('o')
            codeSigningEku = $codeSigningEkuOid
            digestAlgorithm = 'SHA256'
            timestampProtocol = 'RFC3161'
            timestampUrl = $TimestampUrl.AbsoluteUri
            timestampCertificateThumbprint = $signature.TimeStamperCertificate.Thumbprint.Replace(' ', '').ToUpperInvariant()
            timestampCertificateSubject = $signature.TimeStamperCertificate.Subject
            authenticodeStatus = $signature.Status.ToString()
        }
        verification = [ordered]@{
            reviewedInputSha256Matched = $true
            reviewedSourceCheckoutHeadMatched = $true
            reviewedSourceCheckoutClean = $true
            reviewedSourcePackageVersionMatched = $true
            reviewedAppAsarMatchesSource = $true
            safeZipPaths = $true
            requiredFilesPresent = $true
            prohibitedPayloadsAbsent = $true
            bundledDemoResourcesMatchReviewedSource = $true
            bundledDemoElfSha256Matched = $true
            exactPeArchitecture = $true
            signtoolPolicyVerification = $true
            rfc3161TimestampPresent = $true
            sourceRevisionBindingCmsVerified = $true
            sourceRevisionBindingCertificateChainVerified = $true
            sourceRevisionBindingMatchesFinalZip = $true
        }
        humanGates = [ordered]@{
            sourceBindingIndependentTimestampGatePassed = $false
            bundledDemoLicenseReviewRecorded = $false
            realHardwareEvidenceRecorded = $false
            browserDownloadSecurityEvidenceRecorded = $false
            externalCoreWorkflowEvidenceRecorded = $false
            ownerPublicReleaseApprovalRecorded = $false
        }
    }

    $temporaryChecksumPath = Join-Path $resolvedOutputDirectory (".{0}.{1}.tmp" -f (Split-Path -Leaf $checksumPath), [guid]::NewGuid().ToString('N'))
    [System.IO.File]::WriteAllText(
        $temporaryChecksumPath,
        "$publicZipSha  $publicZipName`r`n",
        [System.Text.Encoding]::ASCII
    )
    [System.IO.File]::Move($temporaryChecksumPath, $checksumPath)
    $temporaryChecksumPath = $null
    $createdOutputs.Add($checksumPath)
    $temporaryEvidencePath = Join-Path $resolvedOutputDirectory (".{0}.{1}.tmp" -f (Split-Path -Leaf $evidencePath), [guid]::NewGuid().ToString('N'))
    [System.IO.File]::WriteAllText(
        $temporaryEvidencePath,
        (($evidence | ConvertTo-Json -Depth 8) + "`r`n"),
        [System.Text.UTF8Encoding]::new($false)
    )
    [System.IO.File]::Move($temporaryEvidencePath, $evidencePath)
    $temporaryEvidencePath = $null
    $createdOutputs.Add($evidencePath)

    Write-Output "Created signed Windows release: $publicZipName"
    Write-Output "SHA-256: $publicZipSha"
    Write-Output "Evidence: $(Split-Path -Leaf $evidencePath)"
}
catch {
    foreach ($created in $createdOutputs) {
        if (Test-Path -LiteralPath $created -PathType Leaf) { Remove-Item -LiteralPath $created -Force }
    }
    throw
}
finally {
    if ($null -ne $temporaryOutputZip -and (Test-Path -LiteralPath $temporaryOutputZip -PathType Leaf)) {
        Remove-Item -LiteralPath $temporaryOutputZip -Force
    }
    foreach ($temporarySidecar in @($temporaryChecksumPath, $temporaryEvidencePath, $temporarySourceBindingPath)) {
        if ($null -ne $temporarySidecar -and (Test-Path -LiteralPath $temporarySidecar -PathType Leaf)) {
            Remove-Item -LiteralPath $temporarySidecar -Force
        }
    }
    if ($null -ne $workRoot -and (Test-Path -LiteralPath $workRoot -PathType Container)) {
        $resolvedWorkRoot = [System.IO.Path]::GetFullPath($workRoot)
        $resolvedTempBase = [System.IO.Path]::GetFullPath($tempBase)
        if ($resolvedWorkRoot.StartsWith($resolvedTempBase, [System.StringComparison]::OrdinalIgnoreCase) -and
            (Split-Path -Leaf $resolvedWorkRoot).StartsWith('ps2-emu-sign-', [System.StringComparison]::Ordinal)) {
            Remove-Item -LiteralPath $resolvedWorkRoot -Recurse -Force
        }
    }
}
