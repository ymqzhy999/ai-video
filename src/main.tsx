import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles/index.css';
import App from './App';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ComfyUI Studio crashed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal-error">
          <p className="eyebrow">RENDER ERROR</p>
          <h1>界面遇到了问题</h1>
          <p>{this.state.error.message}</p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            重新载入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
