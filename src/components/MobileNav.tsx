import { Blocks, MoreHorizontal, Play, ScrollText, SlidersHorizontal, Square } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export function MobileNav() {
  const ui = useStudioStore((state) => state.ui);
  const setUI = useStudioStore((state) => state.setUI);
  const execution = useStudioStore((state) => state.execution);
  const runAll = useStudioStore((state) => state.runAll);
  const stopRun = useStudioStore((state) => state.stopRun);
  const running = execution.status === 'running' || execution.status === 'validating';

  return (
    <nav className="mobile-nav" aria-label="移动端导航">
      <button
        type="button"
        className={ui.leftOpen ? 'is-active' : ''}
        onClick={() => setUI({ leftOpen: !ui.leftOpen, rightOpen: false })}
      >
        <Blocks size={19} />
        <span>节点</span>
      </button>
      <button
        type="button"
        className={ui.rightOpen ? 'is-active' : ''}
        onClick={() => setUI({ rightOpen: !ui.rightOpen, leftOpen: false })}
      >
        <SlidersHorizontal size={19} />
        <span>属性</span>
      </button>
      <button
        type="button"
        className={`mobile-nav__run ${running ? 'is-running' : ''}`}
        onClick={() => {
          if (running) stopRun();
          else void runAll();
        }}
        disabled={execution.stopping}
        aria-label={running ? '停止执行' : '执行工作流'}
      >
        <span className="mobile-nav__run-circle">
          {running ? <Square size={15} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </span>
        <span>{running ? `${execution.progress}%` : '执行'}</span>
      </button>
      <button
        type="button"
        className={ui.logsOpen ? 'is-active' : ''}
        onClick={() => setUI({ logsOpen: !ui.logsOpen, logTab: 'logs' })}
      >
        <ScrollText size={19} />
        <span>日志</span>
      </button>
      <button
        type="button"
        onClick={() => setUI({ mobileMenuOpen: true })}
      >
        <MoreHorizontal size={19} />
        <span>更多</span>
      </button>
    </nav>
  );
}
