const path = require("node:path");
const rcedit = require("rcedit");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icon = path.join(context.packager.projectDir, "build", "icon.ico");
  await rcedit(exe, {
    icon,
    "file-version": context.packager.appInfo.version,
    "product-version": context.packager.appInfo.version,
    "version-string": {
      CompanyName: "Lumen Studio",
      FileDescription: "Lumen Studio Local AI",
      LegalCopyright: "Copyright © 2026 Lumen Studio",
      ProductName: "Lumen Studio",
    },
    "requested-execution-level": "asInvoker",
  });
};
