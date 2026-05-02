import { spawn } from "node:child_process";

// nb-cli exit code → error type mapping (from nb-cli docs)
const EXIT_CODES = {
  2: "UsageError",
  3: "AuthError",
  4: "NotFoundError",
  5: "ValidationError",
  6: "APIError",
  7: "ConnectivityError",
  8: "NBCLIError"
};

export class NbCliRunner {
  constructor(config) {
    this.nbcliPath = config.nbcliPath || "nb-cli";
    this.url       = config.url       || null;
    this.token     = config.token     || null;
    this.tokenFile = config.tokenFile || null;
    this.profile   = config.profile   || null;
    this.timeout   = config.timeout   || null;
    this.verifySsl = config.verifySsl;
    this.debug     = config.debug === true;
  }

  /**
   * Build environment for the subprocess.
   * Only injects NBCLI_URL / NBCLI_TOKEN when explicitly configured —
   * if not set, nb-cli will pick up its own env vars naturally.
   */
  _buildEnv() {
    const env = { ...process.env };
    if (this.url)   env.NBCLI_URL   = this.url;
    if (this.token) env.NBCLI_TOKEN = this.token;
    return env;
  }

  /**
   * Global flags that precede every subcommand.
   * --format json is always set so we get machine-parseable output.
   */
  _buildGlobalArgs() {
    const args = ["--format", "json"];
    if (this.profile)           args.push("--profile",    this.profile);
    if (this.tokenFile)         args.push("--token-file", this.tokenFile);
    if (this.timeout != null)   args.push("--timeout",    String(this.timeout));
    if (this.verifySsl === false) args.push("--verify-ssl", "false");
    return args;
  }

  /**
   * Run a nb-cli command.
   *
   * @param {string[]} cmdArgs  - subcommand + its own args, e.g. ["query", "dcim.devices", "--limit", "10"]
   * @returns {{ ok: boolean, data?: any, stderr?: string, error?: { type, code, message } }}
   */
  async run(cmdArgs) {
    const allArgs = [...this._buildGlobalArgs(), ...cmdArgs];
    const env = this._buildEnv();

    if (this.debug) {
      console.log(`[openclaw-nb-cli] exec: ${this.nbcliPath} ${allArgs.map(a => JSON.stringify(a)).join(" ")}`);
    }

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";

      const proc = spawn(this.nbcliPath, allArgs, {
        env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      proc.stdout.on("data", chunk => { stdout += chunk; });
      proc.stderr.on("data", chunk => { stderr += chunk; });

      proc.on("error", err => {
        if (err.code === "ENOENT") {
          resolve({
            ok: false,
            error: {
              type: "NotFoundError",
              code: -1,
              message: `nb-cli not found at '${this.nbcliPath}'. Install with: pip install nb-cli-tool`
            }
          });
        } else {
          resolve({ ok: false, error: { type: "SpawnError", code: -1, message: err.message } });
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          const raw = stdout.trim();
          let data;
          try {
            data = JSON.parse(raw || "null");
          } catch {
            data = raw;
          }
          resolve({ ok: true, data, stderr: stderr.trim() || null });
        } else {
          const errType = EXIT_CODES[code] || "UnknownError";
          const message = stderr.trim() || stdout.trim() || `nb-cli exited with code ${code}`;
          resolve({ ok: false, error: { type: errType, code, message } });
        }
      });
    });
  }
}
