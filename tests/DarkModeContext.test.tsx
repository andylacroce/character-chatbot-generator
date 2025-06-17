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
    render(
      <DarkModeProvider>
        <Consumer />
      </DarkModeProvider>
    );
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
    render(
      <DarkModeProvider>
        <Consumer />
      </DarkModeProvider>
    );
    expect(contextValue && contextValue.darkMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('darkMode')).toBe('true');
  });

  it('defaults to dark mode if localStorage is empty', () => {
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
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('darkMode')).toBe('true');
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
});
