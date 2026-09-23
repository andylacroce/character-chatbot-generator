import {
  useUserNameState,
  type UserNameContext,
  type UserNameStore,
  type UserProfileTransport,
} from "character-chatbot-shared";
import { getUserProfile, saveUserProfile } from "./api";
import {
  loadUserName,
  loadUserNameGateSkipped,
  saveUserName,
  saveUserNameGateSkipped,
} from "./storage";
import { useAuth } from "./AuthContext";

export type { UserNameContext } from "character-chatbot-shared";

const store: UserNameStore = {
  loadName: loadUserName,
  saveName: saveUserName,
  loadGateSkipped: loadUserNameGateSkipped,
  saveGateSkipped: saveUserNameGateSkipped,
};
const profile: UserProfileTransport = { get: getUserProfile, save: saveUserProfile };

/**
 * The mobile preferred-name hook: the same shared useUserNameState the web app uses, over
 * AsyncStorage and /api/user-profile.
 */
export function useUserName(): UserNameContext {
  const auth = useAuth();
  return useUserNameState({
    store,
    profile,
    signedIn: auth.status === "loading" ? null : auth.status === "signedIn",
    log: (event, message, error) => console.warn(`[UserName] ${event}: ${message}`, error),
  });
}
