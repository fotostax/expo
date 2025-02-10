import { useState, useCallback, useRef, useEffect } from 'react';
import { loadTensorflowModel } from 'react-native-fast-tflite';

import { getGLContext, resizeRGBTexture } from './GLContextManager';

export interface ProcessedFrame {
  texture: WebGLTexture;
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
      const loadedModel = await loadTensorflowModel(require('assets/yolo11n_float32nms.tflite'));
      setModel(loadedModel);
    }
    loadModel();
  }, []);

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
    const left = mid - 1;
    const right = mid;
    const targetWidth = 640;
    const targetHeight = 640;

    const updatedFrames = [...frames];

    while (left >= 0 || right < frames.length) {
      // Process left-side frames
      if (left >= 0) {
        const { pixels, resizedTexture } = await resizeRGBTexture(
          frames[left].texture,
          targetWidth,
          targetHeight,
          true
        );
        for (let i = 0; i < 10; i += 1) {
          console.log(pixels[i]);
        }
        const output = await model.run([pixels]);
        //x1, y1, x2, y2, conf, label
        //console.log(output);

        console.log(output.length);

        for (let i = 0; i < output[0].length; i += 6) {
          const x = output[0][i];
          const y = output[0][i + 1];
          const w = output[0][i + 2];
          const h = output[0][i + 3];
          const conf = output[0][i + 4];
          const label = output[0][i + 5];
          if (conf > 0.75) {
            console.log(x, y, w, h, conf, label);
          }
        }

        // process each output individually
        /*

        const objectDetectionOutput = [
          output[0].slice(),
          output[1].slice(),
          output[2].slice(),
          output[3].slice(),
        ];

        const detectedObjects: [string, number][] = [];
        updatedFrames[right] = {
          ...frames[right],
          metadata: {
            ...frames[right].metadata,
            resizedArray: pixels,
            objectDetectionOutput,
            resizedTexture,
            detectedObjects,
          },
        };
        right += 1;
        */
      }
      break;
    }
    setFrames(updatedFrames);
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
