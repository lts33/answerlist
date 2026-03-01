// @vitest-environment jsdom
import { render, fireEvent } from '@testing-library/react';
import Dashboard from './src/components/Dashboard';
import { expect, test } from 'vitest';
import React from 'react';

// Mock IntersectionObserver
class IntersectionObserverMock {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = IntersectionObserverMock;

test('Benchmark input typing 10000 times', () => {
    const user = { token: '123', name: 'Test User' };
    const { getByPlaceholderText } = render(<Dashboard user={user} logout={() => {}} />);

    const input = getByPlaceholderText('Search questions...');

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
        fireEvent.change(input, { target: { value: `test${i}` } });
    }
    const end = performance.now();

    console.log(`Typing 10000 times took ${end - start} ms`);
}, 60000);
