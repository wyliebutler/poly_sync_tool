const builder = require("electron-builder");
const Platform = builder.Platform;

builder.build({
  targets: Platform.WINDOWS.createTarget("msi"),
  config: {
    directories: { output: "release" }
  }
}).then(() => {
  console.log("Build OK!");
}).catch((error) => {
  console.error("Build failed:", error);
});
