import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { DarkModeContext } from "@/app/components/DarkModeContext";
import DarkModeToggle from "@/app/components/DarkModeToggle";

describe("DarkModeToggle", () => {
  it("toggles from dark to light mode and back, shows correct icon and label", () => {
    const setDarkMode = jest.fn();
    const { getByRole, getByText, rerender } = render(
      <DarkModeContext.Provider value={{ darkMode: true, setDarkMode }}>
        <DarkModeToggle />
      </DarkModeContext.Provider>
    );
    // Should show sun icon and label 'Light' in dark mode
    expect(getByRole("button")).toHaveAttribute("aria-label", "Switch to light mode");
    expect(getByText("Light")).toBeInTheDocument();
    fireEvent.click(getByRole("button"));
    expect(setDarkMode).toHaveBeenCalledWith(false);

    // Now rerender in light mode
    rerender(
      <DarkModeContext.Provider value={{ darkMode: false, setDarkMode }}>
        <DarkModeToggle />
      </DarkModeContext.Provider>
    );
    expect(getByRole("button")).toHaveAttribute("aria-label", "Switch to dark mode");
    expect(getByText("Dark")).toBeInTheDocument();
    fireEvent.click(getByRole("button"));
    expect(setDarkMode).toHaveBeenCalledWith(true);
  });

  it("hides label when hideLabel is true", () => {
    const setDarkMode = jest.fn();
    const { queryByText } = render(
      <DarkModeContext.Provider value={{ darkMode: true, setDarkMode }}>
        <DarkModeToggle hideLabel />
      </DarkModeContext.Provider>
    );
    expect(queryByText("Light")).not.toBeInTheDocument();
    expect(queryByText("Dark")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const setDarkMode = jest.fn();
    const { getByRole } = render(
      <DarkModeContext.Provider value={{ darkMode: false, setDarkMode }}>
        <DarkModeToggle className="custom-class" />
      </DarkModeContext.Provider>
    );
    expect(getByRole("button").className).toMatch(/custom-class/);
  });
});
