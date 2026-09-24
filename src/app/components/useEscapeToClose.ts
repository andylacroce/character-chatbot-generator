import { useEffect } from "react";

/**
 * Closes a modal/lightbox on Escape while it's shown. Shared by every modal
 * that uses BotCreator.module.css's disclaimer-style shell (SignInModal,
 * DisclaimerModal, CharacterInfoModal) so they can't drift out of sync on
 * this behavior the way DisclaimerModal/CharacterInfoModal previously did.
 */
export function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [active, onClose]);
}
