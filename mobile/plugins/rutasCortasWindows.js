// Plugin de Expo: en Windows, las rutas intermedias de CMake/ninja de React Native superan el
// límite MAX_PATH (260/248 caracteres) y la compilación nativa falla
// ("Filename longer than 260 characters" / "mkdir ... No such file or directory").
// Mueve el directorio de trabajo de CMake a una ruta corta. No afecta macOS/Linux ni EAS.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARCA = '// rutas-cortas-windows';

// El directorio de carpetas de ninja tiene un límite propio de 248 caracteres; la ruta más larga
// (codegen de react-native-safe-area-context) ya suma ~205 por sí sola, así que la base debe
// ser mínima: `C:/r` (sin el nombre del proyecto, que antes empujaba la ruta a ~257).
// Un solo proyecto React Native compilando a la vez por máquina usa este directorio.
module.exports = function rutasCortasWindows(config, { directorio = 'C:/r' } = {}) {
  if (process.platform !== 'win32') return config;
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARCA)) {
      cfg.modResults.contents += `
${MARCA}
android {
    externalNativeBuild {
        cmake {
            buildStagingDirectory = file("${directorio}")
        }
    }
}
`;
    }
    return cfg;
  });
};
