import { parseConfig, pluginConfigSchema } from "./lib/config.js";
import { NbCliRunner } from "./lib/runner.js";
import { registerTools } from "./lib/tools.js";

const PLUGIN_ID = "openclaw-nb-cli";

export default {
  id: PLUGIN_ID,
  name: "OpenClaw NetBox CLI",
  description:
    "Wraps the nb-cli tool to expose NetBox DCIM/IPAM operations as agent-callable tools. " +
    "Provides generic CRUD, device/interface/prefix queries, bulk operations, and raw HTTP access " +
    "against any NetBox instance. Auth via env vars (NBCLI_URL, NBCLI_TOKEN) or plugin config.",
  kind: "runtime",

  configSchema: pluginConfigSchema,

  register(api) {
    const config = parseConfig(api.pluginConfig || {});

    function logger(level, message) {
      if (!config.debug && level === "debug") return;
      const sink = api?.logger?.[level] || api?.logger?.info || console.log;
      sink.call(api?.logger || console, message);
    }

    const runner = new NbCliRunner(config);

    registerTools(api, runner);

    // On startup: verify nb-cli is reachable. Logs a warning (not a hard failure)
    // so the plugin still loads if NetBox isn't yet configured.
    api.registerService({
      id: PLUGIN_ID,
      start: async () => {
        const result = await runner.run(["status"]);
        if (result.ok) {
          const ver = result.data?.netbox?.version || result.data?.version || "unknown";
          logger("info", `${PLUGIN_ID}: connected to NetBox ${ver}`);
        } else if (result.error?.type === "NotFoundError") {
          logger("warn", `${PLUGIN_ID}: nb-cli not found at '${config.nbcliPath}' — install with: pip install nb-cli-tool`);
        } else if (result.error?.type === "AuthError" || result.error?.type === "ConnectivityError") {
          logger("warn", `${PLUGIN_ID}: NetBox unreachable (${result.error.type}) — set NBCLI_URL and NBCLI_TOKEN`);
        } else {
          logger("warn", `${PLUGIN_ID}: startup check returned [${result.error?.type}]: ${result.error?.message}`);
        }
      },
      stop: () => {}
    });

    logger("info", `${PLUGIN_ID}: registered (nbcliPath=${config.nbcliPath})`);
  }
};
