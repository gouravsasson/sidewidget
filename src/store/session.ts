import { create } from "zustand";

// Zustand store for sessionId
const useSessionStore = create((set) => ({
  sessionId: null, // Initial value of sessionId
  setSessionId: (id) => set({ sessionId: id }), // Function to set the sessionId
  getSessionId: () => {
    // Getter function to retrieve the sessionId
    const state = useSessionStore.getState();
    return state.sessionId;
  },
  callId:null,
  callSessionId:null,
  setCallId:(id:string)=>set({callId:id}),
  setCallSessionId:(id:string)=>set({callSessionId:id}),
  getCallId: () => {
    const state = useSessionStore.getState();
    return state.callId;
  },
  getCallSessionId: () => {
    const state = useSessionStore.getState();
    return state.callSessionId;
  }
}));

export default useSessionStore;
