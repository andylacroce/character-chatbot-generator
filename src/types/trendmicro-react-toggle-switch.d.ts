// =============================
// trendmicro-react-toggle-switch.d.ts
// TypeScript type declarations for the @trendmicro/react-toggle-switch library.
// Used for type safety when using the toggle switch component.
// =============================

/**
 * @fileoverview Type definitions for the @trendmicro/react-toggle-switch component.
 * @module trendmicro-react-toggle-switch
 */

declare module "@trendmicro/react-toggle-switch" {
  import { FC } from "react";

  /**
   * Interface defining the props for the ToggleSwitch component.
   * @interface ToggleSwitchProps
   * @property {boolean} checked - Whether the toggle switch is in the checked/on state
   * @property {Function} onChange - Callback function triggered when the switch state changes
   * @property {boolean} [disabled] - Optional flag to disable the toggle switch
   * @property {string} [className] - Optional CSS class name for custom styling
   */
  export interface ToggleSwitchProps {
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
    className?: string;
  }

  /**
   * ToggleSwitch component that provides a visual toggle switch UI element.
   * Used in the application for toggling audio playback on/off.
   *
   * @component
   * @type {FC<ToggleSwitchProps>}
   */
  const ToggleSwitch: FC<ToggleSwitchProps>;
  export default ToggleSwitch;
}
