import { ExpoWebGLRenderingContext } from 'expo-gl';
import { useState, useCallback, useRef, useEffect } from 'react';

import { captureAndCropFaces, getGLContext, resizeRGBTexture } from './GLContextManager';

export interface ProcessedFrame {
  texture: WebGLTexture;
  resizedTexture: WebGLTexture | null;
  metadata: Record<string, any>;
}
export const useGLBufferFrameManager = () => {
  const [frames, setFrames] = useState<ProcessedFrame[]>([]);
  const nextId = useRef<number>(0);
  const [model, setModel] = useState(null);
  // Load the TensorFlow Lite model


  const addFrame = useCallback(
    (texture: WebGLTexture, metadata = {}) => {
      const id = nextId.current++;
      const newFrame: ProcessedFrame = { texture, metadata, resizedTexture: null };
      setFrames((prev) => [...prev, newFrame]);
      return id;
    },
    [frames.length]
  );

  const deleteFrame = useCallback((id: number) => {
    setFrames((prev) => prev.filter((_, index) => index !== id));
  }, []);

  const getFrameCount = useCallback(() => frames.length, [frames.length]);

  const initializeContext = useCallback(async () => {
    const gl = await getGLContext();
    console.log('GL context initialized or reused:', gl);
    return gl;
  }, []);

  const processAllFramesAsync = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      if (model == null) {
        console.log('No model was loaded');
        return;
      }
      if (frames.length === 0) {
        console.log('No frames have been stored in the buffer.');
        return;
      }

      const mid = Math.floor(frames.length / 2);
      let left = mid - 1;
      let right = mid;
      const targetWidth = 320;
      const targetHeight = 320;

      while (left >= 0 || right < frames.length) {
        // Function to process a single frame
        const processFrame = async (index: number) => {
          if (index < 0 || index >= frames.length) return;

          const frame = frames[index];
          if (!frame) return;

          const { rgbPixels, resizedTexture } = await resizeRGBTexture(
            frame.texture,
            targetWidth,
            targetHeight
          );

          if (!resizedTexture) {
            console.error(`🚨 Error: Resized texture is NULL for frame ${index}!`);
            return;
          }

          // Update frames state
          setFrames((prevFrames) => {
            if (!prevFrames[index]) return prevFrames;
            const newFrames = [...prevFrames];
            newFrames[index] = {
              ...newFrames[index],
              resizedTexture,
              metadata: {
                ...newFrames[index].metadata,
                resizedTextureWidth: targetWidth,
                resizedTextureHeight: targetHeight,
              },
            };
            return newFrames;
          });
        };

        // Process left and right frames asynchronously
        if (left >= 0) await processFrame(left);
        if (right < frames.length) await processFrame(right);

        left -= 1;
        right += 1;
        break;
      }
    },
    [frames, model]
  );

  return {
    initializeContext,
    addFrame,
    deleteFrame,
    getFrameCount,
    processAllFramesAsync,
    frames,
  };
};
