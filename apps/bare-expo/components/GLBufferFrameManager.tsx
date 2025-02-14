import { useState, useCallback, useRef, useEffect } from 'react';
import { loadTensorflowModel } from 'react-native-fast-tflite';

import { getGLContext, resizeRGBTexture } from './GLContextManager';

export interface ProcessedFrame {
  texture: WebGLTexture;
  resizedTexture: WebGLTexture | null;
  metadata: Record<string, any>;
}

// Hardcode the COCO labels as a constant array
export const COCO_LABELS = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
];

export const useGLBufferFrameManager = () => {
  const [frames, setFrames] = useState<ProcessedFrame[]>([]);
  const nextId = useRef<number>(0);
  const [model, setModel] = useState(null);
  // Load the TensorFlow Lite model

  useEffect(() => {
    async function loadModel() {
      const loadedModel = await loadTensorflowModel(require('assets/efficientdet.tflite'));
      setModel(loadedModel);
    }
    loadModel();
  }, []);

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

  const processAllFramesAsync = useCallback(async () => {
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

        // Run model inference
        const output = await model.run([rgbPixels]);

        const objectDetectionOutput = [
          output[0].slice(),
          output[1].slice(),
          output[2].slice(),
          output[3].slice(),
        ];

        const detectedObjects: [string, number][] = [];
        const detectionScores = objectDetectionOutput[2];
        const detectionClasses = objectDetectionOutput[1];

        for (let i = 0; i < detectionScores.length; i++) {
          if (detectionScores[i] > 0.7) {
            const labelIndex = detectionClasses[i];
            const labelName = COCO_LABELS[labelIndex as number] || `Unknown(${labelIndex})`;
            detectedObjects.push([labelName, detectionScores[i]]);
          }
        }

        // Update frames state
        setFrames((prevFrames) => {
          if (!prevFrames[index]) return prevFrames;
          const newFrames = [...prevFrames];
          newFrames[index] = {
            ...newFrames[index],
            resizedTexture, //
            metadata: {
              ...newFrames[index].metadata,
              objectDetectionOutput,
              detectedObjects,
              resizedTextureWidth: targetWidth, // Store width
              resizedTextureHeight: targetHeight, // Store height
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
    }
  }, [frames, model]);

  return {
    initializeContext,
    addFrame,
    deleteFrame,
    getFrameCount,
    processAllFramesAsync,
    frames,
  };
};
