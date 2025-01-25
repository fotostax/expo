import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  useCameraDevice,
  useFrameProcessor,
  Camera,
  Frame,
  FrameInternal,
} from 'react-native-vision-camera';

export function CameraPage({ yuvToRGBCallback, isProcessing }: any): React.ReactElement {
  const device = useCameraDevice('front');

  const frameProcessor = useFrameProcessor(
     (frame: Frame) => {
      'worklet';
      //console.log("Frame Processor Invoked.");
      if (isProcessing) {
        //const startTime = performance.now(); // Start timing
        //const internal = frame as FrameInternal;
        //internal.incrementRefCount();
        const nativeBuffer = frame.getNativeBuffer();
        const pointer = nativeBuffer.pointer;
        console.log(pointer);
        // Hardware Buffer width/height are inverted
        //const textureWidth = frame.height;
        //const textureHeight = frame.width;
        //console.log(pointer, textureWidth, textureHeight);
        //yuvToRGBCallback(pointer, textureWidth, textureHeight);
        //internal.decrementRefCount();
        //nativeBuffer.delete();
        //const endTime = performance.now(); // End timing
        //console.log(`Processing time: ${(endTime - startTime).toFixed(2)} ms`);
        //console.log('Frame Processor Processing Done.');
      }
    },
    [isProcessing]
  );

  if (!device) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.text}>Loading Camera...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={styles.camera}
        device={device}
        isActive
        frameProcessor={frameProcessor}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: { flex: 1 },
  text: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
