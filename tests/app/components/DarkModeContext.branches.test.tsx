/**
 * Additional branch coverage tests for DarkModeContext
 * Targeting uncovered branches to reach 80%+ coverage
 */

import React, { useContext } from 'react';
import { render, act } from '@testing-library/react';
import { DarkModeContext, DarkModeProvider } from '../../../app/components/DarkModeContext';

describe('DarkModeContext branch coverage', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('covers stored=null else branch that sets darkMode=true', () => {
    // Ensure no stored value
    localStorage.removeItem('darkMode');

    let capturedDarkMode: boolean | null = null;
    function TestComponent() {
      const { darkMode } = useContext(DarkModeContext);
      capturedDarkMode = darkMode;
      return <div>{darkMode ? 'dark' : 'light'}</div>;
    }

    render(
      <DarkModeProvider>
        <TestComponent />
      </DarkModeProvider>
    );

    // Should default to true when no stored value
    expect(capturedDarkMode).toBe(true);
  });

  it('covers else branch in second useEffect when window is undefined', () => {
    const originalWindow = global.window;
    // @ts-expect-error - Intentionally deleting window for testing
    delete global.window;

    let capturedDarkMode: boolean | null = null;
    let capturedSetDarkMode: ((value: boolean) => void) | null = null;
    
    function TestComponent() {
      const { darkMode, setDarkMode } = useContext(DarkModeContext);
      capturedDarkMode = darkMode;
      capturedSetDarkMode = setDarkMode;
      return <div>{darkMode ? 'dark' : 'light'}</div>;
    }

    const { rerender } = render(
      <DarkModeProvider>
        <TestComponent />
      </DarkModeProvider>
    );

    // Trigger darkMode change
    act(() => {
      if (capturedSetDarkMode) {
        capturedSetDarkMode(false);
      }
    });

    rerender(
      <DarkModeProvider>
        <TestComponent />
      </DarkModeProvider>
    );

    global.window = originalWindow;
    expect(capturedDarkMode).toBe(false);
  });

  it('covers else branch that removes dark class', () => {
    localStorage.setItem('darkMode', 'true');
    document.documentElement.classList.add('dark');

    let capturedSetDarkMode: ((value: boolean) => void) | null = null;
    
    function TestComponent() {
      const { setDarkMode } = useContext(DarkModeContext);
      capturedSetDarkMode = setDarkMode;
      return null;
    }

    render(
      <DarkModeProvider>
        <TestComponent />
      </DarkModeProvider>
    );

    // Toggle to light mode
    act(() => {
      if (capturedSetDarkMode) {
        capturedSetDarkMode(false);
      }
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
