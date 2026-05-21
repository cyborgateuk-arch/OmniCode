import process from "node:process";
import("./tests/integration/chat-pipeline.test.mjs").then((mod) => {
  setTimeout(() => {
    const activeHandles = process._getActiveHandles();
    console.log("ACTIVE HANDLES: " + activeHandles.length);
    activeHandles.forEach((handle, i) => {
      console.log(`Handle ${i}:`, handle?.constructor?.name);
      if (handle?.constructor?.name === "Socket") {
        console.log("Socket ports:", handle?.localPort, handle?.remotePort);
      }
    });
    process.exit(1);
  }, 15000);
});
