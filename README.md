# Bruno Collections for the Dynatrace API (OAuth)

Unofficial [Bruno](https://www.usebruno.com/) collections generated from the public Dynatrace OpenAPI specs, using **OAuth 2.0 client credentials** instead of classic API tokens.

> ⚠️ This project is not affiliated with, endorsed by, or supported by Dynatrace.

## Collections

| Collection | Description |
|---|---|
| Environment API v1 | Classic environment endpoints |
| Environment API v2 | Settings, entities, metrics, problems, etc. |
| Configuration API | Configuration endpoints |
| Cluster API v1 / v2 | Managed only |

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/<your-username>/bruno-collections-dt-api.git
   ```
2. In Bruno, select **Open Collection** and choose a folder under `collections/`.
3. Create a **Global Environment** for each tenant with these variables:

   | Variable | Example |
   |---|---|
   | `DT_TENANT_URL` | SaaS: `https://<env-id>.apps.dynatrace.com`<br>Sprint: `https://<env-id>.sprint.apps.dynatracelabs.com` |
   | `DT_CLIENT_ID` | `dt0s02.XXXXXXXX` |
   | `DT_CLIENT_SECRET` | `dt0s02.XXXXXXXX.YYYYYYYY` (mark as secret) |
   | `DT_URN` | Resource URN of your OAuth client |

   > **Scopes:** not stored as a variable. Add the scopes your OAuth client needs in
   > **Collection Settings → Auth → OAuth 2.0 → Scope**.

4. Select the environment in the top right and send a request. The OAuth token is fetched automatically.

## Credits

Inspired by [pahofmann/dynatrace-postman-collections](https://github.com/pahofmann/dynatrace-postman-collections) and [pahofmann/dynatrace-bruno-collections](https://github.com/pahofmann/dynatrace-bruno-collections), which provide API-token-based collections.

## License

[MIT](LICENSE)
