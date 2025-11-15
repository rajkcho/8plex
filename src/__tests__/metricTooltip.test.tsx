import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';

const createFetchMock = () =>
  vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ scenarios: [] }),
    } as Response),
  );

describe('metric tooltip interactions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', createFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('question control toggles tooltip visibility on hover', async () => {
    render(<App />);

    const infoButton = await screen.findByRole('button', { name: /what is noi/i });
    const tooltip = infoButton.querySelector('[role="tooltip"]') as HTMLElement | null;
    expect(tooltip).not.toBeNull();
    if (!tooltip) {
      return;
    }

    expect(tooltip).toHaveAttribute('data-visible', 'false');

    fireEvent.pointerEnter(infoButton);
    await waitFor(() => expect(tooltip).toHaveAttribute('data-visible', 'true'));

    fireEvent.pointerLeave(infoButton);
    await waitFor(() => expect(tooltip).toHaveAttribute('data-visible', 'false'));
  });
});
