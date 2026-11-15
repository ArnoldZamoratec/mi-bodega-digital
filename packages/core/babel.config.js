// Solo para Jest (babel-jest). Vite y Metro transpilan el core con su propia configuración.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
};
