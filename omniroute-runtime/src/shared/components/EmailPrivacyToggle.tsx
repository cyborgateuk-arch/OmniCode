"use client";

import useEmailPrivacyStore from "@/store/emailPrivacyStore";
import { useTranslations } from "next-intl";

/**
 * EmailPrivacyToggle — A toggle button (eye icon) for global email visibility.
 *
 * When emails are hidden (default), displays a closed-eye icon.
 * When active, displays an open-eye icon and all masked emails become fully visible.
 *
 * Accepts an optional `size` prop: "sm" (default) for inline use, "md" for page headers.
 */
export default function EmailPrivacyToggle({ size = "sm" }: { size?: "sm" | "md" }) {
  const { emailsVisible, toggleEmailVisibility } = useEmailPrivacyStore();
  const t = useTranslations("providers");

  const iconSize = size === "md" ? "text-[20px]" : "text-[16px]";
  const padSize = size === "md" ? "p-1.5" : "p-1";

  const label = emailsVisible ? t("hideEmails") : t("showEmails");

  return (
    <button
      type="button"
      onClick={toggleEmailVisibility}
      className={`rounded ${padSize} transition-colors ${
        emailsVisible
          ? "bg-primary/15 text-primary hover:bg-primary/25"
          : "text-text-muted hover:bg-sidebar hover:text-primary"
      }`}
      title={label}
      aria-label={label}
      aria-pressed={emailsVisible}
    >
      <span className={`material-symbols-outlined ${iconSize} leading-none`}>
        {emailsVisible ? "visibility" : "visibility_off"}
      </span>
    </button>
  );
}
