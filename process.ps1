Add-Type -AssemblyName System.Drawing
$src = "C:\Users\wylie\.gemini\antigravity\brain\1fe5f4cc-1879-442e-8c0a-021ad1883c1c\media__1776692856611.png"
$img = [System.Drawing.Bitmap]::FromFile($src)
$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$img.MakeTransparent($white)

$dest1 = "Z:\GEMINI_CHATS\POLYUNITY_SYNC_APP\frontend\public\icon.png"
$dest2 = "Z:\GEMINI_CHATS\POLYUNITY_SYNC_APP\frontend\electron\icon.png"
$dest3 = "Z:\GEMINI_CHATS\POLYUNITY_SYNC_APP\frontend\src\assets\logo.png"

$dir3 = [System.IO.Path]::GetDirectoryName($dest3)
if (!(Test-Path $dir3)) { New-Item -ItemType Directory -Force -Path $dir3 }

$img.Save($dest1, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Save($dest2, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Save($dest3, [System.Drawing.Imaging.ImageFormat]::Png)

$img.Dispose()
