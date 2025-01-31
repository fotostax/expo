import { useState, useCallback, useRef } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';

import { getGLContext, resizeRGBTexture } from './GLContextManager';

export interface ProcessedFrame {
  texture: WebGLTexture;
  metadata: Record<string, any>;
}

export const useGLBufferFrameManager = () => {
  const objectDetection = useTensorflowModel(require('assets/efficientdet.tflite'));
  const model = objectDetection.state === 'loaded' ? objectDetection.model : undefined;

  const [frames, setFrames] = useState<ProcessedFrame[]>([]);
  const nextId = useRef<number>(0);

  const addFrame = useCallback(
    (texture: WebGLTexture, metadata = {}) => {
      const id = nextId.current++;
      const newFrame: ProcessedFrame = { texture, metadata };
      setFrames((prev) => [...prev, newFrame]);
      return id;
    },
    [frames.length]
  );

  const deleteFrame = useCallback((id: number) => {
    setFrames((prev) => prev.filter((_, index) => index !== id));
  }, []);

  const getFrameCount = useCallback(() => {
    return frames.length;
  }, [frames.length]);

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

        const objectsModelOutput = model.runSync([resized]);

        const detection_boxes = objectsModelOutput[0];
        const detection_classes = objectsModelOutput[1];
        const detection_scores = objectsModelOutput[2];
        const num_detections = objectsModelOutput[3];

        updatedFrames[left] = {
          ...frames[left],
          metadata: {
            ...frames[left].metadata,
            resizedArray: resized,
            objectsModelOutput,
          },
        };
        left -= 1;
      }
      if (right < frames.length) {
        const resized = await resizeRGBTexture(frames[right].texture, targetWidth, targetHeight);

        const objectsModelOutput = model.runSync([resized]);

        updatedFrames[right] = {
          ...frames[right],
          metadata: {
            ...frames[right].metadata,
            resizedArray: resized,
            objectsModelOutput,
          },
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
