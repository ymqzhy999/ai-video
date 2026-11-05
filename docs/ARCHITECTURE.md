# 架构与扩展说明

## 技术栈

| 层 | 技术 |
| --- | --- |
| UI | React 19 + TypeScript |
| 画布 | @xyflow/react（React Flow 12） |
| 状态 | Zustand 5 |
| 样式 | 原生 CSS 设计令牌 + 响应式布局 |
| 构建 | Vite 8 |
| 原生壳 | Capacitor 8（iOS / Android） |
| 可选后端 | FastAPI + SQLite + httpx |
| 工作流格式 | JSON（`schemaVersion: 1`） |

选择 React Flow 而不是手写 Canvas/SVG 编辑器，是因为它提供稳定的节点拖拽、缩放、框选、连线交互；类型检查、执行、校验等业务逻辑仍由本项目实现。

## 目录职责

```
src/
├── types/studio.ts          核心类型、端口类型、默认设置
├── lib/
│   ├── nodeRegistry.ts      节点定义注册表（唯一的节点类型来源）
│   ├── graph.ts             图算法、序列化、对齐、自动布局、分组
│   ├── execution.ts         预检、拓扑执行、缓存、执行器
│   ├── api.ts               Agnes / DeepSeek / ComfyUI / 自定义 API
│   ├── image.ts             本地 Canvas 图像处理与模拟图
│   ├── storage.ts           IndexedDB / localStorage 持久化 + 导入导出
│   ├── db.ts                轻量 IndexedDB 封装
│   └── flowBridge.ts        给 TopBar / Inspector 使用的画布控制桥
├── store/studioStore.ts     Zustand 全局状态和业务动作
├── components/              组件（画布、面板、弹窗、节点、连线）
├── data/sampleWorkflows.ts  示例工作流
└── styles/                  设计令牌和各区域样式
```

## 状态模型

三个持久化区域：

1. **工作流库**：`WorkflowRecord[]`，保存节点、连接、视口和元信息。
2. **当前画布**：`nodes` / `edges`，含运行时状态（只在内存中）。
3. **设置与学习记录**：`AppSettings`、收藏节点、最近使用、学习进度。

工作流通过 `savePersistedState()` 写入 IndexedDB；如果 IndexedDB 不可用会回退 localStorage。保存时会去掉运行结果和状态，不把临时数据写进 JSON。

## 节点扩展

新增一个节点只需要两步：

### 1. 在 `nodeRegistry.ts` 添加定义

```ts
{
  type: 'my-node',
  title: '我的节点',
  subtitle: 'MY NODE',
  category: 'custom',
  icon: 'Sparkles',
  accent: '#8b7dff',
  description: '一句话说明节点作用。',
  inputs: [{ id: 'text', label: '文本', type: 'TEXT', required: true }],
  outputs: [{ id: 'text', label: '输出', type: 'TEXT' }],
  fields: [{ key: 'value', label: '参数', type: 'text' }],
  defaults: { value: 'hello' },
}
```

节点库、画布、属性面板、端口类型检查、校验、示例和搜索都会自动读取这个定义。

### 2. 在 `execution.ts` 的 `executeNode` 添加执行逻辑

```ts
case 'my-node': {
  const text = asText(inputs.text);
  const result = `${text} ${params.value}`;
  return { outputs: { text: result }, text: result };
}
```

如果涉及新的图标，把 lucide 图标加入 `components/NodeIcon.tsx` 的映射表。

## 执行流程

```
点击执行
  → validateGraph()：未知节点 / 环 / 断边 / 类型 / 必填端口
  → resolveTargets()：全部 / 单节点 / 从某节点向下
  → topologicalOrder()：Kahn 算法（同时用于检测环）
  → 逐节点 resolve inputs（上游输出 → 输入端口）
  → cache key（类型 + 参数 + 输入 + 模式）
  → executeNode()
  → 更新节点状态 / 进度 / 日志 / 结果
  → 写入执行历史
```

- 取消：`AbortController` 在下一个节点或网络请求处中断。
- 失败：记录错误节点，打开属性面板并聚焦该节点。
- 单节点 / 从节点继续：上游没有结果时直接给出清晰错误，不会偷偷跑完整工作流。
- 缓存：默认开启，缓存位于内存；参数变化时相关节点及下游结果会失效。

## 模拟与真实执行的边界

- 模式由 `settings.executionMode` 控制：`auto` / `mock` / `live`。
- `auto` 模式下，如果缺少对应 Key，节点使用模拟执行，节点卡片、底部状态栏、日志和结果状态都会显示模拟标识。
- 模拟图像由本地 `Canvas` 生成，带 `SIMULATION` 水印；不会伪装成真实生成。
- `live` 模式下缺少 Key 会直接失败，不静默降级。
- `KSampler` / Checkpoint 的本地执行属于教学模拟；真实 ComfyUI 采样使用「ComfyUI API 工作流」节点。

## 数据安全

- API Key 只保存在设备本地；不进入工作流 JSON，也不在导出中。
- 不将 Key 写入原生工程或源码。
- Web 端 API 密钥直连会受到 CORS 限制；建议使用 `server/` 后端代理。
- 发布生产版本时，考虑将 Key 移到服务端并加鉴权、速率限制与审计。客户端存储的 Key 始终可能被设备所有者提取。
- iOS 的 ATS 与 Android 的 cleartext 配置是为了访问局域网 ComfyUI；若不需要，可在上架前收紧。

## 测试与验证

项目当前以手动验收为主：

```bash
npm run build           # TypeScript 类型检查 + 生产构建
npm run dev             # 浏览器手动走查
npm run ios:sync        # Xcode 工程同步验证
npm run android:sync    # Android 工程同步验证
```

建议重点验证：

- 从节点库拖入/点击添加节点
- 不同类型端口无法连接、形成环会拒绝
- 删除节点后连接自动清理
- 执行、停止、失败定位、单节点运行
- 保存后刷新恢复；导出 JSON 再导入
- 移动端抽屉、底部导航和安全区
