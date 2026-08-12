$ErrorActionPreference = 'Stop'

$repository = 'brunojorri/Itau-Mosys'
$branch = 'main'
$extensionId = 'motion-shelf'
$archiveUrl = "https://github.com/$repository/archive/refs/heads/$branch.zip"
$workspace = Join-Path $env:TEMP ("itau-mosys-install-" + [Guid]::NewGuid().ToString('N'))
$archive = Join-Path $workspace 'source.zip'
$destination = Join-Path $env:APPDATA "Adobe\CEP\extensions\$extensionId"

try {
    Write-Host ''
    Write-Host 'Itaú Mosys — instalação' -ForegroundColor Cyan
    Write-Host ''

    if (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) {
        throw 'Feche o Adobe After Effects antes de instalar o Itaú Mosys e execute este comando novamente.'
    }

    New-Item -ItemType Directory -Path $workspace -Force | Out-Null
    Write-Host 'Baixando a versão oficial...'
    Invoke-WebRequest -Uri $archiveUrl -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $workspace -Force

    $source = Join-Path $workspace 'Itau-Mosys-main\panel'
    if (-not (Test-Path -LiteralPath (Join-Path $source 'CSXS\manifest.xml'))) {
        throw 'O pacote baixado não contém um painel Itaú Mosys válido.'
    }

    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
    New-Item -Path 'HKCU:\Software\Adobe\CSXS.12' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Adobe\CSXS.12' -Name 'PlayerDebugMode' -Value '1' -Type String

    Write-Host ''
    Write-Host 'Itaú Mosys foi instalado com sucesso.' -ForegroundColor Green
    Write-Host 'Abra o After Effects e acesse: Janela > Extensões (Legado) > Itaú Mosys'
}
finally {
    if (Test-Path -LiteralPath $workspace) {
        Remove-Item -LiteralPath $workspace -Recurse -Force -ErrorAction SilentlyContinue
    }
}
