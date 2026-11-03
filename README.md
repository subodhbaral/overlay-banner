# Overlay

Overlay burns a graphic onto a live HLS channel and republishes a playlist that players can open. An operator console picks the creative, places it on the frame, and triggers an insertion. The backend polls the source playlist, encodes the overlay onto the upcoming segments with ffmpeg, and swaps those segments into the manifest it serves.

Two creative types ship in `ADS/`:

- **Bottom banner** — a bar locked to the bottom edge. Width can run from half the frame to the full frame; height stays in a short band.
- **L-shape** — a corner graphic with a transparent window, locked to the bottom-left. Width and height stay equal.

Placement in the console is a preview of those constraints. The picture a viewer sees is the HLS output, not that preview.

`demo.mkv` is a screen recording of that console: choosing a creative, placing it, and inserting it on a live channel. Open it in any video player to watch the walkthrough.

## Requirements

- Node.js 22
- ffmpeg and ffprobe on `PATH`
- A live HLS URL (master or media playlist) to use as the program source

## Setup

Install both apps from the repository root:

```bash
npm install --prefix backend
npm install --prefix frontend
```

The console reads the API origin from `frontend/.env`. Create that file (it is not committed):

```bash
echo 'API_URL=http://localhost:4000' > frontend/.env
```

Start the API and the console:

```bash
npm run dev --prefix backend
```

```bash
npm run dev --prefix frontend
```

- API: http://localhost:4000 (`GET /api/health` returns `{ "ok": true }`)
- Console: http://localhost:5173

The first backend start writes `data/config.json`. That file, along with downloaded segments and analytics logs, stays on the machine. The creative list in `data/ads-catalog.json` is the committed catalog.

## Insert an overlay

1. Open the console and paste your live HLS URL into the source field. The URL can only be changed while the channel is off.
2. Turn the channel on. Wait until the rail shows a profile. The output playlist stays a few segments behind the live edge (`servingLagSegments`, default 4) so an encode can finish before a player reaches it. Right after startup the manifest can be empty for that long.
3. Pick a creative, drag the preview to size it, and set the insertion length and fade.
4. Insert. The job is queued per rendition. Segments that finish in time are replaced in the output; segments that are still encoding, or that fail, stay as the original source.
5. Play the output:

```bash
ffplay -fflags nobuffer http://localhost:4000/manifest/master.m3u8
```

The same URL is the one the console copies. VLC can open it too. Unmodified segments are still fetched from the source origin, and overlaid segments are fetched from the backend.

Analytics on the second console page counts viewers from playback sessions and records when a player actually downloads an overlaid segment.

## Layout

| Path | Role |
| --- | --- |
| `backend/` | Poller, insertion queue, ffmpeg overlay, manifests, analytics |
| `frontend/` | Operator console |
| `ADS/` | Banner and L-shape images |
| `data/ads-catalog.json` | Creative metadata and default placement |

## Future updates

1. Store stream and creative metadata in a database instead of `data/config.json` and `data/ads-catalog.json`.
2. Move manifest generation into its own service so it can scale horizontally, and cache playlist state in Redis.
3. Write analytics logs to a search engine such as Elasticsearch instead of local JSONL files.
4. Let operators upload their own creatives, rather than only using the images shipped in `ADS/`.
