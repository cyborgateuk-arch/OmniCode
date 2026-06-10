import fs from "fs";
import path from "path";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { LOBE_PROVIDER_ALIASES, LOBE_ICON_COMPONENTS } from "../src/shared/components/lobeProviderIcons";

const PROVIDERS_DIR_1 = path.join(process.cwd(), "public/providers");
const PROVIDERS_DIR_2 = path.join(process.cwd(), "../src/vs/workbench/contrib/chat/browser/omniProxyManagement/media/providers");

if (!fs.existsSync(PROVIDERS_DIR_1)) fs.mkdirSync(PROVIDERS_DIR_1, { recursive: true });
if (!fs.existsSync(PROVIDERS_DIR_2)) fs.mkdirSync(PROVIDERS_DIR_2, { recursive: true });

let extracted = 0;

for (const [providerId, iconKey] of Object.entries(LOBE_PROVIDER_ALIASES)) {
  const entry = LOBE_ICON_COMPONENTS[iconKey as keyof typeof LOBE_ICON_COMPONENTS];
  if (!entry) continue;

  let IconComponent = entry.color || entry.mono;
  if (!IconComponent) continue;
  if ((IconComponent as any).default) IconComponent = (IconComponent as any).default;

  try {
    const svgString = ReactDOMServer.renderToStaticMarkup(
      React.createElement(IconComponent as any, { size: 256 })
    );

    const fileName = `${providerId.toLowerCase()}.svg`;
    const dest1 = path.join(PROVIDERS_DIR_1, fileName);
    const dest2 = path.join(PROVIDERS_DIR_2, fileName);

    fs.writeFileSync(dest1, svgString);
    fs.writeFileSync(dest2, svgString);
    extracted++;
  } catch (err) {
    // console.error(`Failed: ${providerId}`);
  }
}

console.log(`Extracted ${extracted} icons.`);
