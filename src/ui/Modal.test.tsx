import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Modal } from './Modal';

describe('модальное окно', () => {
  it('пока окно открыто, страница под ним не прокручивается', () => {
    const { unmount } = render(
      <Modal title="Окно" onClose={() => {}}>
        <p>Текст</p>
      </Modal>,
    );
    expect(document.documentElement.style.overflow).toBe('hidden');
    unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });
});

describe('модальное окно: два окна сразу', () => {
  it('прокрутка возвращается, только когда закрыты оба окна, в любом порядке', () => {
    const a = render(
      <Modal title="А" onClose={() => {}}>
        <p>А</p>
      </Modal>,
    );
    const b = render(
      <Modal title="Б" onClose={() => {}}>
        <p>Б</p>
      </Modal>,
    );
    a.unmount();
    expect(document.documentElement.style.overflow).toBe('hidden');
    b.unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });
});
