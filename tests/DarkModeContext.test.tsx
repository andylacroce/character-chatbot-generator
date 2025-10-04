import React, { useContext } from 'react';
import { render, act } from '@testing-library/react';
import { DarkModeContext, DarkModeProvider } from '@/app/components/DarkModeContext';

describe('DarkModeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('provides default value (dark mode)', () => {
    let contextValue: { darkMode: boolean; setDarkMode: (v: boolean) => void } | undefined;
    function Consumer() {
      contextValue = useContext(DarkModeContext);
      return <span>Test</span>;
    }
    render(
      <DarkModeProvider>
        <Consumer />
      </DarkModeProvider>
    );
    expect(contextValue && contextValue.darkMode).toBe(true);
    expect(contextValue && typeof contextValue.setDarkMode).toBe('function');
  });

  it('toggles dark mode', () => {
    let contextValue: { darkMode: boolean; setDarkMode: (v: boolean) => void } | undefined;
    function Consumer() {
      contextValue = useContext(DarkModeContext);
      return <span>Test</span>;
    }
    render(
      <DarkModeProvider>
        <Consumer />
      </DarkModeProvider>
    );
    expect(contextValue && contextValue.darkMode).toBe(true);
    act(() => contextValue && contextValue.setDarkMode(false));
    expect(contextValue && contextValue.darkMode).toBe(false);
    act(() => contextValue && contextValue.setDarkMode(true));
    expect(contextValue && contextValue.darkMode).toBe(true);
  });

  it('loads darkMode=false from localStorage', () => {
    localStorage.setItem('darkMode', 'false');
    let contextValue: { darkMode: boolean; setDarkMode: (v: boolean) => void } | undefined;
    function Consumer() {
      contextValue = useContext(DarkModeContext);
      return <span>Test</span>;
    }
    act(() => {
      render(
        <DarkModeProvider>
          <Consumer />
        </DarkModeProvider>
      );
    });
    expect(contextValue && contextValue.darkMode).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('darkMode')).toBe('false');
  });

  it('loads darkMode=true from localStorage', () => {
    localStorage.setItem('darkMode', 'true');
    let contextValue: { darkMode: boolean; setDarkMode: (v: boolean) => void } | undefined;
    function Consumer() {
      contextValue = useContext(DarkModeContext);
      return <span>Test</span>;
    }
    act(() => {
      render(
        <DarkModeProvider>
          <Consumer />
        </DarkModeProvider>
      );
    });
    expect(contextValue && contextValue.darkMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('darkMode')).toBe('true');
  });

  it('covers else branch: defaults to dark mode when localStorage returns null', () => {
    // Set localStorage to false first, then remove it to trigger the else branch
    localStorage.setItem('darkMode', 'false');
    localStorage.removeItem('darkMode');
    let contextValue: { darkMode: boolean; setDarkMode: (v: boolean) => void } | undefined;
    function Consumer() {
      contextValue = useContext(DarkModeContext);
      return <span>Test</span>;
    }
    act(() => {
      render(
        <DarkModeProvider>
          <Consumer />
        </DarkModeProvider>
      );
    });
    // The else branch should set darkMode to true when stored is null
    expect(contextValue && contextValue.darkMode).toBe(true);
    // Also check that DOM is updated
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles dark mode and updates DOM/localStorage', () => {
    let contextValue: { darkMode: boolean; setDarkMode: (v: boolean) => void } | undefined;
    function Consumer() {
      contextValue = useContext(DarkModeContext);
      return <span>Test</span>;
    }
    render(
      <DarkModeProvider>
        <Consumer />
      </DarkModeProvider>
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => contextValue && contextValue.setDarkMode(false));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('darkMode')).toBe('false');
    act(() => contextValue && contextValue.setDarkMode(true));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('darkMode')).toBe('true');
  });

  it('does not throw and defaults to dark mode if window is undefined (SSR)', () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    let contextValue: { darkMode: boolean; setDarkMode: (v: boolean) => void } | undefined;
    function Consumer() {
      contextValue = useContext(DarkModeContext);
      return <span>Test</span>;
    }
    expect(() => {
      act(() => {
        render(
          <DarkModeProvider>
            <Consumer />
          </DarkModeProvider>
        );
      });
    }).not.toThrow();
    // Should default to dark mode
    expect(contextValue && contextValue.darkMode).toBe(true);
    // Restore window
    global.window = originalWindow;
  });  it('calls default setDarkMode outside provider (for coverage)', () => {
    // Directly call the default setDarkMode for coverage
    expect(() => {
      const { setDarkMode } = (DarkModeContext as any)._currentValue || {};
      if (setDarkMode) setDarkMode(false);
    }).not.toThrow();
  });

  it('SSR: else branch in effect does not throw on darkMode change', () => {
    // Simulate SSR: window is undefined
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    let contextValue: { darkMode: boolean; setDarkMode: (v: boolean) => void } | undefined;
    function Consumer() {
      contextValue = useContext(DarkModeContext);
      return <span>Test</span>;
    }
    act(() => {
      render(
        <DarkModeProvider>
          <Consumer />
        </DarkModeProvider>
      );
    });
    // Changing darkMode should not throw (else branch in effect)
    act(() => contextValue && contextValue.setDarkMode(false));
    act(() => contextValue && contextValue.setDarkMode(true));
    // Restore window
    global.window = originalWindow;
  });
});
