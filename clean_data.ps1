# 视频管理应用用户数据清理脚本
Write-Host "=== 视频管理应用数据清理 ===" -ForegroundColor Cyan
Write-Host ""

# 询问确认
$confirm = Read-Host "此操作将删除所有用户数据，无法撤销！是否继续？ (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "操作已取消" -ForegroundColor Red
    exit 0
}

Write-Host "开始清理..." -ForegroundColor Green
Write-Host ""

# 计数器
$deleted = 0
$errors = 0

# 1. 清理用户数据目录（最重要的）
Write-Host "清理用户数据目录..." -ForegroundColor Yellow

$userDataPath = "$env:APPDATA\video-manager"
if (Test-Path $userDataPath) {
    try {
        Write-Host "删除: $userDataPath"
        Remove-Item -Path $userDataPath -Recurse -Force
        $deleted++
        Write-Host "  成功删除用户数据目录" -ForegroundColor Green
    } catch {
        Write-Host "  删除失败: $($_.Exception.Message)" -ForegroundColor Red
        $errors++
    }
} else {
    Write-Host "  用户数据目录不存在" -ForegroundColor Gray
}

# 2. 清理其他可能的位置
$otherPaths = @(
    "$env:LOCALAPPDATA\video-manager",
    "$env:APPDATA\electron\video-manager"
)

foreach ($path in $otherPaths) {
    if (Test-Path $path) {
        try {
            Write-Host "删除: $path"
            Remove-Item -Path $path -Recurse -Force
            $deleted++
            Write-Host "  成功删除" -ForegroundColor Green
        } catch {
            Write-Host "  删除失败: $($_.Exception.Message)" -ForegroundColor Red
            $errors++
        }
    }
}

# 3. 清理项目temp目录
Write-Host ""
Write-Host "清理项目临时文件..." -ForegroundColor Yellow

$tempPath = ".\temp"
if (Test-Path $tempPath) {
    try {
        Write-Host "删除: $tempPath"
        Remove-Item -Path $tempPath -Recurse -Force
        $deleted++
        Write-Host "  成功删除temp目录" -ForegroundColor Green
    } catch {
        Write-Host "  删除失败: $($_.Exception.Message)" -ForegroundColor Red
        $errors++
    }
} else {
    Write-Host "  temp目录不存在" -ForegroundColor Gray
}

# 4. 结束可能的进程
Write-Host ""
Write-Host "检查进程..." -ForegroundColor Yellow

try {
    $processes = Get-Process | Where-Object { $_.ProcessName -like "*video*" -or $_.ProcessName -like "*electron*" }
    if ($processes) {
        foreach ($proc in $processes) {
            Write-Host "发现进程: $($proc.ProcessName) (PID: $($proc.Id))"
        }
        Write-Host "请手动关闭相关进程" -ForegroundColor Orange
    } else {
        Write-Host "  未发现相关进程" -ForegroundColor Gray
    }
} catch {
    Write-Host "  检查进程时出错" -ForegroundColor Red
}

# 总结
Write-Host ""
Write-Host "=== 清理完成 ===" -ForegroundColor Cyan
Write-Host "删除了 $deleted 个项目" -ForegroundColor Green
if ($errors -gt 0) {
    Write-Host "遇到 $errors 个错误" -ForegroundColor Red
}
Write-Host ""
Write-Host "数据清理完成！现在可以重新启动应用了。" -ForegroundColor Green 