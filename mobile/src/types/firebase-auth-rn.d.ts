// En runtime, Metro resuelve `@firebase/auth` con la condición `react-native`, que sí exporta
// getReactNativePersistence. Los tipos publicados de `firebase/auth` no la incluyen.
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
