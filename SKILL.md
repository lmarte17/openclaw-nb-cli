# nb-cli Skill

Wraps [nb-cli](https://github.com/lmarte17/nb-cli) — a typed CLI tool for NetBox — as agent-callable tools.

All tools use the `nb_` prefix. Auth is resolved from env vars (`NBCLI_URL`, `NBCLI_TOKEN`) or plugin config. Output is always parsed JSON.

---

## Authentication

The plugin injects credentials into every subprocess call. Resolution order:

| Credential | Plugin config key | Env var fallback |
|------------|-------------------|-----------------|
| NetBox URL | `url` | `NBCLI_URL` → `NETBOX_URL` |
| API token  | `token` | `NBCLI_TOKEN` → `NETBOX_TOKEN` |

You can also set `profile` to use a named profile from `~/.config/nb-cli/config.toml`, or `tokenFile` to read the token from a file.

If auth is missing, `nb_status` will return an `AuthError` or `ConnectivityError` — diagnose before attempting data operations.

---

## Startup check

On plugin load, `nb_status` is called automatically. If NetBox isn't reachable the plugin still loads, but all data tools will fail until auth/connectivity is fixed.

---

## Tool reference

### Discovery

#### `nb_status`
Check NetBox connectivity. Call this first to confirm the connection is healthy.

```json
{}
```

---

#### `nb_resources`
List all available resource types (endpoint names). Use to discover valid identifiers for other tools.

```json
{ "search": "device" }
```

Returns a list of resource identifiers like `dcim.devices`, `ipam.prefixes`, `dcim.interfaces`.

---

#### `nb_schema`
Inspect the field schema for a resource. Call before `nb_create` or `nb_update` to confirm required fields and types.

```json
{ "resource": "dcim.devices" }
```

---

#### `nb_choices`
Return valid enum values for a resource's choice fields (status, type, etc.). Call before setting any enum field to avoid validation errors.

```json
{ "resource": "dcim.interfaces" }
```

---

### CRUD

#### `nb_query`
List and filter objects. This is the primary tool for data discovery.

```json
{
  "resource": "dcim.devices",
  "filters": { "site__name": "ny01", "status": "active" },
  "limit": 50
}
```

**Key options:**

| Option | Type | Purpose |
|--------|------|---------|
| `filters` | object | Django ORM-style key=value pairs. Supports lookups like `site__name`, `tenant__slug`, `role__slug` |
| `search` | string | Full-text search across the resource |
| `all` | boolean | Fetch all pages (no limit). Use with care on large datasets |
| `brief` | boolean | Return `id`, `name`, `url` only — faster for existence checks |
| `count` | boolean | Return the count only (integer), no object data |
| `ordering` | string | Sort field, prefix `-` for descending (e.g. `"-last_updated"`) |
| `fields` | array | Whitelist of fields to include in each object |
| `limit` / `offset` | number | Standard pagination |

---

#### `nb_get`
Fetch a single object by ID or by unique field lookup.

```json
{ "resource": "dcim.devices", "lookup": { "name": "spine-01" } }
```

```json
{ "resource": "dcim.devices", "id": 42 }
```

Fails with `NotFoundError` if the object doesn't exist, or if the lookup matches multiple objects.

---

#### `nb_create`
Create one or more objects. Check `nb_schema` first to confirm required fields.

```json
{
  "resource": "dcim.devices",
  "data": {
    "name": "leaf-03",
    "device_type": 5,
    "site": 2,
    "status": "planned"
  }
}
```

Supports `dry_run: true` to preview without committing. Pass an array to `data` for bulk creation.

---

#### `nb_update`
Patch an existing object. Only provided fields are changed.

```json
{
  "resource": "dcim.devices",
  "lookup": { "name": "leaf-03" },
  "data": { "status": "active" }
}
```

Supports `dry_run: true`. Always use `dry_run` first when the impact is unclear.

---

#### `nb_delete`
Delete an object by ID or lookup.

```json
{
  "resource": "dcim.devices",
  "lookup": { "name": "leaf-03" },
  "dry_run": true
}
```

Always use `dry_run: true` first to confirm the right object is targeted.

---

### Bulk operations

#### `nb_bulk_update`
PATCH multiple objects in one API call. Each object in `data` must include `id`.

```json
{
  "resource": "dcim.interfaces",
  "data": [
    { "id": 101, "description": "uplink to spine-01" },
    { "id": 102, "description": "uplink to spine-02" }
  ]
}
```

---

#### `nb_bulk_delete`
Delete multiple objects by numeric ID.

```json
{
  "resource": "dcim.interfaces",
  "ids": [101, 102, 103]
}
```

---

### Raw HTTP

#### `nb_request`
Send a raw HTTP request to any NetBox API path. Use for endpoints not covered by the typed tools, or for operations that need precise URL control.

```json
{
  "method": "GET",
  "path": "/api/dcim/devices/",
  "query": { "site": "ny01", "limit": "10" }
}
```

```json
{
  "method": "POST",
  "path": "/api/ipam/prefixes/42/available-ips/",
  "data": { "count": 1, "description": "loopback alloc" }
}
```

---

## Common workflows

### Discover what's available

```
1. nb_status          → confirm connectivity
2. nb_resources       → find resource names
3. nb_schema          → understand required fields for a target resource
4. nb_choices         → get valid enum values before querying/creating
```

### Augmentation analysis (typical NetBox agent pattern)

```
1. nb_query  dcim.devices   filters={site__name: X}           → get device list
2. nb_query  dcim.interfaces filters={device__name: <device>} → get interfaces per device
3. nb_get    dcim.devices   lookup={name: <device>}           → full device detail
4. nb_query  ipam.prefixes  filters={site__name: X, status: active} → IP space context
```

### Safe mutation pattern

```
1. nb_get    → confirm the object exists and read its current state
2. nb_update dry_run:true → preview the change
3. nb_update              → commit only after dry_run looks correct
```

---

## Resource naming

Resources use dot notation: `<app>.<model>`. Common resources:

| Domain | Resources |
|--------|-----------|
| DCIM   | `dcim.devices`, `dcim.interfaces`, `dcim.cables`, `dcim.sites`, `dcim.racks`, `dcim.device-types`, `dcim.platforms` |
| IPAM   | `ipam.prefixes`, `ipam.ip-addresses`, `ipam.vlans`, `ipam.vrfs`, `ipam.rirs` |
| Tenancy | `tenancy.tenants`, `tenancy.contacts` |
| Circuits | `circuits.circuits`, `circuits.providers` |
| Virtualization | `virtualization.virtual-machines`, `virtualization.clusters` |

Use `nb_resources` to get the full list, or `nb_resources search="keyword"` to narrow it.

---

## Error types

| Type | Exit code | Meaning |
|------|-----------|---------|
| `AuthError` | 3 | Missing or invalid token |
| `NotFoundError` | 4 | Object or nb-cli binary not found |
| `ValidationError` | 5 | Field value failed NetBox schema validation |
| `APIError` | 6 | NetBox returned an unexpected HTTP error |
| `ConnectivityError` | 7 | Can't reach NetBox (DNS, TLS, timeout) |
| `UsageError` | 2 | Bad arguments passed to nb-cli |

On error, the tool returns `{ error: { type, code, message } }` in `details`. Always check `result.error.type` to decide whether to retry, surface to user, or route to a different path.

---

## Tips

- Use `brief: true` for existence checks — much faster, smaller context.
- Use `count: true` to check scale before fetching all objects.
- Django ORM lookups (`site__name`, `device__name`, `tenant__slug`) avoid needing to resolve IDs first.
- When a `ValidationError` occurs, call `nb_schema` and `nb_choices` to find the correct value.
- For IP allocation and prefix operations not covered by CRUD, use `nb_request` against the appropriate `/available-ips/` or `/available-prefixes/` sub-paths.
