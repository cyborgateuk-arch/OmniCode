import process from "node:process";
import fs from "node:fs";

setTimeout(() => {
  const activeHandles = process._getActiveHandles();
  console.log("ACTIVE HANDLES: " + activeHandles.length);
  activeHandles.forEach((handle, i) => {
    console.log(`Handle ${i}:`, handle?.constructor?.name);
    // if it's a timer or socket, let's see more
    if (handle?.constructor?.name === "Timeout") {
      console.log("  Timer wrapper:", handle?._onTimeout?.toString().slice(0, 50));
    }
  });
  process.exit(1);
}, 2000);

await import("./tests/integration/chat-pipeline.test.mjs");
