/**
 * Config schema and parsing for openclaw-nb-cli.
 *
 * Auth resolution order (mirrors nb-cli's own precedence):
 *   url:   config.url → NBCLI_URL env → NETBOX_URL env
 *   token: config.token → NBCLI_TOKEN env → NETBOX_TOKEN env
 *
 * The plugin does NOT override env vars if config values are absent —
 * it simply doesn't inject them, letting nb-cli pick them up natively.
 */

export const pluginConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nbcliPath: {
      type: "string",
      description: "Path to the nb-cli executable (default: 'nb-cli'). Use if it is not on PATH."
    },
    url: {
      type: "string",
      description: "NetBox base URL. Takes precedence over NBCLI_URL / NETBOX_URL env vars."
    },
    token: {
      type: "string",
      description: "NetBox API token. Takes precedence over NBCLI_TOKEN / NETBOX_TOKEN env vars."
    },
    tokenFile: {
      type: "string",
      description: "Path to a file containing the NetBox API token."
    },
    profile: {
      type: "string",
      description: "nb-cli config profile name (~/.config/nb-cli/config.toml)."
    },
    timeout: {
      type: "number",
      description: "HTTP timeout in seconds."
    },
    verifySsl: {
      type: "boolean",
      description: "Verify TLS certificates (default: true)."
    },
    debug: {
      type: "boolean",
      description: "Log every nb-cli invocation for debugging."
    }
  }
};

export function parseConfig(raw = {}) {
  return {
    nbcliPath: str(raw.nbcliPath) || "nb-cli",
    url:       str(raw.url)       || null,
    token:     str(raw.token)     || null,
    tokenFile: str(raw.tokenFile) || null,
    profile:   str(raw.profile)   || null,
    timeout:   typeof raw.timeout === "number" && raw.timeout > 0 ? raw.timeout : null,
    verifySsl: raw.verifySsl !== false,
    debug:     raw.debug === true
  };
}

function str(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
