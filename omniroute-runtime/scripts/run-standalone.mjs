#!/usr/bin/env node

import {
  resolveRuntimePorts,
  withRuntimePortEnv,
  spawnWithForwardedSignals,
} from "./runtime-env.mjs";
import { bootstrapEnv } from "./bootstrap-env.mjs";

const env = bootstrapEnv();
const runtimePorts = resolveRuntimePorts(env);

spawnWithForwardedSignals("node", ["server.js"], {
  stdio: "inherit",
  env: withRuntimePortEnv(env, runtimePorts),
});
