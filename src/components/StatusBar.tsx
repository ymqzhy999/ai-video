import {
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  ScrollText,
  Wifi,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { hasAgnesKey, hasDeepSeekKey } from '../lib/api';
import { formatDuration } from '../lib/format';

export function StatusBar() {
  const execution = useStudioStore((state) => state.execution);
  const settings = useStudioStore((state) => state.settings);
  const logsOpen = useStudioStore((state) => state.ui.logsOpen);
  const logTab = useStudioStore((state) => state.ui.logTab);
  const setUI = useStudioStore((state) => state.setUI);
  const saveState = useStudioStore((state) => state.saveState);

  const running = execution.status === 'running' || execution.status === 'validating';
  const statusText =
    execution.status === 'running'
      ? `执行中${execution.currentNodeLabel ? ` · ${execution.currentNodeLabel}` : ''}`
      : execution.status === 'validating'
        ? '正在检查工作流…'
        : execution.status === 'success'
          ? '执行完成'
          : execution.status === 'error'
            ? '执行失败'
            : execution.status === 'stopped'
              ? '已停止'
              : '就绪';

  const modeLabel =
    settings.executionMode === 'mock'
      ? '模拟'
      : settings.executionMode === 'live'
        ? '真实'
        : hasAgnesKey(settings) || hasDeepSeekKey(settings)
          ? '自动 · 真实可用'
          : '自动 · 模拟回退';

  const openLogs = (tab: 'logs' | 'history') => {
    setUI({ logsOpen: !logsOpen || logTab !== tab, logTab: tab });
  };

  return (
    <footer className="statusbar">
      {running ? (
        <span className="statusbar__progress" style={{ width: `${execution.progress}%` }} />
      ) : null}
      <div className="statusbar__left">
        <button
          type="button"
          className={`statusbar__engine ${running ? 'is-running' : ''} statusbar__engine--${execution.status}`}
          onClick={() => openLogs('logs')}
          title="查看执行日志"
        >
          {running ? <Loader2 size={11} className="spin" /> : <span className="statusbar__dot" />}
          {statusText}
        </button>
        {running ? (
          <span className="statusbar__progress-text">
            {execution.completed}/{execution.total || '—'}
            <b>{execution.progress}%</b>
          </span>
        ) : execution.finishedAt && execution.startedAt ? (
          <span className="statusbar__muted">
            用时 {formatDuration(execution.finishedAt - execution.startedAt)}
          </span>
        ) : null}
        {execution.status === 'success' && execution.simulatedNodes ? (
          <span className="statusbar__warn">含 {execution.simulatedNodes} 个模拟节点</span>
        ) : null}
        {execution.status === 'success' && !execution.simulatedNodes ? (
          <span className="statusbar__ok">全部真实执行</span>
        ) : null}
      </div>

      <div className="statusbar__center">
        <span className="statusbar__mode">
          <Wifi size={10} />
          {modeLabel}
        </span>
        {saveState === 'saved' ? (
          <span className="statusbar__muted">自动保存已开启</span>
        ) : saveState === 'saving' ? (
          <span className="statusbar__muted">保存中…</span>
        ) : saveState === 'dirty' ? (
          <span className="statusbar__warn">有未保存的更改</span>
        ) : (
          <span className="statusbar__danger">保存失败</span>
        )}
      </div>

      <div className="statusbar__right">
        <button
          type="button"
          className={logsOpen && logTab === 'logs' ? 'is-active' : ''}
          onClick={() => openLogs('logs')}
          title="执行日志"
        >
          <ScrollText size={12} />
          日志
          {execution.logs.length ? <em>{execution.logs.length}</em> : null}
        </button>
        <button
          type="button"
          className={logsOpen && logTab === 'history' ? 'is-active' : ''}
          onClick={() => openLogs('history')}
          title="执行历史"
        >
          <History size={12} />
          历史
          {execution.history.length ? <em>{execution.history.length}</em> : null}
        </button>
        <button
          type="button"
          className="statusbar__collapse"
          onClick={() => setUI({ logsOpen: !logsOpen })}
          title={logsOpen ? '收起日志' : '展开日志'}
          aria-label={logsOpen ? '收起日志' : '展开日志'}
        >
          {logsOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>
    </footer>
  );
}
