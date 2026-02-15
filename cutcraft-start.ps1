#Requires -Version 5.1
<#
.SYNOPSIS
    CutCraft プロジェクト起動・管理スクリプト
.DESCRIPTION
    Next.js アプリのビルド・起動・再起動・停止を管理します。
.PARAMETER Action
    実行するアクション: start (既定), dev, restart, stop, status
.PARAMETER SkipBuild
    start/restart 時にビルドをスキップします
.EXAMPLE
    .\cutcraft-start.ps1              # ビルド＆起動
    .\cutcraft-start.ps1 dev          # 開発モードで起動
    .\cutcraft-start.ps1 restart      # 再起動（ビルドあり）
    .\cutcraft-start.ps1 restart -SkipBuild  # 再起動（ビルドなし）
    .\cutcraft-start.ps1 stop         # 停止
    .\cutcraft-start.ps1 status       # 状態確認
#>

param(
    [ValidateSet("start", "dev", "restart", "stop", "status")]
    [string]$Action = "start",
    [switch]$SkipBuild
)

$ProjectDir = "C:\Users\yngsw\dev\cutcraft"
$PidFile = Join-Path $ProjectDir ".cutcraft.pid"
$Port = 3000

# --- ユーティリティ関数 ---

function Write-Status($Message, $Color = "Cyan") {
    Write-Host "[CutCraft] " -ForegroundColor $Color -NoNewline
    Write-Host $Message
}

function Get-RunningProcess {
    if (Test-Path $PidFile) {
        $savedPid = Get-Content $PidFile -ErrorAction SilentlyContinue
        if ($savedPid) {
            $proc = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
            if ($proc -and !$proc.HasExited) {
                return $proc
            }
        }
    }
    # PIDファイルがない場合、ポートで検索
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    }
    return $null
}

function Stop-CutCraft {
    $proc = Get-RunningProcess
    if ($proc) {
        Write-Status "プロセス (PID: $($proc.Id)) を停止しています..." "Yellow"
        # ツリー全体を停止（node の子プロセス含む）
        $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $proc.Id }
        foreach ($child in $children) {
            Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Status "停止しました" "Green"
    }
    else {
        Write-Status "実行中のプロセスはありません" "Gray"
    }
    if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
}

function Start-CutCraft([switch]$DevMode, [switch]$NoBuild) {
    Set-Location $ProjectDir

    # 既に起動中なら警告
    $existing = Get-RunningProcess
    if ($existing) {
        Write-Status "既に起動中です (PID: $($existing.Id))。先に停止してください。" "Yellow"
        Write-Status "  再起動するには: .\cutcraft-start.ps1 restart" "Gray"
        return
    }

    if ($DevMode) {
        Write-Status "開発モードで起動します (ポート $Port)..." "Cyan"
        Write-Status "停止するには Ctrl+C を押してください" "Gray"
        npm run dev
    }
    else {
        # プロダクションモード
        if (-not $NoBuild) {
            Write-Status "ビルドを開始します..." "Cyan"
            npm run build
            if ($LASTEXITCODE -ne 0) {
                Write-Status "ビルドに失敗しました" "Red"
                return
            }
            Write-Status "ビルド完了" "Green"
        }

        Write-Status "サーバーを起動します (ポート $Port)..." "Cyan"
        # npm.cmd 経由だとプロセスが連鎖して PID 追跡できないため node を直接起動
        $nodeExe = (Get-Command node -ErrorAction Stop).Source
        $nextCli = Join-Path $ProjectDir "node_modules\next\dist\bin\next"
        $process = Start-Process -FilePath $nodeExe -ArgumentList $nextCli, "start" `
            -WorkingDirectory $ProjectDir -PassThru -WindowStyle Hidden
        $process.Id | Out-File $PidFile -Force

        Start-Sleep -Seconds 5
        $check = Get-RunningProcess
        if ($check) {
            Write-Status "起動しました (PID: $($process.Id))" "Green"
            Write-Status "URL: http://localhost:$Port" "Cyan"
        }
        else {
            Write-Status "起動に失敗した可能性があります。status で確認してください。" "Yellow"
        }
    }
}

function Show-Status {
    $proc = Get-RunningProcess
    if ($proc) {
        $uptime = (Get-Date) - $proc.StartTime
        $uptimeStr = "{0}時間{1}分" -f [int]$uptime.TotalHours, $uptime.Minutes
        Write-Status "実行中" "Green"
        Write-Host "  PID:      $($proc.Id)"
        Write-Host "  稼働時間: $uptimeStr"
        Write-Host "  URL:      http://localhost:$Port"
    }
    else {
        Write-Status "停止中" "Gray"
    }
}

# --- メイン処理 ---

switch ($Action) {
    "start" { Start-CutCraft -NoBuild:$SkipBuild }
    "dev" { Start-CutCraft -DevMode }
    "restart" {
        Write-Status "再起動します..." "Cyan"
        Stop-CutCraft
        Start-Sleep -Seconds 1
        Start-CutCraft -NoBuild:$SkipBuild
    }
    "stop" { Stop-CutCraft }
    "status" { Show-Status }
}
