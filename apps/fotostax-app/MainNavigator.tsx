import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { View, Text } from 'react-native';

const Stack = createStackNavigator();

// A simple screen that uses theme values for background/text.
// Feel free to remove theme references if you don’t need them.
function EmptyScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
      }}>
      <Text style={{ color: '#000' }}>Hello from the Empty Screen!</Text>
    </View>
  );
}

export default function MainNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={EmptyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
