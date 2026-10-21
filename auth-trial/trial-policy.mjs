/*
  Trial-only policy: no Firebase imports, credentials, or environment writes.
  Client gates are UX safety limits; Firestore Security Rules are the authority.
*/
export const MAX_QUERY_DOCS = 10;
export const MAX_SESSION_QUERIES = 1;
export const TRIAL_COLLECTION = "trialNews";
export const TRIAL_PROJECT_PATTERN = /^marketpasu-[a-z0-9-]*trial[a-z0-9-]*$/;

export function validateTrialConfig(config, hostname) {
  if (!config || config.enabled !== true) return "HOLD_TRIAL_CONFIG_DISABLED";
  if (!["localhost","127.0.0.1","kimhoonyong.github.io"].includes(hostname))
    return "HOLD_UNEXPECTED_WEB_HOST";
  const firebase = config.firebase;
  if (!firebase || typeof firebase !== "object") return "HOLD_FIREBASE_CONFIG_MISSING";
  if (!TRIAL_PROJECT_PATTERN.test(firebase.projectId || ""))
    return "HOLD_NOT_A_SEPARATE_TRIAL_PROJECT";
  if (firebase.authDomain !== firebase.projectId + ".firebaseapp.com")
    return "HOLD_AUTH_DOMAIN_PROJECT_MISMATCH";
  if (!/^AIza[A-Za-z0-9_-]{30,}$/.test(firebase.apiKey || ""))
    return "HOLD_TRIAL_WEB_API_KEY_MISSING";
  if (!/^1:[0-9]+:web:[A-Za-z0-9]+$/.test(firebase.appId || ""))
    return "HOLD_TRIAL_WEB_APP_ID_MISSING";
  if (config.collection !== TRIAL_COLLECTION)
    return "HOLD_UNEXPECTED_COLLECTION";
  if (config.projectType !== "ISOLATED_TRIAL_NO_PRODUCTION")
    return "HOLD_NOT_EXPLICITLY_ISOLATED";
  if (config.maxDocs !== MAX_QUERY_DOCS || config.maxSessionQueries !== MAX_SESSION_QUERIES)
    return "HOLD_BOUNDED_READ_SETTINGS_MISMATCH";
  return "READY_FOR_USER_APPROVED_TRIAL_ONLY";
}

export function createSessionLimiter() {
  let used = 0;
  return Object.freeze({
    canRead() { return used < MAX_SESSION_QUERIES; },
    reserve() {
      if (used >= MAX_SESSION_QUERIES) return false;
      used++;
      return true;
    },
    count() { return used; }
  });
}

export function safeDisplayText(value, max = 160) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0, max);
}
