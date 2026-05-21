import { test } from "node:test";
import assert from "node:assert";
import { providerNodesValidateRoute } from "./src/app/api/provider-nodes/validate/route.js";

const req = new Request("http://localhost/api/provider-nodes/validate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ baseUrl: "", apiKey: "" }),
});
const res = await providerNodesValidateRoute.POST(req);
const data = await res.json();
console.dir(data, { depth: null });
