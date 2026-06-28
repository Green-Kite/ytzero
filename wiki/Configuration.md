# Configuration

YouTube Zero is configured through environment variables. All of them are optional and have sensible defaults.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | HTTP server port. |
| `IDLE_TIMEOUT_SECONDS` | `120` | HTTP idle timeout. Manual channel sync can take longer than Bun's 10-second default when playlist scanning is enabled. |
| `DB_PATH` | `./data/db/ytzero.db` | SQLite database path. |
| `IMG_CACHE_DIR` | `./data/imgcache` | Thumbnail and image cache directory. |
| `IMG_CACHE_TTL_DAYS` | `5` | How long a cached image is fresh before a refetch is attempted. |
| `LOG_PATH` | _(stdout only)_ | Optional file to also write logs to. |
| `REFRESH_INTERVAL_MINUTES` | `5` | RSS and live-status refresh interval. |
| `DURATION_INTERVAL_MINUTES` | `3` | Interval for the background job that backfills missing video durations. |
| `DURATION_BATCH_SIZE` | `20` | Videos processed per duration-backfill run. |
| `UI_DIST` | `./public` | Built frontend directory served by the backend. |
| `APP_URL` | _(derived from request)_ | Public base URL. Used as the OIDC redirect origin and WebAuthn origin when behind a reverse proxy. |
| `WEBAUTHN_RP_ID` | _(request hostname)_ | Override the WebAuthn Relying Party ID (the registrable domain) when the auto-derived hostname is wrong. |
| `YTZERO_AUTH_DISABLE` | _(unset)_ | Set to `1` to force the **None** auth method regardless of the saved setting. Emergency unlock if an auth method locks you out — see [Authentication](Authentication#recovery-anti-lockout). |

## Docker Compose

The bundled Compose file sets:

```yaml
DB_PATH=/data/db/ytzero.db
IMG_CACHE_DIR=/data/imgcache
IDLE_TIMEOUT_SECONDS=120
REFRESH_INTERVAL_MINUTES=5
```

and mounts:

```text
./data:/data
```

## Background refresh

Durations are filled lazily: the per-channel scrape covers recent uploads, and the duration-backfill job fetches anything still missing (older uploads, RSS-only and imported videos), most-recent first. Avatars and subscriber counts are refreshed by a separate background job (5 channels every 5 minutes).

For details on what is fetched and stored, see [How It Works](How-It-Works).
