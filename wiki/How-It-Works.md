# How It Works

YouTube Zero uses only public YouTube surfaces — no Google account and no YouTube Data API key.

## What is fetched

- Videos are fetched from official RSS feeds:

  ```text
  https://www.youtube.com/feeds/videos.xml?channel_id=UC...
  ```

- Channel IDs are resolved from common YouTube URLs and handles.
- Live and upcoming stream status is detected from channel live pages.
- Video duration, Shorts detection, view counts, likes, channel metadata, avatars, and public playlists are refreshed in the background where available.

See [Configuration](Configuration#background-refresh) for the refresh intervals and how lazy duration backfill works.

## What is stored locally

Everything user-specific lives locally in SQLite. Most of it is [per profile](Profiles#what-is-per-profile):

- followed channels
- videos and statuses
- queue buckets
- tags and rules
- filter rules
- playlists and playlist rules
- watch history and progress
- display and player settings
- language preference

Channels and videos are stored globally and shared across profiles; per-profile state references them.
