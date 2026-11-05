# iOS 构建说明

仓库内的 `ios/` 已经是可直接打开的 Capacitor Xcode 工程。Web 产物会从 `dist/` 复制到 `ios/App/App/public/`。

## 直接下载未签名 IPA

- [ComfyUI-Studio-unsigned.ipa](../releases/ComfyUI-Studio-unsigned.ipa)
- [SHA-256 校验文件](../releases/ComfyUI-Studio-unsigned.ipa.sha256)
- [未签名说明](../releases/IOS-UNSIGNED-README.txt)

这是由 GitHub Actions 的 macOS runner 构建的**未签名** iOS 包（iOS 15.0+，arm64）。它不能直接双击安装，也不能上传到 TestFlight。需要先用自己的 Apple ID / 开发者证书签名，例如：

- 用 Xcode 打开 `ios/App/App.xcodeproj`，选择自己的 Team 后 Run；
- 或在 Windows / macOS 上用 Sideloadly、AltStore 等工具配合 Apple ID 重签；
- 免费的 Apple ID 签名通常 7 天需要重新签名。

没有用户自己的 Apple 开发者签名材料，任何人都无法生成可直接安装到 iPhone 的成品 IPA。这是 Apple 的签名机制，不是工程缺少文件。

## 环境要求

- macOS
- Xcode 15 或更新版本（Capacitor 8 使用 Swift Package Manager，不强制需要 CocoaPods）
- Node.js 20+
- 一个 Apple ID（个人免费签名只适用于自己连接的真机，证书 7 天需要重签）
- 上架 / TestFlight 需要付费 Apple Developer Program

## 运行到模拟器

```bash
npm install
npm run ios:sync
npx cap open ios
```

Xcode 打开后：

1. 左侧选择 **App** target。
2. **Signing & Capabilities** 勾选 Automatically manage signing。
3. 选择你的 Team。
4. 如果需要改 Bundle Identifier，在 Xcode 和 `capacitor.config.json` 的 `appId` 中保持一致。
5. 选择 iPhone 模拟器，点击 Run。

模拟器可以直接预览界面。加载相册图片和局域网 ComfyUI 功能建议用真机测试。

## 运行到 iPhone

1. 数据线连接 iPhone，信任电脑。
2. Xcode 顶部选择你的 iPhone。
3. Run（⌘R）。
4. 首次安装后，在 iPhone 上进入 **设置 → 通用 → VPN与设备管理**，信任你的开发者证书。

免费 Apple ID 的签名通常 7 天后过期，重新 Run 即可续签。

## 导出 IPA / TestFlight / App Store

1. Xcode 选择 **Any iOS Device**。
2. Product → Archive。
3. 在 Organizer 中点击 Distribute App。
4. 选择 App Store Connect / Ad Hoc / Development。
5. 需要有效的开发证书与描述文件；免费账号不能上架。

也可以使用 `npx cap build ios` 生成 Xcode 归档前的工程，但最终签名和分发必须在 Xcode / Apple 工具链中完成。

## 更新 Web 内容

修改 `src/` 后：

```bash
npm run ios:sync
```

然后回到 Xcode 重新 Run。不要手动修改 `ios/App/App/public/`，它会被同步覆盖。

## 本工程已配置

- 应用名：`ComfyUI Studio`
- Bundle ID：`com.nodecraft.workflowstudio`
- 图标：`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- 启动屏：`ios/App/App/Assets.xcassets/Splash.imageset/`
- `CapacitorHttp`：开启，用于绕过 WebView CORS
- 本地网络权限：`NSLocalNetworkUsageDescription`
- 相册权限：`NSPhotoLibraryUsageDescription`
- ATS：允许任意 HTTP 加载（便于连接局域网 ComfyUI）。正式上架时建议收紧为 HTTPS / 指定域名。

## API Key

不要在 Xcode 工程或 `Info.plist` 里写 API Key。打开 App 的设置页填写，Key 只存储在设备本地。

## 常见问题

**App 无法请求 API**

- 用真机测试，不要用 `localhost` 指电脑。
- 检查 `npx cap sync ios` 是否执行。
- 网页端 CORS 问题在原生 App 中一般不存在；如果仍有问题，打开设置里的「通过后端代理 API」。

**无法连接本地 ComfyUI**

- 手机与电脑必须在同一 LAN。
- ComfyUI 启动时监听 `0.0.0.0`（例如 `--listen 0.0.0.0`）。
- 首次访问时 iOS 会弹「本地网络」权限，请允许。
- `127.0.0.1` 在手机上表示手机自身，应该填写电脑的局域网 IP。

**Archive 按钮灰掉**

必须选择真实设备（Any iOS Device）而不是模拟器。

**免费账号提示没有签名能力**

检查 Xcode 登录的 Apple ID、Team，以及 Bundle ID 是否与他人重复。把 `com.nodecraft.workflowstudio` 改成你自己的唯一标识。
