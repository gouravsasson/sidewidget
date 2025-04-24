import { create } from "zustand";

// Define the type of the store for TypeScript (optional but recommended)
type SessionStore = {
  sessionId: string | null;
  setSessionId: (id: string) => void;
  getSessionId: () => string | null;

  callId: string | null;
  setCallId: (id: string) => void;
  getCallId: () => string | null;

  callSessionIds: string[]; // Changed from a single string to an array
  setCallSessionIds: (ids: string[]) => void;
  getCallSessionIds: () => string[];
};

const useSessionStore = create<SessionStore>((set) => ({
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),
  getSessionId: () => useSessionStore.getState().sessionId,

  callId: null,
  setCallId: (id) => set({ callId: id }),
  getCallId: () => useSessionStore.getState().callId,

  callSessionIds: [], // Now it's an array
  setCallSessionIds: (ids) => set({ callSessionIds: ids }),
  getCallSessionIds: () => useSessionStore.getState().callSessionIds,
}));

export default useSessionStore;
