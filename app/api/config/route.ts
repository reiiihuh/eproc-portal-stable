import { portalServerRuntime } from "../../konfigurasi/runtime-server";

export async function GET() {
  const runtime = portalServerRuntime();
  return Response.json({
    googleClientId: runtime.googleClientId,
    backendConfigured: Boolean(runtime.appsScriptUrl),
    environment: runtime.environment,
  });
}
