import { useMemo, useEffect, useState, type RefObject } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  Plane,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import type { Product } from '../../../shared/types';
import { clothShader, type ClothUniforms } from './clothMotion';

export const assetUrl = (file: string) =>
  `${(import.meta.env.VITE_ASSET_BASE_URL || '/assets').replace(/\/$/, '')}/${file}`;

// Reuse the source geometry and add the selected player's lettering to its UV atlas.
export function JerseyModel({
  product,
  clothRef,
  clothUniforms,
}: {
  product: Product;
  clothRef?: RefObject<Group | null>;
  clothUniforms?: ClothUniforms;
}) {
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    void document.fonts.load('700 48px "Reference Number"').then(() => setFontReady(true));
  }, []);
  const { scene } = useGLTF(assetUrl(product.kit === 'gk' ? 'jersey_gk.glb' : 'jersey.glb'));
  const [baseTexture, normalTexture] = useTexture([
    assetUrl(`${product.kit}_color.webp`),
    assetUrl(`${product.kit}_normal.webp`),
  ]);
  const { model, jersey, materials, texture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = baseTexture.image.width;
    canvas.height = baseTexture.image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(baseTexture.image, 0, 0);
    const width = canvas.width;
    const height = canvas.height;
    context.fillStyle = product.kit === 'gk' ? '#26352d' : '#eee4c7';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // Each atlas half is one face. These positions are in the reference UV layout.
    context.font = `700 ${height * 0.15}px 'Reference Number', Impact, sans-serif`;
    context.fillText(product.number, width * 0.25, height * 0.48);
    context.font = `700 ${height * 0.065}px 'Reference Number', Impact, sans-serif`;
    context.fillText(product.player, width * 0.75, height * 0.28, width * 0.22);
    context.font = `700 ${height * 0.36}px 'Reference Number', Impact, sans-serif`;
    context.fillText(product.number, width * 0.75, height * 0.52);
    const texture = new CanvasTexture(canvas);
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    normalTexture.flipY = false;
    const cloth = new MeshStandardMaterial({
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
    const hanger = new MeshStandardMaterial({ color: '#463b2d', roughness: 0.5 });
    const collarPlane = new Plane(new Vector3(0, 1, 0), 0.075);
    if (clothRef) hanger.clippingPlanes = [collarPlane];
    const hook = new MeshStandardMaterial({ color: '#b6b7af', metalness: 0.85, roughness: 0.25 });
    const model = scene.clone(true);
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = object.name === 'Jersey' ? cloth : object.name === 'Hook' ? hook : hanger;
        object.castShadow = true;
        object.receiveShadow = true;
        if (clothRef && object.name === 'Hanger') {
          // Hide the wood below the collar as the cloth turns independently.
          object.onBeforeRender = () => {
            collarPlane.set(new Vector3(0, 1, 0), 0.075);
            if (model.parent) collarPlane.applyMatrix4(model.parent.matrixWorld);
          };
        }
      }
    });
    const jersey = new Group();
    if (clothRef) {
      model.updateMatrixWorld(true);
      const mesh = model.getObjectByName('Jersey');
      if (mesh) jersey.attach(mesh);
    }
    return { model, jersey, materials: [cloth, hanger, hook], texture };
  }, [
    scene,
    baseTexture,
    normalTexture,
    product.kit,
    product.number,
    product.player,
    fontReady,
    clothRef,
    clothUniforms,
  ]);
  useEffect(
    () => () => {
      materials.forEach((material) => material.dispose());
      texture.dispose();
    },
    [materials, texture],
  );
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
