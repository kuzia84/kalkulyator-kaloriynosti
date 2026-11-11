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
