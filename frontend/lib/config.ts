import { config as shared } from "@square/shared";

const useMockSetting = process.env.NEXT_PUBLIC_USE_MOCK;
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (useMockSetting !== undefined && useMockSetting !== "true" && useMockSetting !== "false") {
  throw new Error('NEXT_PUBLIC_USE_MOCK must be set to "true" or "false".');
}

if (useMockSetting === "false" && !apiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is required when NEXT_PUBLIC_USE_MOCK=false.");
}

export const appConfig = {
  ...shared,
  useMock: useMockSetting === "true" || (useMockSetting === undefined && !apiUrl),
  apiUrl: apiUrl || "",
};
