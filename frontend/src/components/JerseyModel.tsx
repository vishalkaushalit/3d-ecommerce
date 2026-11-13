import { use, useLayoutEffect, useState, type RefObject } from 'react';
import { useGLTF } from '@react-three/drei';
import { useLoader, useThree } from '@react-three/fiber';
import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from 'three';
import homeInnerUrl from '../../public/assets/home_inner.png';
import gkInnerUrl from '../../public/assets/gk_inner.png';
import homeMobileColorUrl from '../assets/mobile/home_color.png';
import gkMobileColorUrl from '../assets/mobile/gk_color.png';
import homeMobileNormalUrl from '../assets/mobile/home_normal.png';
import gkMobileNormalUrl from '../assets/mobile/gk_normal.png';
import type { Product } from '../../../shared/types';
import { clothShader, type ClothUniforms } from './clothMotion';
import { isLowPowerDevice } from './device';

export const assetUrl = (file: string) =>
  `${(import.meta.env.VITE_ASSET_BASE_URL || '/assets').replace(/\/$/, '')}/${file}`;

// Load lettering before allocating atlases: font completion must not rebuild
// all 23 canvases/materials and temporarily double their memory at startup.
let jerseyFont: Promise<void> | undefined;
function loadJerseyFont() {
  return jerseyFont ??= document.fonts.load('700 48px "Reference Number"').then(
    () => undefined,
    () => undefined, // Keep shopping available with fallback lettering if the font fails.
  );
}

// A 1024x512 mobile atlas takes ~2.67 MiB with mipmaps, versus ~10.67 MiB
// at 2048x1024. There is also a CPU canvas backing store for each jersey.
type ColorBin = { weight: number; red: number; green: number; blue: number };

function getDominantDesignColor(images: CanvasImageSource[]): string | undefined {
  if (!images.length) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Unable to allocate jersey color canvas');
  const bins = new Map<number, ColorBin>();
  for (const image of images) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3];
      if (alpha < 128) continue;
      const red = pixels[i];
      const green = pixels[i + 1];
      const blue = pixels[i + 2];
      const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
      const weight = alpha / 255;
      const bin = bins.get(key) || { weight: 0, red: 0, green: 0, blue: 0 };
      bin.weight += weight;
      bin.red += red * weight;
      bin.green += green * weight;
      bin.blue += blue * weight;
      bins.set(key, bin);
    }
  }
  let dominant: ColorBin | undefined;
  for (const bin of bins.values()) {
    if (!dominant || bin.weight > dominant.weight) dominant = bin;
  }
  canvas.width = canvas.height = 0;
  if (!dominant) return undefined;
  const color = dominant;
  return `#${[color.red, color.green, color.blue]
    .map((channel) => Math.round(channel / color.weight).toString(16).padStart(2, '0'))
    .join('')}`;
}

// Reuse the source geometry and add the selected player's lettering to its UV atlas.
export function JerseyModel({
  product,
  clothRef,
  clothUniforms,
  receiveShadows = true,
}: {
  product: Product;
  clothRef?: RefObject<Group | null>;
  clothUniforms?: ClothUniforms;
  receiveShadows?: boolean;
}) {
  use(loadJerseyFont());
  const { scene } = useGLTF(assetUrl(product.kit === 'gk' ? 'jersey_gk.glb' : 'jersey.glb'));
  // Bundle these smaller sources so an existing external asset CDN needs no update.
  // Resizing only the painted atlas still decodes the original 4K source images.
  const baseTextureUrl = isLowPowerDevice
    ? (product.kit === 'gk' ? gkMobileColorUrl : homeMobileColorUrl)
    : assetUrl(`${product.kit}_color.webp`);
  const normalTextureUrl = isLowPowerDevice
    ? (product.kit === 'gk' ? gkMobileNormalUrl : homeMobileNormalUrl)
    : assetUrl(`${product.kit}_normal.webp`);
  // useTexture eagerly uploads every input, including CPU-only artwork. Only the
  // finished atlas, normal map and lining should occupy GPU memory.
  const [baseTexture, normalTexture, innerTexture] = useLoader(TextureLoader, [
    baseTextureUrl,
    normalTextureUrl,
    product.kit === 'gk' ? gkInnerUrl : homeInnerUrl,
  ]);
  // Share the kit textures even when every player's uploaded artwork differs.
  const [frontDesignTexture, backDesignTexture] = useLoader(TextureLoader, [
    product.frontDesign || baseTextureUrl,
    product.backDesign || baseTextureUrl,
  ]);
  const maxTextureSize = useThree((state) => state.gl.capabilities.maxTextureSize);
  const [models, setModels] = useState<{ model: Group; jersey: Group } | null>(null);
  // Allocate after commit. A render-time useMemo can be discarded by Suspense
  // or StrictMode without ever running a cleanup for its canvas.
  useLayoutEffect(() => {
    const canvas = document.createElement('canvas');
    const atlasLimit = Math.min(maxTextureSize, isLowPowerDevice ? 1024 : 4096);
    const atlasScale = Math.min(1, atlasLimit / Math.max(baseTexture.image.width, baseTexture.image.height));
    canvas.width = Math.round(baseTexture.image.width * atlasScale);
    canvas.height = Math.round(baseTexture.image.height * atlasScale);
    const context = canvas.getContext('2d');
    if (!context) {
      canvas.width = canvas.height = 0;
      throw new Error('Unable to allocate jersey texture canvas');
    }
    context.drawImage(baseTexture.image, 0, 0, canvas.width, canvas.height);
    const originalColor = product.kit === 'gk' ? '#168a9c' : '#a72227';
    const designImages: CanvasImageSource[] = [];
    if (product.frontDesign) designImages.push(frontDesignTexture.image);
    if (product.backDesign) designImages.push(backDesignTexture.image);
    const designColor = getDominantDesignColor(designImages);
    const innerColor = designColor || product.color;
    // Recolor the fabric before adding artwork; retain neutral trim and texture shading.
    if (/^#[0-9a-f]{6}$/i.test(product.color) && product.color.toLowerCase() !== originalColor) {
      const target = [1, 3, 5].map((offset) => parseInt(product.color.slice(offset, offset + 2), 16));
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
        const fabric = product.kit === 'gk'
          ? Math.min(g, b) - r > 12
          : r - Math.max(g, b) > 25 && Math.abs(g - b) < 45;
        if (!fabric) continue;
        const shade = Math.min(1.25, Math.max(r, g, b) / (product.kit === 'gk' ? 142 : 208));
        for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = Math.min(255, target[channel] * shade);
      }
      context.putImageData(pixels, 0, 0);
    }
    const width = canvas.width;
    const height = canvas.height;
    if (product.frontDesign) {
      context.drawImage(frontDesignTexture.image, 0, 0, width / 2, height);
    }
    if (product.backDesign) {
      context.drawImage(backDesignTexture.image, width / 2, 0, width / 2, height);
    }
    context.fillStyle = product.kit === 'gk' ? '#26352d' : '#eee4c7';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // Each atlas half is one face. These positions are in the reference UV layout.
    if (!product.frontDesign) {
      context.font = `700 ${height * 0.15}px 'Reference Number', Impact, sans-serif`;
      context.fillText(product.number, width * 0.25, height * 0.48);
    }
    if (!product.backDesign) {
      context.font = `700 ${height * 0.065}px 'Reference Number', Impact, sans-serif`;
      context.fillText(product.player, width * 0.75, height * 0.28, width * 0.22);
      context.font = `700 ${height * 0.36}px 'Reference Number', Impact, sans-serif`;
      context.fillText(product.number, width * 0.75, height * 0.52);
    }
    const texture = new CanvasTexture(canvas);
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    normalTexture.flipY = false;
    const cloth = new MeshStandardMaterial({
      // The collar exposes the inside of the single-surface garment mesh.
      // Render both faces so the back panel remains visible through the neck.
      side: DoubleSide,
      map: texture,
      normalMap: normalTexture,
      normalScale: new Vector2(0.45, 0.45),
      roughness: 0.85,
    });
    if (clothUniforms) {
      cloth.userData.clothUniforms = clothUniforms;
      cloth.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, clothUniforms);
        shader.vertexShader = clothShader + shader.vertexShader;
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <beginnormal_vertex>',
            `#include <beginnormal_vertex>
          vec2 slope = (clothOffset(position.y + 0.001) - clothOffset(position.y - 0.001)) / 0.002;
          objectNormal.y -= dot(objectNormal.xz, slope);`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
          transformed.xz += clothOffset(position.y);`,
          );
      };
      cloth.customProgramCacheKey = () => 'garuda-cloth-wave-v1';
    }
    innerTexture.flipY = false;
    innerTexture.colorSpace = SRGBColorSpace;
    const applyClothMotion = cloth.onBeforeCompile;
    cloth.onBeforeCompile = (shader, renderer) => {
      applyClothMotion.call(cloth, shader, renderer);
      shader.uniforms.innerFabric = { value: innerTexture };
      shader.uniforms.innerColor = { value: new Color(innerColor) };
      shader.uniforms.recolorInner = {
        value: Boolean(designColor) || product.color.toLowerCase() !== originalColor ? 1 : 0,
      };
      shader.fragmentShader = 'uniform sampler2D innerFabric;\nuniform vec3 innerColor;\nuniform float recolorInner;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        if (!gl_FrontFacing) {
          vec2 innerUv = (vMapUv - vec2(0.65625, 0.0)) / vec2(0.1875, 0.375);
          vec4 lining = texture2D(innerFabric, clamp(innerUv, 0.0, 1.0));
          float inLabel = step(0.0, innerUv.x) * step(innerUv.x, 1.0)
            * step(0.0, innerUv.y) * step(innerUv.y, 1.0);
          vec3 fabric = ${product.kit === 'gk' ? 'vec3(0.001, 0.09, 0.17)' : 'vec3(0.35, 0.009, 0.018)'};
          if (recolorInner > 0.5) {
            float strongest = max(lining.r, max(lining.g, lining.b));
            float weakest = min(lining.r, min(lining.g, lining.b));
            // Recolor saturated lining while preserving the neutral printed neck label.
            float fabricMask = smoothstep(0.12, 0.35, (strongest - weakest) / max(strongest, 0.001));
            lining.rgb = mix(lining.rgb, innerColor * strongest, fabricMask);
            fabric = innerColor * 0.35;
          }
          diffuseColor.rgb = mix(fabric, lining.rgb * 0.74, lining.a * inLabel);
        }
      `);
    };
    cloth.customProgramCacheKey = () => `garuda-lined-cloth-${product.kit}-${Boolean(clothUniforms)}`;
    const hanger = new MeshStandardMaterial({ color: '#463b2d', roughness: 0.5 });
    const hook = new MeshStandardMaterial({ color: '#b6b7af', metalness: 0.85, roughness: 0.25 });
    const model = scene.clone(true);
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = object.name === 'Jersey' ? cloth : object.name === 'Hook' ? hook : hanger;
        // Keep the wooden support visible without casting a stripe on the fabric.
        object.castShadow = object.name === 'Jersey';
        // Mobile rail shadows fall on the room, not the thin double-sided fabric.
        // This avoids self-shadow acne as the shirt returns from the detail stage.
        object.receiveShadow = receiveShadows;
      }
    });
    const jersey = new Group();
    if (clothRef) {
      model.updateMatrixWorld(true);
      // The wooden support turns with the garment; the hook stays on the rail.
      for (const name of ['Jersey', 'Hanger']) {
        const mesh = model.getObjectByName(name);
        if (mesh) jersey.attach(mesh);
      }
    }
    setModels({ model, jersey });
    return () => {
      cloth.dispose();
      hanger.dispose();
      hook.dispose();
      texture.dispose();
      // GPU disposal does not release Safari's 2D canvas backing store.
      canvas.width = canvas.height = 0;
    };
  }, [
    scene,
    baseTexture,
    normalTexture,
    innerTexture,
    frontDesignTexture,
    backDesignTexture,
    product.kit,
    product.color,
    product.frontDesign,
    product.backDesign,
    product.number,
    product.player,
    maxTextureSize,
    clothRef,
    clothUniforms,
    receiveShadows,
  ]);
  if (!models) return null;
  const { model, jersey } = models;
  return clothRef ? (
    <>
      <primitive object={model} name="hanger" rotation={[0, Math.PI / 2, 0]} dispose={null} />
      <group ref={clothRef} name="cloth" rotation={[0, Math.PI / 2, 0]} rotation-order="ZYX">
        <primitive object={jersey} dispose={null} />
      </group>
    </>
  ) : (
    <primitive object={model} dispose={null} />
  );
}
