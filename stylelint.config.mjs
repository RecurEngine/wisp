// Review categories: avoid !important and unsupported Chromium CSS features.
export default {
  plugins: ["stylelint-no-unsupported-browser-features"],
  rules: {
    "declaration-no-important": true,
    "plugin/no-unsupported-browser-features": [true, {
      browsers: ["electron >= 38"],
      ignore: ["css-nesting", "css-cascade-layers"]
    }]
  }
};
