import { convertOpenAIContentToParts } from "./open-sse/translator/helpers/geminiHelper.ts";

const cherryMsg = [
  { type: "text", text: "What runs on this?" },
  { type: "file", file: { data: "ABCDEFG", type: "application/pdf" } },
  { type: "file", file_url: { url: "data:application/pdf;base64,ABCDEFG" } },
];

console.log(convertOpenAIContentToParts(cherryMsg));
