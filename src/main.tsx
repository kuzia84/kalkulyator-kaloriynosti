import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

// Новая версия приложения удалила старые файлы, а открытая вкладка просит старый фрагмент
// (например, ZXing). Перезагрузка берёт новую версию целиком.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

const root = document.getElementById('root');
if (!root) throw new Error('Не найден элемент #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
