import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { completeRedirect } from './cloud/oauth';
import { App } from './ui/App';

// Новая версия приложения удалила старые файлы, а открытая вкладка просит старый фрагмент
// (например, ZXing). Перезагрузка берёт новую версию целиком.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

// Возврат со страницы входа Google или Яндекса: токен в хеше адреса.
// Разбор идёт до роутера, иначе хеш с токеном приняли бы за адрес раздела.
completeRedirect();

const root = document.getElementById('root');
if (!root) throw new Error('Не найден элемент #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
