#!/usr/bin/env node
/**
 * Dynatrace OpenAPI (rest-api-doc JSON) -> single Bruno collection
 *
 * - Converts every spec in ./openapi-spec into Bruno .bru requests
 * - Puts all specs as folders under ONE collection (default: Dynatrace_API)
 *   so OAuth is configured once at the collection level
 * - Rewrites the tenant-specific server URL (e.g. https://abc.sprint.dynatracelabs.com/api/config/v1)
 *   to {{DT_TENANT_URL}}/api/config/v1
 * - Requests that support OAuth  -> auth: inherit (uses collection OAuth)
 *   Requests that are Api-Token only -> Authorization: Api-Token {{DT_API_TOKEN}}
 *
 * No dependencies. Usage:
 *   node convert.js [--in openapi-spec] [--out collections] [--name Dynatrace_API]
 */

const fs = require("fs");
const path = require("path");

// ---------- CLI args ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const IN_DIR = args.in || "openapi-spec";
const OUT_DIR = args.out || "collections";
const COLLECTION_NAME = args.name || "Dynatrace_API";
const COLLECTION_DIR = path.join(OUT_DIR, COLLECTION_NAME);

// ---------- Optional per-spec overrides ----------
// Key = spec file name. Use this if a base path ever needs to differ from the spec's servers[0].url.
const OVERRIDES = {
  // "configuration_v1.json": { folder: "Configuration API v1", basePath: "/api/config/v1" },
  // "environment-v1_v1.json": { folder: "Environment API v1", basePath: "/api/v1" },
};

const OAUTH_SCHEMES = ["ssoAuth", "ssoBearerAuth"];
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

// ---------- Helpers ----------
const safeName = (s) =>
  String(s).replace(/[\\/:*?"<>|\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).replace(/[. ]+$/, "") || "Unnamed";
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
const indent = (text, n = 2) =>
  String(text).split("\n").map((l) => (l.length ? " ".repeat(n) + l : l)).join("\n");

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
}

function uniquePath(dir, base, used) {
  let name = base, i = 2;
  while (used.has(path.join(dir, name).toLowerCase())) name = `${base} (${i++})`;
  used.add(path.join(dir, name).toLowerCase());
  return name;
}

// Turn spec servers[0].url into a base path, e.g. https://x.sprint.dynatracelabs.com/api/config/v1 -> /api/config/v1
function basePathFromSpec(spec) {
  const url = spec.servers?.[0]?.url || "";
  try {
    return new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
  }
}

function folderNameFromSpec(spec, basePath) {
  // "Dynatrace Configuration API" + "/api/config/v1" -> "Configuration API v1"
  const title = (spec.info?.title || "API").replace(/^Dynatrace\s+/i, "");
  const ver = (basePath.match(/\/(v\d+)$/) || [])[1];
  return safeName(ver ? `${title} ${ver}` : title);
}

// Resolve local $ref
function resolveRef(spec, obj) {
  let o = obj, guard = 0;
  while (o && o.$ref && guard++ < 20) {
    o = o.$ref.replace(/^#\//, "").split("/").reduce((acc, k) => acc?.[k], spec);
  }
  return o || {};
}

// Build an example JSON body from a schema (depth-limited, cycle-safe)
function exampleFromSchema(spec, schema, depth = 0, seen = new Set()) {
  if (!schema || depth > 6) return null;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return {};
    const next = new Set(seen).add(schema.$ref);
    return exampleFromSchema(spec, resolveRef(spec, schema), depth + 1, next);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  const composite = schema.allOf || schema.oneOf || schema.anyOf;
  if (composite) {
    if (schema.allOf) {
      return schema.allOf.reduce((acc, s) => {
        const v = exampleFromSchema(spec, s, depth + 1, seen);
        return v && typeof v === "object" && !Array.isArray(v) ? { ...acc, ...v } : acc;
      }, {});
    }
    return exampleFromSchema(spec, composite[0], depth + 1, seen);
  }
  switch (schema.type) {
    case "object":
    case undefined: {
      if (!schema.properties) return schema.type === "object" ? {} : null;
      const out = {};
      for (const [k, v] of Object.entries(schema.properties)) {
        if (v.readOnly) continue;
        out[k] = exampleFromSchema(spec, v, depth + 1, seen);
      }
      return out;
    }
    case "array": {
      const item = exampleFromSchema(spec, schema.items, depth + 1, seen);
      return item === null ? [] : [item];
    }
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      return schema.format === "date-time" ? "2026-01-01T00:00:00Z" : "string";
    default:
      return null;
  }
}

function getJsonBody(spec, op) {
  const rb = resolveRef(spec, op.requestBody || {});
  const content = rb.content || {};
  const key = Object.keys(content).find((k) => k.includes("json"));
  if (key) {
    const ex = content[key].example ?? exampleFromSchema(spec, content[key].schema);
    return { type: "json", body: JSON.stringify(ex ?? {}, null, 2) };
  }
  const textKey = Object.keys(content).find((k) => k.startsWith("text/"));
  if (textKey) return { type: "text", body: "" };
  return null;
}

function supportsOAuth(spec, op) {
  const sec = op.security || spec.security || [];
  return sec.some((s) => Object.keys(s).some((k) => OAUTH_SCHEMES.includes(k)));
}

function oauthScopes(op) {
  const scopes = new Set();
  for (const s of op.security || []) {
    for (const [k, v] of Object.entries(s)) if (OAUTH_SCHEMES.includes(k)) v.forEach((x) => scopes.add(x));
  }
  return [...scopes];
}

// ---------- Bru builders ----------
function buildRequestBru({ name, seq, method, url, op, params, body, oauth, scopes }) {
  const parts = [];
  parts.push(`meta {\n  name: ${oneLine(name)}\n  type: http\n  seq: ${seq}\n}`);

  parts.push(
    `${method} {\n  url: ${url}\n  body: ${body ? body.type : "none"}\n  auth: ${oauth ? "inherit" : "none"}\n}`
  );

  const query = params.filter((p) => p.in === "query");
  if (query.length) {
    // Required params enabled, optional ones disabled (~)
    parts.push(
      `params:query {\n${query.map((p) => `  ${p.required ? "" : "~"}${p.name}: `).join("\n")}\n}`
    );
  }

  const pathParams = params.filter((p) => p.in === "path");
  if (pathParams.length) {
    parts.push(`params:path {\n${pathParams.map((p) => `  ${p.name}: `).join("\n")}\n}`);
  }

  const headers = params.filter((p) => p.in === "header" && p.name.toLowerCase() !== "authorization");
  const headerLines = headers.map((p) => `  ${p.required ? "" : "~"}${p.name}: `);
  if (!oauth) headerLines.unshift("  Authorization: Api-Token {{DT_API_TOKEN}}");
  if (headerLines.length) parts.push(`headers {\n${headerLines.join("\n")}\n}`);

  if (body?.type === "json") parts.push(`body:json {\n${indent(body.body)}\n}`);
  if (body?.type === "text") parts.push(`body:text {\n}`);

  const docs = [];
  if (op.summary) docs.push(`# ${oneLine(op.summary)}`);
  if (op.deprecated) docs.push("**Deprecated**");
  if (op.description) docs.push(String(op.description).trim());
  docs.push(
    oauth
      ? `**Auth:** OAuth (inherited from collection)${scopes.length ? `\n\n**Required OAuth scopes:** ${scopes.map((s) => "`" + s + "`").join(", ")}` : ""}`
      : `**Auth:** Api-Token only (OAuth not supported by this endpoint). Uses \`{{DT_API_TOKEN}}\`.`
  );
  if (op["x-token-scopes"]?.length) docs.push(`**API token scopes:** ${op["x-token-scopes"].join(", ")}`);
  const docText = docs.join("\n\n").replace(/^}/gm, " }"); // never close the block early
  parts.push(`docs {\n${indent(docText)}\n}`);

  return parts.join("\n\n");
}

function buildFolderBru(name, seq) {
  return `meta {\n  name: ${oneLine(name)}\n  seq: ${seq}\n}\n\nauth {\n  mode: inherit\n}`;
}

function buildCollectionBru() {
  // OAuth configured ONCE here. Add scopes + the "resource" parameter ({{DT_URN}}) in the Bruno UI.
  return `auth {
  mode: oauth2
}

auth:oauth2 {
  grant_type: client_credentials
  access_token_url: {{DT_TOKEN_URL}}
  refresh_token_url: 
  client_id: {{DT_CLIENT_ID}}
  client_secret: {{DT_CLIENT_SECRET}}
  scope: 
  credentials_placement: body
  credentials_id: credentials
  token_placement: header
  token_header_prefix: Bearer
  auto_fetch_token: true
  auto_refresh_token: true
}

docs {
  # ${COLLECTION_NAME}

  OAuth 2.0 (client credentials) is configured here once and inherited by all folders/requests.

  One-time setup in Collection Settings -> Auth:
  - Scope: add the scopes your OAuth client has (space-separated)
  - Additional parameter (token request body): resource = {{DT_URN}}

  Endpoints that do not support OAuth send: Authorization: Api-Token {{DT_API_TOKEN}}
}`;
}

function buildEnvironmentBru() {
  return `vars {
  DT_TENANT_URL: https://<env-id>.apps.dynatrace.com
  DT_CLIENT_ID: dt0s02.XXXXXXXX
  DT_URN: <resource-urn>
}

vars:secret [
  DT_CLIENT_SECRET,
  DT_API_TOKEN
]`;
}

// ---------- Main ----------
function main() {
  if (!fs.existsSync(IN_DIR)) {
    console.error(`Input folder not found: ${IN_DIR}`);
    process.exit(1);
  }
  const specFiles = fs.readdirSync(IN_DIR).filter((f) => f.endsWith(".json")).sort();
  if (!specFiles.length) {
    console.error(`No .json specs in ${IN_DIR}`);
    process.exit(1);
  }

  fs.rmSync(COLLECTION_DIR, { recursive: true, force: true });
  fs.mkdirSync(COLLECTION_DIR, { recursive: true });

  writeFile(
    path.join(COLLECTION_DIR, "bruno.json"),
    JSON.stringify({ version: "1", name: COLLECTION_NAME, type: "collection", ignore: ["node_modules", ".git"] }, null, 2)
  );
  writeFile(path.join(COLLECTION_DIR, "collection.bru"), buildCollectionBru());
  writeFile(path.join(COLLECTION_DIR, "environments", "Example.bru"), buildEnvironmentBru());

  const summary = [];

  specFiles.forEach((file, specIdx) => {
    const spec = JSON.parse(fs.readFileSync(path.join(IN_DIR, file), "utf8"));
    const ov = OVERRIDES[file] || {};
    const basePath = ov.basePath ?? basePathFromSpec(spec);
    const folderName = ov.folder || folderNameFromSpec(spec, basePath);
    const specDir = path.join(COLLECTION_DIR, folderName);

    writeFile(path.join(specDir, "folder.bru"), buildFolderBru(folderName, specIdx + 1));

    const usedFiles = new Set();
    const tagSeq = new Map();
    let count = 0, oauthCount = 0;

    for (const [route, pathItem] of Object.entries(spec.paths || {})) {
      const sharedParams = (pathItem.parameters || []).map((p) => resolveRef(spec, p));

      for (const method of METHODS) {
        const op = pathItem[method];
        if (!op) continue;

        const tag = safeName(op.tags?.[0] || "Other");
        const tagDir = path.join(specDir, tag);
        if (!tagSeq.has(tag)) {
          tagSeq.set(tag, 0);
          writeFile(path.join(tagDir, "folder.bru"), buildFolderBru(tag, tagSeq.size));
        }
        const seq = tagSeq.get(tag) + 1;
        tagSeq.set(tag, seq);

        // Merge path-level + operation-level params (operation wins)
        const opParams = (op.parameters || []).map((p) => resolveRef(spec, p));
        const params = [
          ...sharedParams.filter((sp) => !opParams.some((p) => p.name === sp.name && p.in === sp.in)),
          ...opParams,
        ];

        // {id} -> :id (Bruno path param syntax), prefixed with {{DT_TENANT_URL}} + spec base path
        const url = `{{DT_TENANT_URL}}${basePath}${route.replace(/\{([^}]+)\}/g, ":$1")}`;

        const oauth = supportsOAuth(spec, op);
        const name = op.summary || op.operationId || `${method.toUpperCase()} ${route}`;
        const fileBase = uniquePath(tagDir, safeName(name), usedFiles);

        writeFile(
          path.join(tagDir, `${fileBase}.bru`),
          buildRequestBru({
            name: fileBase,
            seq,
            method,
            url,
            op,
            params,
            body: getJsonBody(spec, op),
            oauth,
            scopes: oauthScopes(op),
          })
        );
        count++;
        if (oauth) oauthCount++;
      }
    }
    summary.push({ file, folder: folderName, basePath, requests: count, oauth: oauthCount, apiTokenOnly: count - oauthCount });
  });

  console.log(`\nCollection created: ${COLLECTION_DIR}\n`);
  console.table(summary);
}

main();
