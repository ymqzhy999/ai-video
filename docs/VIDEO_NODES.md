# 视频节点与视频 API

这个项目把「视频链路」拆成和 ComfyUI 类似的结构节点。即使没有后端，也可以先理解端口、参数和连接顺序。

## 当前节点

| 节点 | 作用 | 状态 |
| --- | --- | --- |
| 视频 Latent | 定义视频宽、高、帧数、fps | 本地结构 |
| Wan 图生视频 | 首帧图 + 运动提示词 → 视频 | 结构/模拟；可接视频 API |
| Wan 文生视频 | 文本 → 视频 | 结构/模拟 |
| 视频采样器 | 模型 + 正负条件 + Latent → 视频 | 结构/模拟 |
| 视频合成 | 视频 + 音频 → 视频 | 结构/模拟 |
| 保存视频 | 描述输出文件名/格式 | 结构 |
| 视频输出 | 播放真实视频，或显示模拟首帧 | 预览 |
| 视频生成 API | 调用设置里的视频服务 | 实验适配 |
| 视频载入 | 通过 URL 引入视频 | URL 预览 |
| 音频载入 | 通过 URL 引入音频 | URL 预览 |
| VAE / VAE 解码 | 图像编解码结构 | 结构 |
| IP-Adapter / ControlNet / 面部锁定 | 角色一致性与控制结构 | 结构 |

结构节点不会伪造真实视频。执行结果会明确显示 `SIMULATION`，方便区分「链路学会」和「真实生成」。

## 视频 API 设置

打开 **设置 → API 接入 → 视频生成 API**：

- **服务类型**：fal.ai / Replicate / 自定义兼容接口
- **API Key**：只保存在当前设备的本地存储
- **Base URL**：fal.ai 默认 `https://queue.fal.run`；Replicate 默认 `https://api.replicate.com`
- **模型 ID**：例如 fal.ai 的模型路径，或 Replicate 的 `owner/model`

不同视频模型接受的字段不同。可以在「视频生成 API」节点的 **高级请求参数 JSON** 里覆盖字段，例如：

```json
{
  "guidance_scale": 6,
  "num_frames": 81
}
```

节点会把请求体中的 prompt、首帧、尺寸、时长、fps、seed 与这段 JSON 合并。

### 自定义接口约定

```http
POST {BaseURL}/generate
Authorization: Bearer <key>
Content-Type: application/json

{
  "model": "...",
  "prompt": "...",
  "negative_prompt": "...",
  "image_url": "...",
  "width": 720,
  "height": 1280,
  "duration": 5,
  "fps": 24,
  "seed": 1
}
```

可以立即返回：

```json
{ "video_url": "https://cdn.example/video.mp4" }
```

也可以返回任务：

```json
{ "id": "job_123", "status_url": "https://your-api/status/job_123" }
```

状态接口返回 `completed` / `succeeded` 和 `video_url` 即可。失败、超时和未配置都会在节点上报错，不会生成假视频。

## 免费额度

以下服务的免费额度/试用政策会变化，请以官网为准：

- [fal.ai](https://fal.ai)
- [Replicate](https://replicate.com)
- [ModelScope 魔搭](https://modelscope.cn)
- [火山引擎 Seedance](https://www.volcengine.com)

如果平台要求签名（例如火山引擎 AK/SK）或使用了不同的异步协议，建议用一个小后端把请求转换成上面的自定义接口约定，再填到 App 中。
