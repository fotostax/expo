import { requireNativeModule } from 'expo';
import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'GLFrameProcessor' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const GLFrameProcessorModule = requireNativeModule('ExponentGLObjectManager');

//const GLFrameProcessorModule = NativeModules.GLFrameProcessor;

const GLFrameProcessor = GLFrameProcessorModule
  ? GLFrameProcessorModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export function install() {
  //GLFrameProcessor.install();
  console.log('Loaded ' + GLFrameProcessorModule);
}
