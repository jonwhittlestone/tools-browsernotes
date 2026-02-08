const path = require('path');

module.exports = {
  mode: 'development',
  devtool: 'source-map', // Use source-map instead of eval
  entry: {
    settings: './src/SettingsUI.ts',
    app: './src/NotesAppWithDropbox.ts',
    offscreen: './src/offscreen.ts',
    web: './web/app.ts',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.web.json',
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      type: 'window',
    },
  },
};