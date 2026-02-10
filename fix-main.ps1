# Script para arreglar main.js eliminando event listeners duplicados
$filePath = "js\main.js"
$content = Get-Content $filePath -Raw -Encoding UTF8

# Leer el archivo línea por línea
$lines = Get-Content $filePath -Encoding UTF8

# Encontrar y eliminar las líneas 147-179 (el event listener duplicado)
$newLines = @()
$lineNumber = 0
$skipUntil = -1

foreach ($line in $lines) {
    $lineNumber++
    
    # Si estamos en la línea 147, empezar a saltar hasta la 179
    if ($lineNumber -eq 147 -and $line -match "Event Listeners") {
        $skipUntil = 179
        continue
    }
    
    # Si estamos saltando líneas
    if ($skipUntil -gt 0 -and $lineNumber -le $skipUntil) {
        continue
    }
    
    # Agregar la línea
    $newLines += $line
}

# Guardar el archivo
$newLines | Set-Content $filePath -Encoding UTF8

Write-Host "Archivo arreglado. Event listeners duplicados eliminados."
