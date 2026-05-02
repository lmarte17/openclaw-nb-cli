/**
 * Registers all nb_* tools against the OpenClaw plugin API.
 *
 * Tool inventory (12 total):
 *   Discovery : nb_status, nb_resources, nb_schema, nb_choices
 *   CRUD      : nb_query, nb_get, nb_create, nb_update, nb_delete
 *   Bulk      : nb_bulk_update, nb_bulk_delete
 *   Raw       : nb_request
 */

function textResult(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}

function errResult(label, error) {
  return textResult(`${label}: [${error.type}] ${error.message}`, { error });
}

/**
 * Expand a filters object {key: value} into repeated --filter key=value args.
 */
function filterArgs(filters) {
  if (!filters || typeof filters !== "object") return [];
  return Object.entries(filters).flatMap(([k, v]) => ["--filter", `${k}=${v}`]);
}

/**
 * Expand a lookup object {key: value} into repeated --lookup key=value args.
 */
function lookupArgs(lookup) {
  if (!lookup || typeof lookup !== "object") return [];
  return Object.entries(lookup).flatMap(([k, v]) => ["--lookup", `${k}=${v}`]);
}

export function registerTools(api, runner) {

  // ─── Status & discovery ──────────────────────────────────────────────────

  api.registerTool({
    name: "nb_status",
    label: "NetBox Status",
    description: "Check NetBox API connectivity and return system status information (version, Python, plugins, etc.).",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async execute() {
      const result = await runner.run(["status"]);
      if (!result.ok) return errResult("NetBox unreachable", result.error);
      return textResult("NetBox is reachable", { status: result.data });
    }
  }, { name: "nb_status" });

  api.registerTool({
    name: "nb_resources",
    label: "NetBox Resources",
    description: "List all available NetBox resource types (API endpoints). Use to discover valid resource identifiers for other nb_* tools. Optionally filter by partial name.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        search: { type: "string", description: "Filter resource names by partial match (e.g. 'device', 'prefix')" }
      }
    },
    async execute(_id, params) {
      const args = ["resources"];
      if (params.search) args.push("--search", params.search);
      const result = await runner.run(args);
      if (!result.ok) return errResult("Failed to list resources", result.error);
      const count = Array.isArray(result.data) ? result.data.length : "?";
      return textResult(`${count} resource type(s) available`, { resources: result.data });
    }
  }, { name: "nb_resources" });

  api.registerTool({
    name: "nb_schema",
    label: "NetBox Resource Schema",
    description: "Inspect the field schema for a NetBox resource type. Returns field names, types, required flags, and constraints. Use before create/update to understand required fields.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resource"],
      properties: {
        resource: { type: "string", description: "Resource identifier, e.g. 'dcim.devices', 'ipam.prefixes', 'dcim.interfaces'" }
      }
    },
    async execute(_id, params) {
      const result = await runner.run(["schema", params.resource]);
      if (!result.ok) return errResult(`Schema lookup failed for '${params.resource}'`, result.error);
      return textResult(`Schema for ${params.resource}`, { schema: result.data });
    }
  }, { name: "nb_schema" });

  api.registerTool({
    name: "nb_choices",
    label: "NetBox Field Choices",
    description: "Return valid enumeration values for a NetBox resource's choice fields (e.g. device status, interface type, cable type). Use before setting choice fields.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resource"],
      properties: {
        resource: { type: "string", description: "Resource identifier, e.g. 'dcim.devices', 'dcim.interfaces'" }
      }
    },
    async execute(_id, params) {
      const result = await runner.run(["choices", params.resource]);
      if (!result.ok) return errResult(`Choices lookup failed for '${params.resource}'`, result.error);
      return textResult(`Choices for ${params.resource}`, { choices: result.data });
    }
  }, { name: "nb_choices" });

  // ─── Generic CRUD ────────────────────────────────────────────────────────

  api.registerTool({
    name: "nb_query",
    label: "NetBox Query",
    description: [
      "Query and list objects from any NetBox resource type.",
      "Supports structured filters (key=value pairs, Django ORM lookups like 'site__name'),",
      "full-text search, pagination, field selection, and count-only mode.",
      "Examples: resource='dcim.devices' filters={site: 'ny01', role: 'spine'}",
      "         resource='ipam.prefixes' filters={vrf__name: 'PROD', status: 'active'}"
    ].join(" "),
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resource"],
      properties: {
        resource:  { type: "string", description: "Resource type, e.g. 'dcim.devices', 'ipam.prefixes'" },
        filters: {
          type: "object",
          description: "Structured filter pairs. Keys support Django ORM lookups (e.g. 'site__name', 'tenant__slug'). Values are strings.",
          additionalProperties: { type: "string" }
        },
        search:    { type: "string",  description: "Full-text search string" },
        limit:     { type: "number",  description: "Maximum results to return" },
        offset:    { type: "number",  description: "Pagination offset" },
        all:       { type: "boolean", description: "Fetch all pages (may be slow for large datasets)" },
        brief:     { type: "boolean", description: "Return minimal fields only: id, name, url" },
        count:     { type: "boolean", description: "Return count only — no object data returned" },
        ordering:  { type: "string",  description: "Order field, prefix with - for descending (e.g. '-last_updated', 'name')" },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Whitelist of fields to include in response"
        },
        exclude: {
          type: "array",
          items: { type: "string" },
          description: "Fields to exclude from response"
        }
      }
    },
    async execute(_id, params) {
      const args = ["query", params.resource];
      if (params.search)       args.push("--search",   params.search);
      if (params.limit  != null) args.push("--limit",  String(params.limit));
      if (params.offset != null) args.push("--offset", String(params.offset));
      if (params.all)          args.push("--all");
      if (params.brief)        args.push("--brief");
      if (params.count)        args.push("--count");
      if (params.ordering)     args.push("--ordering", params.ordering);
      args.push(...filterArgs(params.filters));
      if (params.fields)  for (const f of params.fields)  args.push("--field",   f);
      if (params.exclude) for (const f of params.exclude) args.push("--exclude", f);

      const result = await runner.run(args);
      if (!result.ok) return errResult(`Query failed for '${params.resource}'`, result.error);

      if (params.count) {
        const n = typeof result.data === "number" ? result.data : (result.data?.count ?? result.data);
        return textResult(`Count: ${n}`, { count: n });
      }
      const n = Array.isArray(result.data) ? result.data.length : 1;
      return textResult(`${n} ${params.resource} record(s) returned`, { data: result.data, count: n });
    }
  }, { name: "nb_query" });

  api.registerTool({
    name: "nb_get",
    label: "NetBox Get",
    description: "Fetch a single NetBox object by numeric ID or by lookup fields. Provide either 'id' or 'lookup', not both.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resource"],
      properties: {
        resource: { type: "string", description: "Resource type, e.g. 'dcim.devices'" },
        id:       { type: "number", description: "Numeric object ID" },
        lookup: {
          type: "object",
          description: "Field=value pairs to uniquely identify the object (e.g. {name: 'spine-01'})",
          additionalProperties: { type: "string" }
        }
      }
    },
    async execute(_id, params) {
      if (params.id == null && !params.lookup) {
        return textResult("Error: provide either 'id' or 'lookup'", {
          error: { type: "UsageError", message: "id or lookup required" }
        });
      }
      const args = ["get", params.resource];
      if (params.id != null) args.push("--id", String(params.id));
      args.push(...lookupArgs(params.lookup));

      const result = await runner.run(args);
      if (!result.ok) return errResult(`Get failed for '${params.resource}'`, result.error);
      const label = result.data?.name || result.data?.display || result.data?.id || "object";
      return textResult(`Retrieved ${params.resource}: ${label}`, { data: result.data });
    }
  }, { name: "nb_get" });

  api.registerTool({
    name: "nb_create",
    label: "NetBox Create",
    description: "Create one or more NetBox objects. Pass a single object or an array for bulk creation. Use dry_run:true to preview without committing.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resource", "data"],
      properties: {
        resource: { type: "string", description: "Resource type, e.g. 'dcim.devices'" },
        data: {
          description: "Object (or array of objects) to create. Fields must match the resource schema.",
          oneOf: [
            { type: "object" },
            { type: "array", items: { type: "object" } }
          ]
        },
        dry_run: { type: "boolean", description: "Preview creation without committing (default: false)" }
      }
    },
    async execute(_id, params) {
      const args = ["create", params.resource, "--data", JSON.stringify(params.data), "--yes"];
      if (params.dry_run) args.push("--dry-run");

      const result = await runner.run(args);
      if (!result.ok) return errResult(`Create failed for '${params.resource}'`, result.error);
      const prefix = params.dry_run ? "[DRY RUN] Would create" : "Created";
      return textResult(`${prefix} ${params.resource}`, { data: result.data });
    }
  }, { name: "nb_create" });

  api.registerTool({
    name: "nb_update",
    label: "NetBox Update",
    description: "Patch (partially update) an existing NetBox object. Identify the target via 'id' or 'lookup'. Only fields present in 'data' are modified. Use dry_run:true to preview.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resource", "data"],
      properties: {
        resource: { type: "string", description: "Resource type, e.g. 'dcim.devices'" },
        id:       { type: "number", description: "Numeric object ID to update" },
        lookup: {
          type: "object",
          description: "Field=value pairs to identify the target object",
          additionalProperties: { type: "string" }
        },
        data:    { type: "object", description: "Fields to update (partial patch — only provided fields change)" },
        dry_run: { type: "boolean", description: "Preview changes without committing (default: false)" }
      }
    },
    async execute(_id, params) {
      if (params.id == null && !params.lookup) {
        return textResult("Error: provide either 'id' or 'lookup'", {
          error: { type: "UsageError", message: "id or lookup required" }
        });
      }
      const args = ["update", params.resource, "--data", JSON.stringify(params.data), "--yes"];
      if (params.id != null) args.push("--id", String(params.id));
      args.push(...lookupArgs(params.lookup));
      if (params.dry_run) args.push("--dry-run");

      const result = await runner.run(args);
      if (!result.ok) return errResult(`Update failed for '${params.resource}'`, result.error);
      const prefix = params.dry_run ? "[DRY RUN] Would update" : "Updated";
      return textResult(`${prefix} ${params.resource}`, { data: result.data });
    }
  }, { name: "nb_update" });

  api.registerTool({
    name: "nb_delete",
    label: "NetBox Delete",
    description: "Delete a single NetBox object by ID or lookup. Use dry_run:true to confirm the target before committing the deletion.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resource"],
      properties: {
        resource: { type: "string", description: "Resource type, e.g. 'dcim.devices'" },
        id:       { type: "number", description: "Numeric object ID to delete" },
        lookup: {
          type: "object",
          description: "Field=value pairs to identify the object",
          additionalProperties: { type: "string" }
        },
        dry_run: { type: "boolean", description: "Preview deletion without committing (default: false)" }
      }
    },
    async execute(_id, params) {
      if (params.id == null && !params.lookup) {
        return textResult("Error: provide either 'id' or 'lookup'", {
          error: { type: "UsageError", message: "id or lookup required" }
        });
      }
      const args = ["delete", params.resource, "--yes"];
      if (params.id != null) args.push("--id", String(params.id));
      args.push(...lookupArgs(params.lookup));
      if (params.dry_run) args.push("--dry-run");

      const result = await runner.run(args);
      if (!result.ok) return errResult(`Delete failed for '${params.resource}'`, result.error);
      const prefix = params.dry_run ? "[DRY RUN] Would delete" : "Deleted";
      return textResult(`${prefix} ${params.resource}`, { data: result.data });
    }
  }, { name: "nb_delete" });

  // ─── Bulk operations ─────────────────────────────────────────────────────

  api.registerTool({
    name: "nb_bulk_update",
    label: "NetBox Bulk Update",
    description: "PATCH multiple NetBox objects in a single API call. Each object in 'data' must include an 'id' field plus the fields to change.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resource", "data"],
      properties: {
        resource: { type: "string", description: "Resource type, e.g. 'dcim.devices'" },
        data: {
          type: "array",
          items: { type: "object" },
          description: "Array of objects to update. Each must include 'id'."
        },
        dry_run: { type: "boolean", description: "Preview without committing (default: false)" }
      }
    },
    async execute(_id, params) {
      const args = ["bulk-update", params.resource, "--data", JSON.stringify(params.data), "--yes"];
      if (params.dry_run) args.push("--dry-run");

      const result = await runner.run(args);
      if (!result.ok) return errResult(`Bulk update failed for '${params.resource}'`, result.error);
      const prefix = params.dry_run ? "[DRY RUN] Would update" : "Updated";
      const count  = Array.isArray(params.data) ? params.data.length : "?";
      return textResult(`${prefix} ${count} ${params.resource} record(s)`, { data: result.data });
    }
  }, { name: "nb_bulk_update" });

  api.registerTool({
    name: "nb_bulk_delete",
    label: "NetBox Bulk Delete",
    description: "DELETE multiple NetBox objects by their numeric IDs in a single API call.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["resource", "ids"],
      properties: {
        resource: { type: "string", description: "Resource type, e.g. 'dcim.devices'" },
        ids: {
          type: "array",
          items: { type: "number" },
          description: "Array of numeric object IDs to delete"
        },
        dry_run: { type: "boolean", description: "Preview without committing (default: false)" }
      }
    },
    async execute(_id, params) {
      const args = ["bulk-delete", params.resource, "--yes"];
      for (const id of params.ids) args.push("--id", String(id));
      if (params.dry_run) args.push("--dry-run");

      const result = await runner.run(args);
      if (!result.ok) return errResult(`Bulk delete failed for '${params.resource}'`, result.error);
      const prefix = params.dry_run ? "[DRY RUN] Would delete" : "Deleted";
      return textResult(`${prefix} ${params.ids.length} ${params.resource} record(s)`, { data: result.data });
    }
  }, { name: "nb_bulk_delete" });

  // ─── Raw HTTP ────────────────────────────────────────────────────────────

  api.registerTool({
    name: "nb_request",
    label: "NetBox Raw Request",
    description: "Send a raw HTTP request to any NetBox REST API path. Use for endpoints or operations not covered by other nb_* tools.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["method", "path"],
      properties: {
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          description: "HTTP method"
        },
        path: {
          type: "string",
          description: "API path including /api/ prefix, e.g. '/api/dcim/devices/' or '/api/status/'"
        },
        data: {
          type: "object",
          description: "Request body (for POST / PUT / PATCH)"
        },
        query: {
          type: "object",
          description: "Query string parameters as key=value pairs",
          additionalProperties: { type: "string" }
        },
        dry_run: {
          type: "boolean",
          description: "Show the request without sending it (applies to mutating methods)"
        }
      }
    },
    async execute(_id, params) {
      const args = ["request", params.method, params.path];
      // Only add --yes for mutating methods that require confirmation
      if (params.method !== "GET") args.push("--yes");
      if (params.data)  args.push("--data",  JSON.stringify(params.data));
      if (params.query) {
        for (const [k, v] of Object.entries(params.query)) {
          args.push("--query", `${k}=${v}`);
        }
      }
      if (params.dry_run) args.push("--dry-run");

      const result = await runner.run(args);
      if (!result.ok) return errResult(`${params.method} ${params.path} failed`, result.error);
      return textResult(`${params.method} ${params.path} → OK`, { data: result.data });
    }
  }, { name: "nb_request" });
}
