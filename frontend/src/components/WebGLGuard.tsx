import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';

/** Let the surrounding SceneBoundary show shopping artwork if the GPU is lost. */
export function WebGLGuard() {
  const gl = useThree((state) => state.gl);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      setLost(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [gl]);
  if (lost) throw new Error('The 3D graphics context was lost');
  return null;
}
