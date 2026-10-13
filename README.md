# Bruno Collections for the Dynatrace API (OAuth)

Unofficial [Bruno](https://www.usebruno.com/) collection generated from the public Dynatrace OpenAPI specs.
All APIs are combined into a **single collection** so OAuth 2.0 (client credentials) is configured **once** and inherited by every request.

> ⚠️ This project is not affiliated with, endorsed by, or supported by Dynatrace.

## Features

- One `Dynatrace_API` collection, with each API spec as a folder
- OAuth 2.0 configured once at the collection level and inherited by all requests
- Tenant-independent URLs using `{{DT_TENANT_URL}}`
- Works with SaaS and Sprint tenants (switch by environment)
- Endpoints that do not support OAuth automatically use `Api-Token {{DT_API_TOKEN}}`
- Required OAuth scopes listed in each request's **Docs** tab

## Repository structure

```text
├── openapi-to-bruno.js     # Converter: OpenAPI JSON -> Bruno collection
├── openapi-spec/           # Input: Dynatrace rest-api-doc JSON files
└── collections/
    └── Dynatrace_API/      # Output: open this folder in Bruno
```

## Quick start (use the pre-generated collection)

1. Clone the repo:
   ```bash
   git clone https://github.com/<your-username>/bruno-collections-dt-api.git
   ```
2. In Bruno, select **Open Collection** (not *Import*) and choose `collections/Dynatrace_API`.
3. Create an environment for each tenant (see #environment-variables).
4. In **Collection Settings → Auth**:
   - **Scope:** add the scopes of your OAuth client (space-separated)
   - **Additional parameter (token request body):** `resource` = `{{DT_URN}}`
5. Select the environment in the top right and send a request.

## Environment variables

| Variable | Description | Example |
|---|---|---|
| `DT_TENANT_URL` | Tenant base URL | SaaS: `https://<env-id>.live.dynatrace.com`<br>Sprint: `https://<env-id>.sprint.dynatracelabs.com` |
| `DT_TOKEN_URL` | OAuth access token URL | SaaS: `https://sso.dynatrace.com/sso/oauth2/token`<br>Sprint: `https://sso-sprint.dynatracelabs.com/sso/oauth2/token` |
| `DT_CLIENT_ID` | OAuth client ID | `dt0s02.XXXXXXXX` |
| `DT_CLIENT_SECRET` | OAuth client secret (mark as **secret**) | `dt0s02.XXXXXXXX.YYYYYYYY` |
| `DT_URN` | Resource URN for the OAuth token request | `<resource-urn>` |
| `DT_API_TOKEN` | API token for endpoints without OAuth support (mark as **secret**) | `dt0c01.XXXXXXXX.YYYYYYYY` |

> **Scopes** are not stored as a variable. Add them manually in **Collection Settings → Auth → OAuth 2.0 → Scope**.

> **Tip:** Create your own environments (e.g. `My-SaaS`, `My-Sprint`) instead of editing `SaaS-Example` / `Sprint-Example`. The example files are overwritten each time the converter runs.

## Authentication

| Endpoint type | Auth used |
|---|---|
| Supports OAuth | Inherited from the collection (OAuth 2.0, Bearer token) |
| API token only | `Authorization: Api-Token {{DT_API_TOKEN}}` |

Many classic Configuration API v1 endpoints only support API tokens. Check each request's **Docs** tab for the required scopes.

## Generating or updating the collection

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (no npm packages required)

### Steps

1. Download the latest spec files from your tenant's API Explorer:
   `https://<env-id>.live.dynatrace.com/rest-api-doc/`
2. Save them to `openapi-spec/`.
3. Run the converter from the repo root:
   ```bash
   node openapi-to-bruno.js
   ```
   Optional flags:
   ```bash
   node openapi-to-bruno.js --in openapi-spec --out collections --name Dynatrace_API
   ```
4. Reopen the collection in Bruno.

### What the converter does

- Converts each spec in `openapi-spec/` into Bruno `.bru` requests
- Creates one folder per spec and one subfolder per API tag
- Rewrites the tenant-specific server URL to `{{DT_TENANT_URL}}`, keeping the spec's base path:
  - `https://<env>.sprint.dynatracelabs.com/api/config/v1` → `{{DT_TENANT_URL}}/api/config/v1`
  - `https://<env>.sprint.dynatracelabs.com/api/v1` → `{{DT_TENANT_URL}}/api/v1`
- Converts path parameters (`{id}` → `:id`) and adds query parameters (optional ones are disabled)
- Generates example JSON request bodies from the schemas
- Sets OAuth-capable requests to `auth: inherit` and adds an `Api-Token` header to the rest
- Generates `SaaS-Example` and `Sprint-Example` environments

> ⚠️ Each run **deletes and regenerates** `collections/Dynatrace_API`, including `collection.bru`.
> Re-apply your Scope and `resource` settings afterwards, or back up `collection.bru` before running.

### Customizing

At the top of `openapi-to-bruno.js`:

- `ENVIRONMENTS`: add or change the generated example environments
- `OVERRIDES`: override the folder name or base path for a specific spec file

## AI disclosure

`openapi-to-bruno.js` was generated with the help of AI (Microsoft Copilot) and then reviewed and tested.
Review the code before using it, and report issues via GitHub Issues.

## Credits

Inspired by [pahofmann/dynatrace-postman-collections](https://github.com/pahofmann/dynatrace-postman-collections) and https://github.com/pahofmann/dynatrace-bruno-collections, which provide API-token-based collections.

## License

LICENSE
