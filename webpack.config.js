const path = require('path');

module.exports = {
  mode: 'development',
  devtool: 'source-map', // Use source-map instead of eval
  entry: {
    settings: './src/SettingsUI.ts',
    app: './src/NotesAppWithDropbox.ts',
    offscreen: './src/offscreen.ts'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
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