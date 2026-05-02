# OpenClaw NetBox CLI

OpenClaw runtime plugin that wraps `nb-cli` and exposes NetBox DCIM/IPAM operations as agent-callable tools.

The plugin turns structured OpenClaw tool calls into `nb-cli` commands, requests JSON output, parses the response, and returns the result to the agent.

## What it does

- Checks NetBox CLI status and authentication.
- Discovers available NetBox resources, schemas, and field choices.
- Queries and fetches NetBox objects.
- Creates, updates, and deletes NetBox records.
- Performs bulk updates and bulk deletes.
- Sends raw HTTP-style requests through the NetBox CLI when a dedicated helper is not enough.

## Tools

All tools use the `nb_` prefix.

- Discovery: `nb_status`, `nb_resources`, `nb_schema`, `nb_choices`
- Reads: `nb_query`, `nb_get`
- Writes: `nb_create`, `nb_update`, `nb_delete`
- Bulk writes: `nb_bulk_update`, `nb_bulk_delete`
- Raw access: `nb_request`

See [SKILL.md](./SKILL.md) for examples and operational guidance.

## Requirements

Install the underlying NetBox CLI where OpenClaw can find it:

```bash
pip install nb-cli-tool
```

If the binary is not on `PATH`, set `nbcliPath` in plugin config.

## Authentication

Configuration can come from plugin config, `nb-cli` profiles, or environment variables.

Common environment variables:

```bash
export NBCLI_URL="https://netbox.example.com"
export NBCLI_TOKEN="..."
```

The underlying CLI may also recognize:

```bash
export NETBOX_URL="https://netbox.example.com"
export NETBOX_TOKEN="..."
```

Plugin config keys:

- `nbcliPath`
- `url`
- `token`
- `tokenFile`
- `profile`
- `timeout`
- `verifySsl`
- `debug`

Plugin config values take precedence when present; otherwise the CLI resolves its own environment and profile settings.

## Startup behavior

On startup, the plugin runs a status check. If `nb-cli` is missing or NetBox auth/connectivity fails, the plugin logs a warning but still loads.

## Safety

The plugin exposes write and delete tools. In production OpenClaw setups, pair it with harness guardrails and agent allowlists so only the intended NetBox worker can perform infrastructure changes.

## Development

```bash
npm run check
```

