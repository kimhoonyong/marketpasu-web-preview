// Firebase Web App browser configuration for the SEPARATE trial project ONLY.
// Public web SDK identifiers are not admin credentials. Never include tokens,
// service accounts, member UIDs, personal records or production Firebase IDs.
export const trialConfig = Object.freeze({
  enabled: true,
  projectType: "ISOLATED_TRIAL_NO_PRODUCTION",
  collection: "trialNews",
  maxDocs: 10,
  maxSessionQueries: 1,
  firebase: Object.freeze({
    apiKey: "AIzaSyAsZTukhl4kefsJZ4rTqDD22YEjcLmLPyo",
    authDomain: "marketpasu-auth-trial.firebaseapp.com",
    projectId: "marketpasu-auth-trial",
    appId: "1:134094127878:web:dc6b26b5bd282afd5a9487"
  })
});
