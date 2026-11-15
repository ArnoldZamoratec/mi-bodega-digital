import { registerRootComponent } from 'expo';

import App from './src/presentation/app/App';

// registerRootComponent registra el componente 'main' tanto en Expo Go como en builds nativos.
registerRootComponent(App);
