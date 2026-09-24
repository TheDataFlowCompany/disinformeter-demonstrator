const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

[
  "../js/deconspirator-task.js",
  "../releases/2026.05.20/js/deconspirator-task.js"
].forEach((relativePath) => {
  test(relativePath + " can be evaluated more than once in one Qualtrics page realm", () => {
    const src = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
    const context = vm.createContext({
      console,
      window: {
        DECONSPIRATOR_AUTORUN: false,
        addEventListener() {},
      },
    });

    vm.runInContext(src, context, { filename: "deconspirator-task.js" });
    const firstEngine = context.window.DeconspiratorTask;

    assert.equal(typeof context.window.startTask, "function");
    assert.equal(typeof firstEngine.startTask, "function");

    vm.runInContext(src, context, { filename: "deconspirator-task.js" });

    assert.equal(context.window.DeconspiratorTask, firstEngine);
    assert.equal(context.window.startTask, firstEngine.startTask);
    assert.equal(context.window.DeconspiratorTelemetry, firstEngine.Telemetry);
  });
});
