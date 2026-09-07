// First, before anything else: React Native has no `crypto.getRandomValues`,
// and lib/crypto cannot encrypt a single value without it. See src/lib/random.
import './src/lib/random';

import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
