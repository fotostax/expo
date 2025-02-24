import React from 'react';
import MainNavigator from './MainNavigator';
import { ThemeProvider } from 'ThemeProvider'; // Remove if you don’t need theming

export default function App() {
  return (
    // Wrap your app in the ThemeProvider if you want themed colors.
    // Otherwise, you can remove this and import MainNavigator directly.
    <ThemeProvider>
      <MainNavigator />
    </ThemeProvider>
  );
}
