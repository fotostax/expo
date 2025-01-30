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
    // We should process the frames from the middle to the sides
    if (frames) {
      console.log(frames.length);
      const mid = frames.length / 2.0;
      console.log('mid = ' + mid);
      let left = mid - 1;
      let right = mid;
      const targetWidth = 192;
      const targetHeight = 192;
      while (left >= 0 && right < frames.length) {
        if (left >= 0) {
          const resized = await resizeRGBTexture(frames[left].texture, targetWidth, targetHeight);
          console.log(resized);
          left -= 1;
        }
        if (right < frames.length) {
          const resized = await resizeRGBTexture(frames[right].texture, targetWidth, targetHeight);
          console.log(resized);
          right += 1;
        }
        break;
      }
      console.log('Done Processing Frames.');
    } else {
      console.log('No frames have been stored in the buffer.');
    }
  }, [frames.length]);

  return {
    initializeContext,
    addFrame,
    deleteFrame,
    getFrameCount,
    processAllFramesAsync,
    frames,
  };
};
