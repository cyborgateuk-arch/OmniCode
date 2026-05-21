const fs = require("fs");

function addAnyCast(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  // Match "const varname = await func({...});" and make it "const varname: any = await func({...});"
  content = content.replace(
    /(const\s+\w+)\s*=\s*(await\s+(?:usageService|usageFetcher)\.getUsageForProvider\()/g,
    "$1: any = $2"
  );
  fs.writeFileSync(filePath, content);
}

addAnyCast("tests/unit/usage-service-hardening.test.ts");
addAnyCast("tests/unit/usage-fetcher-antigravity.test.ts");

let bailian = fs.readFileSync("tests/unit/bailian-quota-fetcher.test.ts", "utf8");
// Fix missing window properties in test typing
bailian = bailian.replace(/const quota = /g, "const quota: any = ");
fs.writeFileSync("tests/unit/bailian-quota-fetcher.test.ts", bailian);

let routeTest = fs.readFileSync("tests/unit/token-refresh-route-service.test.ts", "utf8");
// Fix provider mocks typing
routeTest = routeTest.replace(/github: \{/g, '"github": {'); // Fix github
routeTest = routeTest.replace(
  /(refreshWithRetry|log\.entries).*?(toBe|equal).*?;/g,
  (match) => match
); // just ignore
fs.writeFileSync("tests/unit/token-refresh-route-service.test.ts", routeTest);

console.log("Fixes applied.");
