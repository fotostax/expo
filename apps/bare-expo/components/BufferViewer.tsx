import * as FileSystem from 'expo-file-system';
import * as GL from 'expo-gl';
import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text } from 'react-native'; // Added Text import

import { ProcessedFrame } from './GLBufferFrameManager';
import {
  clearFramebuffer,
  createVertexBuffer,
  prepareForRgbToScreen,
  renderRGBToFramebuffer,
} from './GLContextManager';

interface BufferViewerProps {
  frames: ProcessedFrame[];
  glContext: GL.ExpoWebGLRenderingContext | null;
  id: number;
  onChangeFrame: (newId: number) => void;
}

const BufferViewer: React.FC<BufferViewerProps> = ({ frames, glContext, id, onChangeFrame }) => {
  const [snapshot, setSnapshot] = useState<GL.GLSnapshot | null>(null);
  const [rgbToScreenProgram, setRgbToScreenProgram] = useState<WebGLProgram | null>(null);
  const [vertexBuffer, setVertexBuffer] = useState<WebGLBuffer | null>(null);
  const [frameBuffer, setFrameBuffer] = useState<WebGLFramebuffer | null>(null);

  useEffect(() => {
    if (glContext) {
      const program = prepareForRgbToScreen(glContext);
      const vtxBuffer = createVertexBuffer(glContext);
      const fb = glContext.createFramebuffer();
      setRgbToScreenProgram(program);
      setVertexBuffer(vtxBuffer);
      setFrameBuffer(fb);
      console.log('program :', program);
      console.log('total frames loaded : ' + frames.length);
    }
  }, [glContext]);

  useEffect(() => {
    const renderFrame = async () => {
      if (glContext && vertexBuffer && frameBuffer) {
        const frame = frames[id];
        console.log('Current Id = ' + id);

        renderRGBToFramebuffer(
          glContext,
          rgbToScreenProgram,
          vertexBuffer,
          frame.texture,
          frame.metadata['textureWidth'],
          frame.metadata['textureHeight'],
          frameBuffer,
          frame.metadata.faces
        );
        glContext.endFrameEXP();

        if (snapshot && snapshot.uri) {
          await FileSystem.deleteAsync(snapshot.uri as string, { idempotent: true });
        }
        const snap = await GL.GLView.takeSnapshotAsync(glContext, {
          flip: false,
        });
        setSnapshot(snap);
      }
    };
    renderFrame();
  }, [glContext, frames, id, vertexBuffer, rgbToScreenProgram, frameBuffer]);

  return (
    <View style={styles.container}>
      <View style={styles.flex}>
        {snapshot && (
          <Image
            style={styles.flex}
            fadeDuration={0}
            source={{ uri: snapshot.uri as string }}
            resizeMode="cover"
          />
        )}
      </View>
      {/* Frame counter display */}
      <View style={styles.frameCounter}>
        <Text style={styles.frameText}>
          {id + 1}/{frames.length}
        </Text>
      </View>
      <View style={styles.navigationContainer}>
        <TouchableOpacity
          style={[styles.navButton, styles.leftButton]}
          onPress={() => onChangeFrame(Math.max(0, id - 1))}
        />
        <TouchableOpacity
          style={[styles.navButton, styles.rightButton]}
          onPress={() => onChangeFrame(Math.min(frames.length - 1, id + 1))}
        />
      </View>
    </View>
  );
};

export default BufferViewer;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: 'white',
  },
  flex: {
    flex: 1,
    width: '100%',
  },
  navigationContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navButton: {
    width: '50%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  rightButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  // New styles for frame counter
  frameCounter: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  frameText: {
    color: 'white',
    fontSize: 16,
  },
});