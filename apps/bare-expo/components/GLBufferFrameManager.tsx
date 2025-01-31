import { useState, useCallback, useRef } from 'react';

import { getGLContext, resizeRGBTexture } from './GLContextManager';

export interface ProcessedFrame {
  texture: WebGLTexture;
  metadata: Record<string, any>;
}

export const useGLBufferFrameManager = () => {
  const [frames, setFrames] = useState<ProcessedFrame[]>([]);
  const nextId = useRef<number>(0);

  // Add a new frame to the buffer
  const addFrame = useCallback(
    (texture: WebGLTexture, metadata = {}) => {
      const id = nextId.current++;
      const newFrame: ProcessedFrame = { texture, metadata };
      setFrames((prev) => [...prev, newFrame]);
      return id;
    },
    [frames.length]
  );

  // Delete a frame from the buffer
  const deleteFrame = useCallback((id: number) => {
    setFrames((prev) => prev.filter((_, index) => index !== id));
  }, []);

  // Get the number of stored frames
  const getFrameCount = useCallback(() => {
    return frames.length;
  }, [frames.length]);

  // Initialize GL context
  const initializeContext = useCallback(async () => {
    const gl = await getGLContext();
    console.log('GL context initialized or reused:', gl);
    return gl;
  }, []);

  const processAllFramesAsync = useCallback(async () => {

    if (frames.length === 0) {
      console.log('No frames have been stored in the buffer.');
      return;
    }
    console.log(`Processing ${frames.length} Frames...`);

    const mid = Math.floor(frames.length / 2);
    let left = mid - 1;
    let right = mid;
    const targetWidth = 192;
    const targetHeight = 192;

    const updatedFrames = [...frames];

    while (left >= 0 || right < frames.length) {
      if (left >= 0) {
        const resized = await resizeRGBTexture(frames[left].texture, targetWidth, targetHeight);
        updatedFrames[left] = {
          ...frames[left],
          metadata: { ...frames[left].metadata, resizedArray: resized },
        };
        left -= 1;
      }
      if (right < frames.length) {
        const resized = await resizeRGBTexture(frames[right].texture, targetWidth, targetHeight);
        updatedFrames[right] = {
          ...frames[right],
          metadata: { ...frames[right].metadata, resizedArray: resized },
        };
        right += 1;
      }
    }

    setFrames(updatedFrames);
  }, [frames]);

  return {
    initializeContext,
    addFrame,
    deleteFrame,
    getFrameCount,
    processAllFramesAsync,
    frames,
  };
};
