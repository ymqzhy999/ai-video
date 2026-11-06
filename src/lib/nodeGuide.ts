import type { NodeDefinition, PortDef, PortType } from '../types/studio';
import { PORT_TYPES } from '../types/studio';
import { NODE_DEFINITIONS } from './nodeRegistry';

const MECHANISMS: Record<string, string> = {
  'text-input':
    '读取你填写的文本，向下游输出一个 TEXT 值。它不调用任何模型，是工作流最稳定的输入源。',
  prompt:
    '把提示词文本编码成下游可用的 TEXT 值，可附加风格模板。真正生成图像的是后续的生成或采样节点。',
  'negative-prompt':
    '输出负向提示词文本，用于告诉生成节点要避免哪些元素。它本身不接触模型。',
  'deepseek-refiner':
    '把上游文本发给 DeepSeek，让 LLM 扩写成更具体的提示词；未配置 Key 时退回本地规则并标注模拟。',
  'style-preset':
    '在上游文本后追加风格关键词。强度越高，追加的关键词越完整；不会修改原图。',
  'agnes-image':
    '把提示词、负向词、参考图与种子提交给 Agnes 图像 API。服务端返回的图片分辨率可能低于填写值，App 会在本地 Canvas 中校准为你设定的宽 × 高。',
  'image-output':
    '接收图像并展示、保存。图片会按节点设置的文件名和格式导出；Android 优先直接保存到系统相册。',
  'image-scale':
    '用浏览器/手机 Canvas 在本地缩放图片，支持拉伸、等比适应和居中裁剪。',
  'image-crop':
    '按比例、缩放和偏移在本地裁剪图片，不依赖云端服务。',
  'image-adjust':
    '逐像素调整亮度、对比度、饱和度，并可转黑白。全部在本地完成。',
  checkpoint:
    '输出基础模型描述。它本身不执行推理，等待采样器或 ComfyUI 后端真正加载模型。',
  lora:
    '在模型引用上叠加 LoRA 描述与权重。真实 LoRA 加载需要后端/ComfyUI。',
  'ksampler':
    '解释采样参数并输出模拟结果。真实采样需要 ComfyUI；模拟结果会带 SIMULATION 标记。',
  'latent-empty':
    '描述生成画布的宽高和批次，输出 LATENT。它不生成像素。',
  seed:
    '输出一个数值种子。固定种子可以复现同一结果；每次随机会改变生成结果。',
  dimensions:
    '把画布宽高作为两个 NUMBER 输出，方便多处复用。',
  'load-image':
    '读取本地图片并输出 IMAGE。图片在设备本地处理，不会自动上传。',
  'text-output':
    '接收文本并显示，支持复制。是文本链路的终点。',
  'comfyui-workflow':
    '提交你自己的 ComfyUI API 格式工作流，并轮询/监听任务结果。需要可访问的 ComfyUI 服务。',
  'api-request':
    '向任意 HTTP API 发送请求，适合接入你自己的服务。请求体支持 {{input}} 占位符。',
  note: '便签不参与执行，用来记录思路、参数和待办。',
  'character-card':
    '把角色外形、服装、性格和声音整理成一份可复用的角色设定文本，并保留参考图输出。不会调用模型。',
  'storyboard-script':
    '把故事梗概、角色设定拆成镜头文本。当前是本地结构模板，用于学习分镜组织；真实 LLM 分镜可接 DeepSeek。',
  'shot-prompt':
    '把分镜脚本、角色设定、景别、机位、光线和情绪合并成一条具体镜头提示词。',
  'tts-voice':
    '结构节点：接收台词文本，预留音色、语速和情绪参数，输出 AUDIO。真实配音需要 TTS API。',
  'music-gen':
    '结构节点：根据类型、时长与 BPM 预留 BGM 输出。真实音乐生成需要音乐 API。',
  'audio-load':
    '通过音频 URL 引入配音或音乐，作为视频合成的音频输入。',
  'load-video':
    '通过视频 URL 引入视频素材。没有 URL 时会提供结构预览，避免工作流因为缺素材而完全无法展示。',
  'video-latent':
    '描述视频尺寸、帧数和帧率，输出供视频采样器使用的 Latent 结构。',
  'wan-image-to-video':
    'Wan 图生视频结构：首帧图片 + 运动提示词 + 种子。当前版本会显示带 SIMULATION 的视频预览，真实生成需要视频 API 或 ComfyUI Wan 工作流。',
  'wan-text-to-video':
    'Wan 文生视频结构：文字提示词直接生成视频。当前版本为结构预览，真实推理需要视频服务。',
  'video-sampler':
    '视频扩散采样结构：模型、正负条件、Latent 与步数/CFG。当前返回模拟视频；真实采样需要 ComfyUI。',
  'video-combine':
    '把视频和音频合成为一个视频文件。当前版本只展示结构预览，真实合成需要 ffmpeg 或视频服务。',
  'save-video':
    '视频输出结构节点：描述文件名和格式。真实视频落盘需要视频服务或 ffmpeg。',
  'video-output':
    '展示最终视频并播放真实视频 URL；模拟视频会显示首帧和 SIMULATION 标记。',
  'video-api':
    '把提示词/首帧提交给设置中配置的视频服务（fal.ai、Replicate 或自定义任务接口），轮询任务并输出视频 URL；模型特有字段可通过高级 JSON 覆盖。',
  'vae-loader':
    '选择 VAE 编解码器描述，输出 VAE 引用。真实加载需要 ComfyUI。',
  'vae-decode':
    '把 Latent 解码成图像的结构节点。当前为预览；真实解码需要 ComfyUI。',
  ipadapter:
    '用参考图约束角色面部/风格的结构节点。真实 IP-Adapter 需要 ComfyUI 插件与后端。',
  'controlnet-apply':
    '用边缘、姿态或深度图约束生成的结构节点。真实 ControlNet 需要 ComfyUI。',
  'face-lock':
    '在图像链路中表达“锁定角色面部”的意图。真实实现需要人脸检测和 ComfyUI/IP-Adapter。',
  default:
    '这是一个可复用的工作流节点。它接收上游数据、按参数处理，然后把结果交给下游。',
};

const IMPLEMENTATION_LABELS: Record<
  NonNullable<NodeDefinition['implementation']>,
  string
> = {
  live: '可直接运行',
  simulated: '模拟执行',
  external: '需要外部服务',
  structural: '结构节点 / 需要后端',
};

function examplesFor(type: PortType, direction: 'input' | 'output'): string[] {
  return NODE_DEFINITIONS.filter((definition) =>
    direction === 'input'
      ? definition.outputs.some(
          (port) => port.type === type || port.type === 'ANY' || type === 'ANY',
        )
      : definition.inputs.some(
          (port) => port.type === type || port.type === 'ANY' || type === 'ANY',
        ),
  )
    .slice(0, 3)
    .map((definition) => definition.title);
}

function connectionFor(definition: NodeDefinition): string {
  const lines: string[] = [];
  if (definition.inputs.length) {
    definition.inputs.forEach((port) => {
      const examples = examplesFor(port.type, 'input');
      lines.push(
        `输入「${port.label}」接收 ${PORT_TYPES[port.type].label}（${port.type}）数据${
          port.required ? '，且为必填' : ''
        }。可连接来自 ${examples.length ? examples.join(' / ') : '同类型'} 的 ${port.type} 输出。`,
      );
    });
  } else {
    lines.push('这是一个起点节点，没有输入端口，可以直接从参数面板填写内容。');
  }
  if (definition.outputs.length) {
    definition.outputs.forEach((port) => {
      const examples = examplesFor(port.type, 'output');
      lines.push(
        `输出「${port.label}」提供 ${PORT_TYPES[port.type].label}（${port.type}）数据，可接到 ${examples.length ? examples.join(' / ') : '同类型'} 的输入。`,
      );
    });
  } else {
    lines.push('这是链路终点，没有输出端口；执行后结果会显示在节点和右侧属性面板。');
  }
  lines.push(
    '操作：从输出端口的小圆点按下，拖到目标节点左侧同色输入端口后松开。类型不一致、重复占用同一个输入或会形成循环的连接都会被拒绝。',
  );
  return lines.join('\n');
}

export interface NodeGuide {
  mechanism: string;
  connection: string;
  implementationLabel: string;
  examples: string;
}

export function getNodeGuide(definition: NodeDefinition): NodeGuide {
  const mechanism = MECHANISMS[definition.type] ?? MECHANISMS.default;
  const implementation = definition.implementation ??
    (definition.category === 'video' ? 'structural' : 'live');
  const exampleNodes = NODE_DEFINITIONS.filter(
    (item) =>
      item.category === definition.category && item.type !== definition.type,
  )
    .slice(0, 4)
    .map((item) => item.title);
  return {
    mechanism,
    connection: connectionFor(definition),
    implementationLabel: IMPLEMENTATION_LABELS[implementation],
    examples: exampleNodes.length
      ? `${definition.category}分类示例：${exampleNodes.join('、')}`
      : '',
  };
}

export function portExamples(port: PortDef, direction: 'input' | 'output'): string {
  const examples = examplesFor(port.type, direction);
  return examples.length ? examples.join('、') : '同类型节点';
}
