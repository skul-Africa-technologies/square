import { config as shared } from "@square/shared";
export const appConfig = {
  ...shared,
  useMock: process.env.NEXT_PUBLIC_USE_MOCK === "true" || !process.env.NEXT_PUBLIC_API_URL,
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "",
};
