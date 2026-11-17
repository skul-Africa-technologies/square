import { appConfig } from "../config";
import { mockApi } from "./mock";
import { realApi } from "./real";
import type { ApiClient } from "./types";

export const api: ApiClient = appConfig.useMock ? mockApi : realApi;
export type { ApiClient };
