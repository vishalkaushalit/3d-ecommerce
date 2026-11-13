These 1024×512 PNGs are resized copies of the matching color and normal WebP
textures in `frontend/public/assets`. They reduce decoded-image memory before
the mobile scene starts. Imports keep them in the app build even when full-size
assets are served by an older external CDN deployment.

To regenerate each file on macOS from the repository root:

```sh
sips -Z 1024 -s format png frontend/public/assets/home_color.webp --out frontend/src/assets/mobile/home_color.png
sips -Z 1024 -s format png frontend/public/assets/gk_color.webp --out frontend/src/assets/mobile/gk_color.png
sips -Z 1024 -s format png frontend/public/assets/home_normal.webp --out frontend/src/assets/mobile/home_normal.png
sips -Z 1024 -s format png frontend/public/assets/gk_normal.webp --out frontend/src/assets/mobile/gk_normal.png
```
