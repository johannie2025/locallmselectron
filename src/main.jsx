import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { I18nProvider } from './i18n/index.jsx';
import { BrandProvider } from './brand/BrandProvider.jsx';
import { UiProvider } from './components/ui.jsx';
import './index.css';

// Kiosque : pas de menu contextuel ni de glisser-déposer
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="h-full grid place-items-center p-8"><div className="card max-w-md text-center space-y-3"><div className="text-3xl">⚠️</div><p>{String(this.state.err.message || this.state.err)}</p><button className="btn-primary" onClick={() => location.reload()}>Reload</button></div></div>;
  }
}

createRoot(document.getElementById('root')).render(
  <Boundary>
    <I18nProvider>
      <BrandProvider>
        <UiProvider>
          <App />
        </UiProvider>
      </BrandProvider>
    </I18nProvider>
  </Boundary>
);
