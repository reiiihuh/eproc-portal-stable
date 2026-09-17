export async function GET() {
  return Response.json({ googleClientId: process.env.GOOGLE_CLIENT_ID ?? "", backendConfigured: Boolean(process.env.APPS_SCRIPT_URL), environment: process.env.PORTAL_ENVIRONMENT ?? "development" });
}
