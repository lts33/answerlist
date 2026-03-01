// @vitest-environment jsdom
import { render, fireEvent } from '@testing-library/react';
import Dashboard from './Dashboard';
import React from 'react';
import { expect, test, vi, describe } from 'vitest';

// Mock axios
vi.mock('axios', () => ({
    default: {
        get: vi.fn(() => Promise.resolve({ data: [] })),
        post: vi.fn(() => Promise.resolve({ data: {} })),
    },
}));

// Mock IntersectionObserver
window.IntersectionObserver = vi.fn().mockImplementation(function() {
    this.observe = vi.fn();
    this.unobserve = vi.fn();
    this.disconnect = vi.fn();
});

// Helper to access internal React props (fiber)
function getReactProps(element) {
    const key = Object.keys(element).find(key => key.startsWith('__reactProps$'));
    return key ? element[key] : null;
}

describe('Dashboard Performance', () => {
    const user = { name: 'Test User', token: 'test-token' };
    const logout = vi.fn();

    test('Event handlers should be memoized', () => {
        const { getByPlaceholderText, getByText } = render(
            <Dashboard user={user} logout={logout} />
        );

        const searchInput = getByPlaceholderText('Search questions...');
        const addQuestionInput = getByPlaceholderText("What's the question?");

        // Find the form. The button says "Add to Database"
        const addButton = getByText(/Add to Database/i);
        const form = addButton.closest('form');

        // Capture initial handlers
        const initialSearchProps = getReactProps(searchInput);
        const initialFormProps = getReactProps(form);

        const initialOnKeyDown = initialSearchProps.onKeyDown;
        const initialOnSubmit = initialFormProps.onSubmit;

        // 1. Type in Search Input -> Updates `query` state
        fireEvent.change(searchInput, { target: { value: 'test' } });

        // Capture handlers after search update
        const searchUpdateSearchProps = getReactProps(searchInput);
        const searchUpdateFormProps = getReactProps(form);

        const searchUpdateOnKeyDown = searchUpdateSearchProps.onKeyDown;
        const searchUpdateOnSubmit = searchUpdateFormProps.onSubmit;

        // Verify Step 1:
        // handleSearch STABLE (Optimization Success!)
        expect(initialOnKeyDown).toBe(searchUpdateOnKeyDown);
        // handleAdd STABLE (Optimization Success!)
        expect(initialOnSubmit).toBe(searchUpdateOnSubmit);

        console.log('--- Check: Updating Search Input ---');
        console.log('handleSearch changed:', initialOnKeyDown !== searchUpdateOnKeyDown, '(Expected: false)');
        console.log('handleAdd changed:', initialOnSubmit !== searchUpdateOnSubmit, '(Expected: false)');

        // 2. Type in Add Question Input -> Updates `question` state
        fireEvent.change(addQuestionInput, { target: { value: 'New Question' } });

        const addUpdateSearchProps = getReactProps(searchInput);
        const addUpdateFormProps = getReactProps(form);

        const addUpdateOnKeyDown = addUpdateSearchProps.onKeyDown;
        const addUpdateOnSubmit = addUpdateFormProps.onSubmit;

        // Verify Step 2:
        // handleSearch STABLE (Optimization Success!)
        expect(searchUpdateOnKeyDown).toBe(addUpdateOnKeyDown);
        // handleAdd changed (expected, depends on question)
        expect(searchUpdateOnSubmit).not.toBe(addUpdateOnSubmit);

        console.log('--- Check: Updating Question Input ---');
        console.log('handleSearch changed:', searchUpdateOnKeyDown !== addUpdateOnKeyDown, '(Expected: false)');
        console.log('handleAdd changed:', searchUpdateOnSubmit !== addUpdateOnSubmit, '(Expected: true)');
    });
});
