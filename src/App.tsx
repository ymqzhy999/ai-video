import { useEffect } from 'react';
import { useStudioStore } from './store/studioStore';
import { TopBar } from './components/TopBar';
import { NodeLibrary } from './components/NodeLibrary';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { StatusBar } from './components/StatusBar';
import { LogDrawer } from './components/LogDrawer';
import { MobileNav } from './components/MobileNav';
import { WorkflowManager } from './components/WorkflowManager';
import { SettingsModal } from './components/SettingsModal';
import { HelpModal } from './components/HelpModal';
import { NodeGuideModal } from './components/NodeGuideModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ImageLightbox } from './components/ImageLightbox';
import { Toasts } from './components/ui/Toasts';
import { BrandMark } from './components/BrandMark';
import { getNodeDefinition, NODE_DEFINITIONS } from './lib/nodeRegistry';
import { useAppShortcuts, useAutosaveFlush } from './hooks/useAppShortcuts';

function App() {
  const hydrated = useStudioStore((state) => state.hydrated);
  const hydrate = useStudioStore((state) => state.hydrate);
  const leftOpen = useStudioStore((state) => state.ui.leftOpen);
  const rightOpen = useStudioStore((state) => state.ui.rightOpen);
  const setUI = useStudioStore((state) => state.setUI);
  const canvasTool = useStudioStore((state) => state.ui.canvasTool);
  const theme = useStudioStore((state) => state.settings.theme);
  const openNodeGuide = useStudioStore((state) => state.openNodeGuide);

  useAppShortcuts();
  useAutosaveFlush();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && query.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      root.style.colorScheme = dark ? 'dark' : 'light';
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#090b0e' : '#f2f5f9');
    };
    apply();
    query.addEventListener?.('change', apply);
    return () => query.removeEventListener?.('change', apply);
  }, [theme]);

  useEffect(() => {
    if (!hydrated) return;
    const requestedGuide = new URLSearchParams(window.location.search).get('guide');
    if (requestedGuide && NODE_DEFINITIONS.some((item) => item.type === requestedGuide)) {
      openNodeGuide(getNodeDefinition(requestedGuide).type);
      const url = new URL(window.location.href);
      url.searchParams.delete('guide');
      window.history.replaceState({}, '', url.toString());
    }
  }, [hydrated, openNodeGuide]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 980px)').matches && canvasTool === 'select') {
      setUI({ canvasTool: 'pan' });
    }
    // Only run on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hydrated) {
    return (
      <div className="app-boot">
        <div className="app-boot__mark">
          <BrandMark size={32} />
        </div>
        <p className="eyebrow">COMFYUI STUDIO</p>
        <h1>正在恢复工作流…</h1>
        <span>读取本地节点、连接与设置</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="workspace">
        <NodeLibrary />
        <main className="canvas-column" aria-label="工作流画布">
          <Canvas />
        </main>
        <Inspector />
      </div>
      <StatusBar />
      <LogDrawer />
      <MobileNav />
      {leftOpen || rightOpen ? (
        <div
          className="drawer-backdrop"
          onClick={() => setUI({ leftOpen: false, rightOpen: false })}
          aria-hidden="true"
        />
      ) : null}
      <Toasts />
      <WorkflowManager />
      <SettingsModal />
      <HelpModal />
      <NodeGuideModal />
      <ConfirmDialog />
      <ImageLightbox />
    </div>
  );
}

export default App;
