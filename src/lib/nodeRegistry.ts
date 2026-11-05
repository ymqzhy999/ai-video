import type { NodeDefinition } from '../types/studio';

/**
 * Central node registry.
 *
 * Adding a node = add one definition here + one executor in `lib/execution.ts`.
 * The library, canvas, inspector and validator all read from this registry, so
 * new node types automatically appear everywhere without touching the UI.
 */
export const NODE_DEFINITIONS: NodeDefinition[] = [
  /* ------------------------------ INPUT ------------------------------ */
  {
    type: 'text-input',
    title: '文本输入',
    subtitle: 'TEXT / STRING',
    category: 'input',
    icon: 'Type',
    accent: '#4ade80',
    description: '工作流的基础文本入口，可接入提示词、文件名或任意字符串。',
    inputs: [],
    outputs: [{ id: 'text', label: '文本', type: 'TEXT' }],
    fields: [
      {
        key: 'text',
        label: '文本内容',
        type: 'textarea',
        rows: 5,
        placeholder: '输入一段文本…',
        description: '输出到下游节点的原始字符串。',
      },
    ],
    defaults: { text: '一只戴着飞行员护目镜的柴犬，站在复古飞机机翼上，日落逆光。' },
    keywords: ['string', 'text', '字符串', '输入'],
  },
  {
    type: 'load-image',
    title: '图片载入',
    subtitle: 'LOAD IMAGE',
    category: 'input',
    icon: 'ImagePlus',
    accent: '#b07cff',
    description: '从相册或文件载入图片，用于图生图、裁剪与调色。',
    inputs: [],
    outputs: [{ id: 'image', label: '图像', type: 'IMAGE' }],
    fields: [
      {
        key: 'image',
        label: '图像文件',
        type: 'image',
        accept: 'image/png,image/jpeg,image/webp',
        description: '图片仅在本地处理，不会自动上传。',
      },
    ],
    defaults: { image: '' },
    keywords: ['image', 'upload', '图片', '相册', '素材'],
  },
  {
    type: 'number-input',
    title: '数值输入',
    subtitle: 'NUMBER',
    category: 'input',
    icon: 'Hash',
    accent: '#f5a623',
    description: '输出一个固定数值，可驱动步数、权重或数量。',
    inputs: [],
    outputs: [{ id: 'value', label: '数值', type: 'NUMBER' }],
    fields: [
      { key: 'value', label: '数值', type: 'number', min: -1000000, max: 1000000, step: 1 },
    ],
    defaults: { value: 1 },
    keywords: ['number', '数值', '参数'],
  },

  /* ------------------------------ TEXT ------------------------------- */
  {
    type: 'prompt',
    title: '提示词',
    subtitle: 'POSITIVE PROMPT',
    category: 'text',
    icon: 'MessageSquareText',
    accent: '#4ade80',
    description: '正向提示词编辑器，支持模板与实时字数统计。',
    inputs: [],
    outputs: [{ id: 'text', label: '提示词', type: 'TEXT' }],
    fields: [
      {
        key: 'text',
        label: '正向提示词',
        type: 'textarea',
        rows: 6,
        placeholder: '描述你希望生成的画面…',
        description: '主体 + 场景 + 风格 + 光线 + 构图 + 质量。',
      },
      {
        key: 'template',
        label: '提示词模板',
        type: 'select',
        options: [
          { label: '自定义', value: 'custom' },
          { label: '人像摄影', value: 'portrait' },
          { label: '产品广告', value: 'product' },
          { label: '电影概念', value: 'cinematic' },
          { label: '插画海报', value: 'illustration' },
        ],
        description: '运行时为提示词追加风格后缀。',
      },
    ],
    defaults: {
      text: 'A cinematic portrait of a young explorer in a neon-lit rain forest, volumetric light, ultra detailed, 85mm lens',
      template: 'custom',
    },
    keywords: ['prompt', '提示词', '正向', '文本'],
  },
  {
    type: 'negative-prompt',
    title: '负向提示词',
    subtitle: 'NEGATIVE PROMPT',
    category: 'text',
    icon: 'ShieldX',
    accent: '#6ee7b7',
    description: '声明画面中应避免的元素，作为生成节点的负向条件。',
    inputs: [],
    outputs: [{ id: 'text', label: '负向词', type: 'TEXT' }],
    fields: [
      {
        key: 'text',
        label: '负向提示词',
        type: 'textarea',
        rows: 4,
        placeholder: 'low quality, blurry…',
      },
    ],
    defaults: {
      text: 'low quality, blurry, deformed hands, extra fingers, watermark, text, oversaturated',
    },
    keywords: ['negative', '负向', '排除'],
  },
  {
    type: 'prompt-merge',
    title: '提示词拼接',
    subtitle: 'PROMPT MERGE',
    category: 'text',
    icon: 'Combine',
    accent: '#4ade80',
    description: '将两段文本按分隔符合并，适合主体与风格分离管理。',
    inputs: [
      { id: 'a', label: '文本 A', type: 'TEXT', required: true },
      { id: 'b', label: '文本 B', type: 'TEXT', required: true },
    ],
    outputs: [{ id: 'text', label: '合并文本', type: 'TEXT' }],
    fields: [
      { key: 'separator', label: '分隔符', type: 'text', placeholder: ', ' },
      { key: 'trim', label: '去除空段', type: 'toggle' },
    ],
    defaults: { separator: ', ', trim: true },
    keywords: ['merge', '拼接', '合并', 'concat'],
  },
  {
    type: 'deepseek-refiner',
    title: 'DeepSeek 提示词优化',
    subtitle: 'LLM REFINER',
    category: 'text',
    icon: 'WandSparkles',
    accent: '#7c8cff',
    description: '调用 DeepSeek 将简短描述扩展为专业的图像生成提示词。',
    inputs: [{ id: 'text', label: '原始提示词', type: 'TEXT', required: true }],
    outputs: [
      { id: 'text', label: '优化后', type: 'TEXT' },
      { id: 'raw', label: '原始', type: 'TEXT' },
    ],
    fields: [
      {
        key: 'instruction',
        label: '优化指令',
        type: 'textarea',
        rows: 4,
        placeholder: '保持原意，补充镜头、光线、材质与画质细节…',
      },
      {
        key: 'language',
        label: '输出语言',
        type: 'select',
        options: [
          { label: '英文（推荐）', value: 'en' },
          { label: '中文', value: 'zh' },
        ],
      },
    ],
    defaults: {
      instruction:
        'Rewrite this into one vivid English image-generation prompt. Keep the subject and intent. Add concrete details about composition, lighting, material and camera. Output the prompt only, no quotes or explanation.',
      language: 'en',
    },
    keywords: ['deepseek', 'llm', 'ai', '优化', '扩写'],
  },
  {
    type: 'style-preset',
    title: '风格预设',
    subtitle: 'STYLE PRESET',
    category: 'text',
    icon: 'Palette',
    accent: '#f472b6',
    description: '把风格关键词叠加到提示词上，快速切换视觉语言。',
    inputs: [{ id: 'text', label: '基础提示词', type: 'TEXT' }],
    outputs: [{ id: 'text', label: '带风格', type: 'TEXT' }],
    fields: [
      {
        key: 'style',
        label: '预设风格',
        type: 'select',
        options: [
          { label: '电影感', value: 'cinematic' },
          { label: '赛博朋克', value: 'cyberpunk' },
          { label: '胶片摄影', value: 'film' },
          { label: '极简产品', value: 'product' },
          { label: '日系插画', value: 'anime' },
          { label: '3D 渲染', value: '3d' },
        ],
      },
      { key: 'strength', label: '风格强度', type: 'slider', min: 0, max: 100, step: 5, unit: '%' },
    ],
    defaults: { style: 'cinematic', strength: 70 },
    keywords: ['style', '风格', '预设', '视觉'],
  },

  /* ------------------------------ IMAGE ------------------------------ */
  {
    type: 'image-scale',
    title: '图像缩放',
    subtitle: 'IMAGE SCALE',
    category: 'image',
    icon: 'Scaling',
    accent: '#b07cff',
    description: '在浏览器本地使用 Canvas 缩放图片，不损失原始文件。',
    inputs: [{ id: 'image', label: '图像', type: 'IMAGE', required: true }],
    outputs: [{ id: 'image', label: '图像', type: 'IMAGE' }],
    fields: [
      { key: 'width', label: '目标宽度', type: 'number', min: 64, max: 4096, step: 8, unit: 'px' },
      { key: 'height', label: '目标高度', type: 'number', min: 64, max: 4096, step: 8, unit: 'px' },
      {
        key: 'fit',
        label: '缩放方式',
        type: 'select',
        options: [
          { label: '拉伸铺满', value: 'stretch' },
          { label: '等比适应', value: 'contain' },
          { label: '居中裁剪', value: 'cover' },
        ],
      },
    ],
    defaults: { width: 768, height: 768, fit: 'cover' },
    keywords: ['scale', 'resize', '缩放', '尺寸'],
  },
  {
    type: 'image-crop',
    title: '图像裁剪',
    subtitle: 'IMAGE CROP',
    category: 'image',
    icon: 'Crop',
    accent: '#b07cff',
    description: '按比例与偏移裁剪图像，用于构图微调。',
    inputs: [{ id: 'image', label: '图像', type: 'IMAGE', required: true }],
    outputs: [{ id: 'image', label: '裁剪结果', type: 'IMAGE' }],
    fields: [
      {
        key: 'ratio',
        label: '裁剪比例',
        type: 'select',
        options: [
          { label: '1 : 1', value: '1:1' },
          { label: '4 : 3', value: '4:3' },
          { label: '3 : 4', value: '3:4' },
          { label: '16 : 9', value: '16:9' },
        ],
      },
      { key: 'zoom', label: '缩放', type: 'slider', min: 100, max: 200, step: 5, unit: '%' },
      { key: 'offsetX', label: '水平偏移', type: 'slider', min: -100, max: 100, step: 5 },
      { key: 'offsetY', label: '垂直偏移', type: 'slider', min: -100, max: 100, step: 5 },
    ],
    defaults: { ratio: '1:1', zoom: 100, offsetX: 0, offsetY: 0 },
    keywords: ['crop', '裁剪', '构图'],
  },
  {
    type: 'image-adjust',
    title: '图像调色',
    subtitle: 'COLOR ADJUST',
    category: 'processing',
    icon: 'SlidersHorizontal',
    accent: '#f472b6',
    description: '调整亮度、对比度与饱和度，可一键转为黑白。',
    inputs: [{ id: 'image', label: '图像', type: 'IMAGE', required: true }],
    outputs: [{ id: 'image', label: '调整后', type: 'IMAGE' }],
    fields: [
      { key: 'brightness', label: '亮度', type: 'slider', min: 40, max: 180, step: 1, unit: '%' },
      { key: 'contrast', label: '对比度', type: 'slider', min: 40, max: 180, step: 1, unit: '%' },
      { key: 'saturation', label: '饱和度', type: 'slider', min: 0, max: 220, step: 1, unit: '%' },
      { key: 'grayscale', label: '黑白模式', type: 'toggle' },
    ],
    defaults: { brightness: 100, contrast: 105, saturation: 110, grayscale: false },
    keywords: ['color', 'adjust', '调色', '滤镜'],
  },

  /* ------------------------------ MODEL ------------------------------ */
  {
    type: 'checkpoint',
    title: 'Checkpoint 加载器',
    subtitle: 'CHECKPOINT',
    category: 'model',
    icon: 'Boxes',
    accent: '#5b9dff',
    description: '选择基础模型并输出模型引用，供采样器或工作流后端使用。',
    inputs: [],
    outputs: [{ id: 'model', label: '模型', type: 'MODEL' }],
    fields: [
      {
        key: 'model',
        label: '基础模型',
        type: 'select',
        options: [
          { label: 'FLUX.1 Dev', value: 'flux1-dev' },
          { label: 'SDXL Base 1.0', value: 'sdxl-base-1.0' },
          { label: 'Stable Diffusion 1.5', value: 'sd15' },
          { label: 'SD 3.5 Large', value: 'sd35-large' },
        ],
      },
      {
        key: 'precision',
        label: '精度',
        type: 'select',
        options: [
          { label: 'fp16', value: 'fp16' },
          { label: 'bf16', value: 'bf16' },
          { label: 'fp8', value: 'fp8' },
        ],
      },
    ],
    defaults: { model: 'flux1-dev', precision: 'bf16' },
    keywords: ['checkpoint', 'model', '模型', 'flux', 'sdxl'],
  },
  {
    type: 'lora',
    title: 'LoRA 加载器',
    subtitle: 'LORA STACK',
    category: 'model',
    icon: 'Layers',
    accent: '#5b9dff',
    description: '在基础模型上叠加 LoRA 权重，控制风格与角色一致性。',
    inputs: [{ id: 'model', label: '模型', type: 'MODEL', required: true }],
    outputs: [{ id: 'model', label: '模型', type: 'MODEL' }],
    fields: [
      {
        key: 'lora',
        label: 'LoRA 文件',
        type: 'select',
        options: [
          { label: 'Cinematic Light v2', value: 'cinematic-light-v2' },
          { label: 'Analog Film 35mm', value: 'analog-film' },
          { label: 'Product Studio', value: 'product-studio' },
          { label: 'Pixel Art', value: 'pixel-art' },
        ],
      },
      { key: 'strength', label: '权重', type: 'slider', min: 0, max: 150, step: 5, unit: '%' },
    ],
    defaults: { lora: 'cinematic-light-v2', strength: 65 },
    keywords: ['lora', '权重', '风格模型'],
  },

  /* --------------------------- GENERATION --------------------------- */
  {
    type: 'agnes-image',
    title: 'Agnes 图像生成',
    subtitle: 'IMAGE GENERATION',
    category: 'generation',
    icon: 'Sparkles',
    accent: '#8b7dff',
    description: '调用 Agnes Image API 生成图片，并按你填写的宽高在本地校准导出尺寸；未配置密钥时使用明确标注的模拟输出。',
    inputs: [
      { id: 'prompt', label: '正向提示词', type: 'TEXT' },
      { id: 'negative', label: '负向提示词', type: 'TEXT' },
      { id: 'image', label: '参考图', type: 'IMAGE' },
      { id: 'seed', label: '种子', type: 'NUMBER' },
    ],
    outputs: [
      { id: 'image', label: '图像', type: 'IMAGE' },
      { id: 'prompt', label: '提示词', type: 'TEXT' },
    ],
    fields: [
      {
        key: 'prompt',
        label: '正向提示词（回退）',
        type: 'textarea',
        rows: 4,
        placeholder: '未连接提示词端口时使用此内容…',
      },
      {
        key: 'negativePrompt',
        label: '负向提示词（回退）',
        type: 'textarea',
        rows: 2,
        placeholder: '未连接负向端口时使用此内容…',
      },
      {
        key: 'width',
        label: '导出宽度',
        type: 'number',
        min: 512,
        max: 2048,
        step: 64,
        unit: 'px',
        description: '生成结果会在本地校准到这个宽度；默认 1024×1536 为 2:3 竖图。',
      },
      {
        key: 'height',
        label: '导出高度',
        type: 'number',
        min: 512,
        max: 2048,
        step: 64,
        unit: 'px',
        description: '与宽度共同决定最终导出文件的像素尺寸。',
      },
      { key: 'count', label: '生成数量', type: 'slider', min: 1, max: 4, step: 1 },
      { key: 'seed', label: '随机种子', type: 'seed', min: 0, max: 999999999 },
    ],
    defaults: {
      prompt:
        'Product photography of a translucent glass perfume bottle on wet obsidian, soft rim light, mist, luxurious minimal composition, ultra detailed',
      negativePrompt: 'text, watermark, logo, blurry, low quality, extra objects',
      width: 1024,
      height: 1536,
      count: 1,
      seed: 20260214,
    },
    keywords: ['agnes', 'generate', '生成', '文生图', '图生图', 'api'],
    width: 248,
  },
  {
    type: 'ksampler',
    title: 'KSampler 采样器',
    subtitle: 'SAMPLER',
    category: 'sampling',
    icon: 'Cpu',
    accent: '#5b9dff',
    description: '定义采样参数并生成结果；在本机未接入 ComfyUI 时以模拟模式运行。',
    inputs: [
      { id: 'model', label: '模型', type: 'MODEL', required: true },
      { id: 'positive', label: '正向', type: 'TEXT' },
      { id: 'negative', label: '负向', type: 'TEXT' },
      { id: 'latent', label: 'Latent', type: 'LATENT', required: true },
    ],
    outputs: [{ id: 'image', label: '图像', type: 'IMAGE' }],
    fields: [
      { key: 'steps', label: '步数', type: 'slider', min: 1, max: 80, step: 1 },
      { key: 'cfg', label: 'CFG', type: 'slider', min: 0, max: 20, step: 0.5 },
      {
        key: 'sampler',
        label: '采样器',
        type: 'select',
        options: [
          { label: 'euler', value: 'euler' },
          { label: 'euler_ancestral', value: 'euler_ancestral' },
          { label: 'dpmpp_2m', value: 'dpmpp_2m' },
          { label: 'dpmpp_sde', value: 'dpmpp_sde' },
        ],
      },
      {
        key: 'scheduler',
        label: '调度器',
        type: 'select',
        options: [
          { label: 'normal', value: 'normal' },
          { label: 'karras', value: 'karras' },
          { label: 'exponential', value: 'exponential' },
        ],
      },
      { key: 'seed', label: '种子', type: 'seed', min: 0, max: 999999999 },
    ],
    defaults: {
      steps: 28,
      cfg: 6.5,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
      seed: 884422,
    },
    keywords: ['sampler', '采样', 'steps', 'cfg'],
  },
  {
    type: 'latent-empty',
    title: '空 Latent',
    subtitle: 'EMPTY LATENT',
    category: 'sampling',
    icon: 'SquareDashed',
    accent: '#38d6d0',
    description: '定义生成画布尺寸与批次，为采样器提供潜空间输入。',
    inputs: [],
    outputs: [{ id: 'latent', label: 'Latent', type: 'LATENT' }],
    fields: [
      { key: 'width', label: '宽度', type: 'number', min: 256, max: 2048, step: 64, unit: 'px' },
      { key: 'height', label: '高度', type: 'number', min: 256, max: 2048, step: 64, unit: 'px' },
      { key: 'batch', label: '批次大小', type: 'slider', min: 1, max: 8, step: 1 },
    ],
    defaults: { width: 1024, height: 1024, batch: 1 },
    keywords: ['latent', '尺寸', '画布', 'batch'],
  },

  /* ------------------------------ PARAMS ----------------------------- */
  {
    type: 'seed',
    title: '随机种子',
    subtitle: 'SEED',
    category: 'params',
    icon: 'Dices',
    accent: '#f5a623',
    description: '固定或随机生成种子；每次执行时可按设置重新抽样。',
    inputs: [],
    outputs: [{ id: 'seed', label: '种子', type: 'NUMBER' }],
    fields: [
      { key: 'seed', label: '种子值', type: 'seed', min: 0, max: 999999999 },
      { key: 'randomize', label: '每次执行随机', type: 'toggle' },
    ],
    defaults: { seed: 20260214, randomize: false },
    keywords: ['seed', '随机', '种子'],
  },
  {
    type: 'dimensions',
    title: '画布尺寸',
    subtitle: 'DIMENSIONS',
    category: 'params',
    icon: 'Frame',
    accent: '#f5a623',
    description: '一次性输出宽高两个数值，便于连接到多个节点。',
    inputs: [],
    outputs: [
      { id: 'width', label: '宽度', type: 'NUMBER' },
      { id: 'height', label: '高度', type: 'NUMBER' },
    ],
    fields: [
      {
        key: 'preset',
        label: '比例预设',
        type: 'select',
        options: [
          { label: '1024 × 1024 · 方形', value: '1024x1024' },
          { label: '1024 × 768 · 横向', value: '1024x768' },
          { label: '768 × 1024 · 纵向', value: '768x1024' },
          { label: '自定义', value: 'custom' },
        ],
      },
      { key: 'width', label: '宽度', type: 'number', min: 256, max: 2048, step: 64, unit: 'px' },
      { key: 'height', label: '高度', type: 'number', min: 256, max: 2048, step: 64, unit: 'px' },
    ],
    defaults: { preset: '1024x1024', width: 1024, height: 1024 },
    keywords: ['size', 'width', 'height', '尺寸', '宽高'],
  },

  /* ------------------------------ OUTPUT ----------------------------- */
  {
    type: 'image-output',
    title: '图像输出',
    subtitle: 'IMAGE OUTPUT',
    category: 'output',
    icon: 'ImageDown',
    accent: '#b07cff',
    description: '展示最终图像，支持放大查看与下载。',
    inputs: [{ id: 'image', label: '图像', type: 'IMAGE', required: true }],
    outputs: [],
    fields: [
      { key: 'filename', label: '文件名', type: 'text', placeholder: 'comfyui-output' },
      {
        key: 'format',
        label: '导出格式',
        type: 'select',
        options: [
          { label: 'PNG', value: 'png' },
          { label: 'JPEG', value: 'jpeg' },
          { label: 'WebP', value: 'webp' },
        ],
      },
    ],
    defaults: { filename: 'comfyui-output', format: 'png' },
    keywords: ['output', 'save', '输出', '下载', '预览'],
    width: 248,
  },
  {
    type: 'text-output',
    title: '文本输出',
    subtitle: 'TEXT OUTPUT',
    category: 'output',
    icon: 'FileText',
    accent: '#4ade80',
    description: '查看上游文本结果，并支持一键复制。',
    inputs: [{ id: 'text', label: '文本', type: 'TEXT', required: true }],
    outputs: [],
    fields: [],
    defaults: {},
    keywords: ['text', '输出', '复制'],
  },

  /* ------------------------------ CUSTOM ----------------------------- */
  {
    type: 'comfyui-workflow',
    title: 'ComfyUI API 工作流',
    subtitle: 'COMFYUI BRIDGE',
    category: 'custom',
    icon: 'Workflow',
    accent: '#5b9dff',
    description: '提交 ComfyUI API 格式工作流并监听执行结果；需要配置服务器地址。',
    inputs: [],
    outputs: [
      { id: 'image', label: '首张图像', type: 'IMAGE' },
      { id: 'info', label: '任务信息', type: 'TEXT' },
    ],
    fields: [
      {
        key: 'workflowJson',
        label: 'API 格式工作流 (JSON)',
        type: 'code',
        rows: 10,
        placeholder: '{ "3": { "class_type": "KSampler", ... } }',
        description: '在 ComfyUI 中开启「开发者模式 → 导出 API 格式」后粘贴。',
      },
      {
        key: 'timeout',
        label: '超时时间',
        type: 'number',
        min: 10,
        max: 600,
        step: 10,
        unit: '秒',
      },
    ],
    defaults: { workflowJson: '', timeout: 180 },
    keywords: ['comfyui', 'api', 'workflow', '自定义'],
    width: 250,
  },
  {
    type: 'api-request',
    title: 'HTTP 请求',
    subtitle: 'CUSTOM API',
    category: 'custom',
    icon: 'Braces',
    accent: '#8b7dff',
    description: '向任意 HTTP API 发送请求并输出响应；适合扩展自有服务。',
    inputs: [{ id: 'payload', label: '请求体', type: 'ANY' }],
    outputs: [{ id: 'text', label: '响应', type: 'TEXT' }],
    fields: [
      {
        key: 'method',
        label: '方法',
        type: 'select',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
        ],
      },
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/v1/run' },
      {
        key: 'headers',
        label: '请求头 (JSON)',
        type: 'code',
        rows: 3,
        placeholder: '{ "Authorization": "Bearer …" }',
      },
      {
        key: 'body',
        label: '请求体模板 (JSON)',
        type: 'code',
        rows: 4,
        placeholder: '{ "prompt": "{{input}}" }',
      },
    ],
    defaults: { method: 'POST', url: '', headers: '{}', body: '{"input":"{{input}}"}' },
    keywords: ['api', 'http', 'request', '自定义', '扩展'],
  },
  {
    type: 'note',
    title: '便签',
    subtitle: 'NOTE',
    category: 'custom',
    icon: 'StickyNote',
    accent: '#8a93a3',
    description: '在画布上记录思路、参数或待办，不参与执行。',
    inputs: [],
    outputs: [],
    fields: [
      { key: 'text', label: '便签内容', type: 'textarea', rows: 5, placeholder: '记录工作流说明…' },
      { key: 'color', label: '便签颜色', type: 'color' },
    ],
    defaults: { text: '这里记录工作流的设计思路。', color: '#8b7dff' },
    keywords: ['note', '便签', '注释', '说明'],
    width: 220,
  },
];

export const NODE_DEF_MAP: Record<string, NodeDefinition> = Object.fromEntries(
  NODE_DEFINITIONS.map((definition) => [definition.type, definition]),
);

export const GROUP_DEFINITION: NodeDefinition = {
  type: 'group',
  title: '分组',
  subtitle: 'GROUP',
  category: 'custom',
  icon: 'Group',
  accent: '#8b7dff',
  description: '节点分组容器',
  inputs: [],
  outputs: [],
  fields: [],
  defaults: { text: '', color: '#8b7dff' },
  keywords: ['group'],
};

export function getNodeDefinition(type: string): NodeDefinition {
  return NODE_DEF_MAP[type] ?? GROUP_DEFINITION;
}

export function getPort(
  type: string,
  portId: string | null | undefined,
  direction: 'input' | 'output',
): { port: import('../types/studio').PortDef; definition: NodeDefinition } | null {
  const definition = getNodeDefinition(type);
  const ports = direction === 'input' ? definition.inputs : definition.outputs;
  const port = ports.find((candidate) => candidate.id === portId);
  return port ? { port, definition } : null;
}

export function typesCompatible(source: string, target: string): boolean {
  return source === target || source === 'ANY' || target === 'ANY';
}

export function searchNodes(query: string): NodeDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return NODE_DEFINITIONS;
  return NODE_DEFINITIONS.filter((definition) => {
    const haystack = [
      definition.title,
      definition.subtitle,
      definition.type,
      definition.description,
      ...(definition.keywords ?? []),
      ...definition.fields.map((field) => field.label),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
