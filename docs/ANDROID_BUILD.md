# Android 构建说明

仓库内的 `android/` 是可直接用 Android Studio 打开的 Capacitor 工程。Web 产物会从 `dist/` 复制到 `android/app/src/main/assets/public/`。

## 直接下载已构建的 Debug APK

- [ComfyUI-Studio-debug.apk](../releases/ComfyUI-Studio-debug.apk)
- [SHA-256 校验文件](../releases/ComfyUI-Studio-debug.apk.sha256)

这是由 GitHub Actions 自动构建的 debug 签名包，适用于 Android 7.0+（minSdk 24），仅用于学习和测试。

## 环境要求

- JDK 21
- Android Studio（推荐最新稳定版）
- Android SDK Platform 36（工程当前 `compileSdk = 36`）
- Node.js 20+
- 如需真机调试：开启开发者模式与 USB 调试

## 用 Android Studio 运行

```bash
npm install
npm run android:sync
npx cap open android
```

Android Studio 会同步 Gradle。然后：

1. 连接真机或创建模拟器。
2. 选择 `app` 配置。
3. 点击 Run ▶。

## 命令行构建 Debug APK

先确保 `JAVA_HOME` 指向 JDK 21，并安装 Android SDK 36、设置 `ANDROID_HOME` / `ANDROID_SDK_ROOT`。

```bash
npm run android:sync
cd android
./gradlew assembleDebug
```

产物：

```
android/app/build/outputs/apk/debug/app-debug.apk
```

安装：

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

> 如果使用模拟器访问电脑上的 FastAPI / ComfyUI，`127.0.0.1` 指模拟器自身，电脑地址通常用 `10.0.2.2`（Android 模拟器）或局域网 IP。

## Release 包

1. 生成签名 keystore（不要提交到仓库）：

```bash
keytool -genkey -v -keystore studio-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias studio
```

2. 在 `android/app/build.gradle` 中增加 `signingConfigs`，或使用 Android Studio 的 Build → Generate Signed Bundle / APK。
3. 构建：

```bash
cd android
./gradlew bundleRelease   # AAB，用于 Google Play
# 或
./gradlew assembleRelease # APK
```

签名文件与密码不要提交。使用 `android/keystore.properties` 并从版本控制中排除。

## 本工程已配置

- 应用名：`ComfyUI Studio`
- Application ID：`com.nodecraft.workflowstudio`
- minSdk 24 / targetSdk 36
- 深色状态栏与导航栏
- 自适应图标和启动屏（`res/mipmap-*`、`res/drawable-*`）
- `android:usesCleartextTraffic="true"`：允许访问局域网 HTTP ComfyUI 服务
- `CapacitorHttp`：开启，用于原生网络请求
- `android:allowBackup="false"`：避免本地 API Key 被系统备份

## 更新 Web 内容

```bash
npm run android:sync
```

然后重新 Run 或重新打包。不要手动修改 `android/app/src/main/assets/public/`。

## API Key

在 App 内部 **设置 → API 接入** 填写。Key 只保存在设备本地，不要写进 Gradle 文件或源码。

## 常见问题

**Gradle 报 SDK 36 未安装**

Android Studio → SDK Manager 安装 Android 16 / API 36，或按你的 Android Studio 支持版本修改 `android/variables.gradle` 中的 `compileSdkVersion`/`targetSdkVersion`。

**请求 http:// 服务失败**

工程已允许 cleartext；但请确认手机和服务器在同一网络，且 ComfyUI / FastAPI 监听 `0.0.0.0`。

**图片选择无效或崩溃**

检查系统相册权限。文件选择使用 WebView 系统选择器，通常不需要额外存储权限。

**上传到 Google Play 提示 target API 过高/过低**

根据你的上架年份和 Play 要求调整 `android/variables.gradle`，再用 Android Studio 的升级助手处理 Gradle 插件版本。
