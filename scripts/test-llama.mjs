// Quick smoke test for node-llama-cpp binary availability
import { getLlama, LlamaLogLevel } from "node-llama-cpp";

(async () => {
  try {
    console.log("Initializing llama...");
    const llama = await getLlama({
      gpu: "auto",
      logLevel: LlamaLogLevel.warn,
      build: "auto",
      progressLogs: false,
    });
    console.log("OK. gpu =", llama.gpu);
    console.log("supportsVulkan =", await llama.supportsGpu?.("vulkan") ?? "n/a");
    console.log("supportsCuda =", await llama.supportsGpu?.("cuda") ?? "n/a");
    process.exit(0);
  } catch (e) {
    console.error("FAILED:", e?.message ?? e);
    process.exit(1);
  }
})();
