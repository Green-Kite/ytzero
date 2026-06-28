# Backup & Updates

All persistent Docker data lives in `./data`.

## Backup

To back up a Docker install, stop the container and copy the data directory:

```bash
docker compose down
cp -R data data.backup
docker compose up -d
```

For local installs, the default database and image cache are under:

```text
data/db/ytzero.db
data/imgcache
```

## Updates

Update a Docker install that uses the published GHCR image:

```bash
docker compose pull
docker compose up -d
```

Update a Docker install that builds locally after pulling new code:

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

Schema changes are applied automatically on startup, so updates do not require manual migration steps. Back up `./data` first if you want a safety net.
