# Reference jersey assets

These assets were retrieved from the public [Garuda 2026 reference experience](https://garuda2026.offwg.com/rail), as requested, on 2026-11-11. Original creative credits displayed by the reference are OFFWG and Screenagers. Original brands and artwork remain the property of their respective owners; this document does not grant a reuse license.

| Local file | Source |
| --- | --- |
| `jersey.glb` | https://garuda2026.offwg.com/models/jersey.glb.gz (gzip decompressed, geometry unchanged) |
| `jersey_gk.glb` | https://garuda2026.offwg.com/models/jersey_gk.glb.gz (gzip decompressed, geometry unchanged) |
| `home_color.webp` | https://garuda2026.offwg.com/art/baked/home_color.webp |
| `home_normal.webp` | https://garuda2026.offwg.com/art/baked/home_normal.webp |
| `gk_color.webp` | https://garuda2026.offwg.com/art/baked/gk_color.webp |
| `gk_normal.webp` | https://garuda2026.offwg.com/art/baked/gk_normal.webp |
| `crest.webp` | https://garuda2026.offwg.com/art/crest.webp |
| `reference/plate.jpg` | https://garuda2026.offwg.com/env/plate.jpg |
| `reference/probe_512.hdr` | https://garuda2026.offwg.com/env/probe_512.hdr.gz (gzip decompressed) |
| `reference/room.glb`, `reference/room.json` | Reference `/models/room.glb.gz` and `/models/room.json` (inspection assets) |
| `reference/title.webp` | Reference campaign artwork under `/art/terima-kasih-timnas-indonesia` |
| `reference/shirts.webp` | https://garuda2026.offwg.com/art/preloader/shirts.webp |
| `reference/lockers-full.webp`, `reference/lockers-open.webp` | Reference `/art/next/` assets with matching filenames |
| `reference/*.svg` | Reference `/art/` logos with matching filenames; GARUDA branding is implemented locally |

The local Geist Mono, Barlow Condensed, and Montserrat font files are used for the reference typography. The reference stylesheets retained in this folder were used for visual inspection; the app uses its own React components and styles. Player facts and match timelines in `shared/referencePlayers.ts` are a snapshot of the supplied reference experience, not a live sports feed. Profile summaries are generated from those facts.

## Rendering notes

- Each GLB has three meshes: `Hanger`, `Hook`, and `Jersey`. Materials are assigned by the application.
- Geometry uses Y-up coordinates, with the origin around the hanging hook. The hook reaches Y = 0.021 and the jersey hem reaches approximately Y = -0.843.
- Home jersey bounds are approximately X = -0.288 to 0.267, Y = -0.843 to -0.060, Z = -0.057 to 0.058. Goalkeeper jersey bounds are approximately X = -0.296 to 0.277, Y = -0.843 to -0.060, Z = -0.056 to 0.059.
- GLBs include UV coordinates. Set both textures' `flipY` to `false`; use sRGB color space for color maps and no color space conversion for normal maps.
- The original renderer builds player names and numbers as separate overlays. The supplied base textures contain the underlying home/goalkeeper kit artwork.

## Reference roster

The reference's public roster contains Audero 1, Diks 2, Markx 3, Amat 4, Ridho 5, Pratama 6, Vikri 7, Vickery 8, Baker 9, Romeny 10, Oratmangoen 11, Paes 12, Winata 13, Pelupessy 14, Hannan 15, Pattynama 16, Verdonk 17, Jenner 18, Haye 19, Baggott 20, James 21, Tjoe-A-On 22, and Hubner 23. Audero, Paes, and Winata wear the goalkeeper kit.
