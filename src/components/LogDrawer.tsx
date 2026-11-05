import { useEffect, useRef } from 'react';
import {
  Check,
  ClipboardCopy,
  Clock3,
  CircleAlert,
  Eraser,
  History,
  ScrollText,
  TriangleAlert,
  X,
  XCircle,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { copyText, formatDateTime, formatDuration, formatClock } from '../lib/format';

export function LogDrawer() {
  const open = useStudioStore((state) => state.ui.logsOpen);
  const tab = useStudioStore((state) => state.ui.logTab);
  const execution = useStudioStore((state) => state.execution);
  const nodes = useStudioStore((state) => state.nodes);
  const setUI = useStudioStore((state) => state.setUI);
  const clearLogs = useStudioStore((state) => state.clearLogs);
  const clearHistory = useStudioStore((state) => state.clearExecutionHistory);
  const toast = useStudioStore((state) => state.toast);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || tab !== 'logs') return;
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [execution.logs.length, open, tab]);

  if (!open) return null;

  const nodeName = (nodeId?: string) => {
    if (!nodeId) return '';
    return nodes.find((node) => node.id === nodeId)?.data.label ?? '';
  };

  const copyLogs = async () => {
    const text = execution.logs
      .map(
        (log) =>
          `[${new Date(log.time).toISOString()}] [${log.level.toUpperCase()}]${
            log.nodeId ? ` [${nodeName(log.nodeId)}]` : ''
          } ${log.message}`,
      )
      .join('\n');
    const copied = await copyText(text);
    toast({
      type: copied ? 'success' : 'error',
      title: copied ? '日志已复制' : '复制失败',
    });
  };

  return (
    <section className={`log-drawer ${open ? 'is-open' : ''}`} aria-label="执行日志">
      <header className="log-drawer__header">
        <div className="log-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'logs'}
            className={tab === 'logs' ? 'is-active' : ''}
            onClick={() => setUI({ logTab: 'logs' })}
          >
            <ScrollText size={13} />
            执行日志
            {execution.logs.length ? <span>{execution.logs.length}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={tab === 'history' ? 'is-active' : ''}
            onClick={() => setUI({ logTab: 'history' })}
          >
            <History size={13} />
            执行历史
            {execution.history.length ? <span>{execution.history.length}</span> : null}
          </button>
        </div>
        <div className="log-drawer__actions">
          {tab === 'logs' ? (
            <>
              <button type="button" onClick={() => void copyLogs()} disabled={!execution.logs.length}>
                <ClipboardCopy size={12} />
                复制
              </button>
              <button type="button" onClick={clearLogs} disabled={!execution.logs.length}>
                <Eraser size={12} />
                清空
              </button>
            </>
          ) : (
            <button type="button" onClick={clearHistory} disabled={!execution.history.length}>
              <Eraser size={12} />
              清空历史
            </button>
          )}
          <button
            type="button"
            className="log-drawer__close"
            onClick={() => setUI({ logsOpen: false })}
            aria-label="关闭日志"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {tab === 'logs' ? (
        <div className="log-list" ref={scrollRef}>
          {execution.logs.length ? (
            execution.logs.map((log) => (
              <div key={log.id} className={`log-row log-row--${log.level}`}>
                <span className="log-row__time">{formatClock(log.time)}</span>
                <span className="log-row__level">
                  {log.level === 'error' ? (
                    <XCircle size={12} />
                  ) : log.level === 'warn' ? (
                    <TriangleAlert size={12} />
                  ) : log.level === 'success' ? (
                    <Check size={12} />
                  ) : (
                    <span className="log-row__bullet" />
                  )}
                </span>
                {log.nodeId ? (
                  <button
                    type="button"
                    className="log-row__node"
                    onClick={() => useStudioStore.getState().openNodeInspector(log.nodeId as string)}
                  >
                    {nodeName(log.nodeId) || '节点'}
                  </button>
                ) : null}
                <p>{log.message}</p>
              </div>
            ))
          ) : (
            <div className="log-empty">
              <ScrollText size={22} />
              <strong>还没有执行日志</strong>
              <p>点击顶部「执行」或运行单个节点后，这里会显示依赖分析与执行过程。</p>
            </div>
          )}
        </div>
      ) : (
        <div className="history-list">
          {execution.history.length ? (
            execution.history.map((record) => (
              <div key={record.id} className={`history-row history-row--${record.status}`}>
                <span className="history-row__icon">
                  {record.status === 'success' ? (
                    <Check size={13} />
                  ) : record.status === 'error' ? (
                    <CircleAlert size={13} />
                  ) : (
                    <Clock3 size={13} />
                  )}
                </span>
                <div className="history-row__main">
                  <strong>
                    {record.status === 'success'
                      ? '执行成功'
                      : record.status === 'error'
                        ? '执行失败'
                        : '已停止'}
                    <span className={`history-mode history-mode--${record.mode}`}>
                      {record.mode === 'mock' ? '模拟' : record.mode === 'mixed' ? '混合' : '真实'}
                    </span>
                  </strong>
                  <p>
                    {record.completed}/{record.total} 节点
                    <span>·</span>
                    {formatDateTime(record.startedAt)}
                    {record.finishedAt ? (
                      <>
                        <span>·</span>
                        用时 {formatDuration(record.finishedAt - record.startedAt)}
                      </>
                    ) : null}
                  </p>
                  {record.error ? <em>{record.error}</em> : null}
                </div>
              </div>
            ))
          ) : (
            <div className="log-empty">
              <History size={22} />
              <strong>还没有执行历史</strong>
              <p>每条执行记录会保留状态、模式、耗时和节点完成数量。</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
