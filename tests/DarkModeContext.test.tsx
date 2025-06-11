import React, { useContext } from 'react';
import { render, act } from '@testing-library/react';
import { DarkModeContext, DarkModeProvider } from '@/app/components/DarkModeContext';

describe('DarkModeContext', () => {
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
});
