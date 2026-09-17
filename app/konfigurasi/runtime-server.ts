const DEFAULT_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyO9M05UfBQEPzz5yL-0Y2V6IkTRCIe0XuLlvTqzDNIh7-qsOidGqxap2a60JXWWw2iNQ/exec";

const DEFAULT_GOOGLE_CLIENT_ID =
  "19043389330-43lb36q9aa54oiju0pnedhsgrap30292.apps.googleusercontent.com";

function configuredValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function portalServerRuntime() {
  return {
    appsScriptUrl: configuredValue(process.env.APPS_SCRIPT_URL, DEFAULT_APPS_SCRIPT_URL),
    googleClientId: configuredValue(process.env.GOOGLE_CLIENT_ID, DEFAULT_GOOGLE_CLIENT_ID),
    environment: configuredValue(
      process.env.PORTAL_ENVIRONMENT,
      process.env.VERCEL ? "production" : "development",
    ),
  };
}
