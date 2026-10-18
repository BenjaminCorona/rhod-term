# ==============================================================================
# Rhod Terminal - Native High-Performance Shell Integration for PowerShell
# ==============================================================================
$env:FORCE_COLOR = "3"
$env:CLICOLOR = "1"

if (Get-Module -ListAvailable -Name PSReadLine) {
    try {
        Set-PSReadLineOption -Colors @{
            Command   = 'Cyan'
            Parameter = 'Yellow'
            Operator  = 'Magenta'
            String    = 'Green'
            Number    = 'Magenta'
            Member    = 'Cyan'
            Variable  = 'Green'
            Type      = 'Blue'
        } -ErrorAction SilentlyContinue
    } catch {}
}
