import { QoderExecutor } from "./open-sse/executors/qoder.ts";
import fs from "fs";
import os from "os";

async function run() {
  const credsPath = os.homedir() + "/.qwen/oauth_creds.json";
  const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));

  const executor = new QoderExecutor();
  const result = await executor.execute({
    model: "coder-model",
    body: {
      messages: [{ role: "user", content: "hello test" }],
      stream: true,
      max_tokens: 10,
    },
    credentials: {
      accessToken: creds.access_token,
      resourceUrl: creds.resource_url,
    },
    signal: new AbortController().signal,
  });

  console.log("Status:", result.response.status);

  if (result.response.body) {
    // If it's a web stream, readable stream
    const reader = result.response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      console.log(decoder.decode(value));
    }
  }
}

run().catch(console.error);
