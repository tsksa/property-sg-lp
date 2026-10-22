# HDB seller walkthrough

A 30-second animation drawn with Python/Pillow and encoded with ffmpeg. No stock footage or generated property photographs. Desktop and mobile layouts are composed separately; source figures never count through invented values.

## Data

`data.json` preserves the three official HDB records used in the example, the exact public query and the 22 October 2026 check date. Postal 560640 resolves to block 640, Ang Mo Kio Avenue 6. The demonstration shows the three most recent four-room transactions in that block: October, June and May 2026. The same records were confirmed through the homepage lookup. This dated example is not a live quotation or a valuation. Recheck the address and block records before changing the snapshot. The renderer rejects a block example containing records from another block.

## Rebuild

Requires Python with Pillow (FreeType/WOFF2 support), ffmpeg and ffprobe. From the repository root:

```sh
python3 ops/motion/hdb-walkthrough/render.py --data ops/motion/hdb-walkthrough/data.json
python3 ops/motion/hdb-walkthrough/generate-narration.py
python3 ops/motion/hdb-walkthrough/assemble.py
cp ops/motion/hdb-walkthrough/*-poster.webp assets/motion/
```

The narration generator prompts for an Azure Speech key using hidden input; it never saves the key. Requests go only to the official Southeast Asia Speech endpoint, with redirects disabled. Voice: `en-SG-WayneNeural`, a prebuilt synthetic voice, not Joe Tay. The existing generated sentence WAVs can be reused locally to avoid another synthesis request. The website never calls Azure.

`assemble.py` trims surrounding silence, retains natural speech speed, normalises to roughly -18 LUFS and caps true peak at -3 dBTP, then copies the animation stream into MP4 with AAC narration. The sentence split times were measured for this recording; remeasure the pauses if regenerating speech changes its timing. Captions and the HTML transcript must agree.

Use `--stills-only` to review the two contact sheets before encoding. `--font-dir` can override the repository fonts. All raw media, previews and intermediate metadata stay ignored under this internal directory; only final assets in `assets/motion/` are published. Both final MP4s must stay below 1 MB. Earlier homepage movie assets and their URL rewrites remain for cached tabs.

## Review

Check each frame at half-size, with special attention to data labels and captions. Check desktop/mobile playback, pause/resume/replay, reduced motion, no MP4/VTT network request before Play, and the final CTA restoring/focusing the homepage postal search. Run `npm run test:homepage-ux` and the publish-directory tests. Listen to the voice on a real device before production approval.
