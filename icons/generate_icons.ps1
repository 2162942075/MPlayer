# 视频管理应用图标生成脚本
Write-Host "=== 视频管理应用图标生成工具 ===" -ForegroundColor Cyan
Write-Host ""

# 检查是否安装了必要工具
function Test-InkscapeInstalled {
    try {
        $null = Get-Command "inkscape" -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Test-ImageMagickInstalled {
    try {
        $null = Get-Command "magick" -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# 创建图标目录
$iconDir = ".\icons"
if (!(Test-Path $iconDir)) {
    New-Item -ItemType Directory -Path $iconDir | Out-Null
    Write-Host "创建图标目录: $iconDir" -ForegroundColor Green
}

# 定义图标尺寸
$sizes = @(16, 24, 32, 48, 64, 96, 128, 256, 512)

Write-Host "生成图标文件..." -ForegroundColor Yellow
Write-Host ""

# 如果安装了Inkscape，使用它转换SVG
if (Test-InkscapeInstalled) {
    Write-Host "使用 Inkscape 生成高质量图标..." -ForegroundColor Green
    
    foreach ($size in $sizes) {
        $outputFile = "$iconDir\video-manager-$size.png"
        try {
            & inkscape "video-manager-icon-simple.svg" --export-filename="$outputFile" --export-width=$size --export-height=$size
            Write-Host "  ✓ 生成 ${size}x${size} PNG" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ 生成 ${size}x${size} 失败" -ForegroundColor Red
        }
    }
    
    # 生成ICO文件
    if (Test-ImageMagickInstalled) {
        Write-Host ""
        Write-Host "生成 ICO 文件..." -ForegroundColor Yellow
        try {
            $pngFiles = $sizes | ForEach-Object { "$iconDir\video-manager-$_.png" }
            & magick $pngFiles "$iconDir\video-manager.ico"
            Write-Host "  ✓ 生成 video-manager.ico" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ ICO 文件生成失败" -ForegroundColor Red
        }
    }
} else {
    Write-Host "未找到 Inkscape，请安装后重试" -ForegroundColor Red
    Write-Host "下载地址: https://inkscape.org/release/" -ForegroundColor Yellow
}

# 生成应用图标使用说明
$readme = @"
# 视频管理应用图标使用指南

## 📁 生成的文件

### PNG 文件 (用于不同场景)
- video-manager-16.png   - 小图标、状态栏
- video-manager-24.png   - 小按钮
- video-manager-32.png   - 标准小图标
- video-manager-48.png   - 中等图标
- video-manager-64.png   - 大图标
- video-manager-96.png   - 高DPI小图标
- video-manager-128.png  - 标准大图标
- video-manager-256.png  - 应用图标
- video-manager-512.png  - 高分辨率图标

### ICO 文件 (Windows应用图标)
- video-manager.ico      - 包含多种尺寸的Windows图标文件

## 🔧 如何使用

### 1. Electron应用中使用
在 package.json 的 build 配置中添加：
```json
{
  "build": {
    "win": {
      "icon": "icons/video-manager.ico"
    },
    "mac": {
      "icon": "icons/video-manager.png"
    },
    "linux": {
      "icon": "icons/video-manager.png"
    }
  }
}
```

### 2. 桌面快捷方式
- 右键快捷方式 → 属性 → 更改图标
- 选择 video-manager.ico

### 3. 任务栏固定
- 将应用固定到任务栏后，图标会自动使用ICO文件中的合适尺寸

## 🎨 设计特点

- **现代渐变**: 蓝紫色渐变背景，符合现代设计趋势
- **播放元素**: 中央播放按钮，突出视频播放功能
- **管理元素**: 底部文件夹和列表图标，体现管理功能
- **多尺寸优化**: 在16px到512px各种尺寸下都清晰可见
- **高对比度**: 确保在浅色和深色背景下都有良好显示效果

## 📋 技术规格

- 格式: SVG源文件 + PNG多尺寸 + ICO多图标
- 色彩: 32位真彩色 + Alpha透明通道
- 兼容性: Windows 7+ / macOS 10.10+ / Linux桌面环境
"@

$readme | Out-File -FilePath "$iconDir\README.md" -Encoding UTF8

Write-Host ""
Write-Host "=== 图标生成完成 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "📁 图标文件位置: $iconDir" -ForegroundColor White
Write-Host "📖 使用说明: $iconDir\README.md" -ForegroundColor White
Write-Host ""
Write-Host "💡 提示:" -ForegroundColor Yellow
Write-Host "  1. 将 video-manager.ico 用作应用图标" -ForegroundColor Gray
Write-Host "  2. 将生成的图标文件夹复制到项目根目录" -ForegroundColor Gray
Write-Host "  3. 参考README.md配置Electron构建设置" -ForegroundColor Gray
Write-Host ""

# 显示安装建议
if (!(Test-InkscapeInstalled)) {
    Write-Host "🛠️  建议安装工具:" -ForegroundColor Orange
    Write-Host "  Inkscape: https://inkscape.org/release/" -ForegroundColor Gray
}

if (!(Test-ImageMagickInstalled)) {
    Write-Host "  ImageMagick: https://imagemagick.org/script/download.php#windows" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🎉 图标已准备就绪，可以提升应用颜值了！" -ForegroundColor Green 