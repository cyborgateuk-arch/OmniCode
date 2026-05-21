"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface EmailPrivacyState {
  /** When true, all email addresses are shown in full (unmasked). Default: false (masked). */
  emailsVisible: boolean;
  /** Toggle the global email visibility state. */
  toggleEmailVisibility: () => void;
}

const useEmailPrivacyStore = create<EmailPrivacyState>()(
  persist(
    (set, get) => ({
      emailsVisible: false,
      toggleEmailVisibility: () => set({ emailsVisible: !get().emailsVisible }),
    }),
    {
      name: "omniroute-email-privacy",
    }
  )
);

export default useEmailPrivacyStore;
