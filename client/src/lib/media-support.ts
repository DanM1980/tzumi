export function isSecureMediaContext(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext;
}

export function canUseMicrophone(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function getMicrophoneBlockReason(): string | null {
  if (!isSecureMediaContext()) {
    return (
      "הדפדפן חוסם מיקרופון בחיבור לא מאובטח (HTTP). " +
      "פתח/י את האתר דרך HTTPS — למשל https://כתובת-ה-IP:3000"
    );
  }
  if (!canUseMicrophone()) {
    return "הדפדפן שלך לא תומך בגישה למיקרופון.";
  }
  return null;
}
