import { UltravoxSession } from "ultravox-client";
import { create } from "zustand";

interface UltravoxStore {
  session: UltravoxSession | null;
  status: string;
  transcripts: string[] | null; // Adjust the type if needed
  isListening: boolean;
  setSession: (session: UltravoxSession) => void;
  setStatus: (status: string) => void;
  setTranscripts: (transcripts: string[] | null) => void;
  setIsListening: (isListening: boolean) => void;
}

export const useUltravoxStore = create<UltravoxStore>((set) => ({
  session: null,
  status: "disconnected", // initial status value
  transcripts: null, // initial transcripts value
  isListening: false, // initial isListening state
  setSession: (session: UltravoxSession) => set({ session }),
  setStatus: (status: string) => set({ status }),
  setTranscripts: (transcripts: string[] | null) => set({ transcripts }),
  setIsListening: (isListening: boolean) => set({ isListening }),
}));
