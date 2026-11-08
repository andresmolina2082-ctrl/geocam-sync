// Configuración fusionada: NativeWind (Semana 2) + import de migraciones .sql (Semana 7)
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
