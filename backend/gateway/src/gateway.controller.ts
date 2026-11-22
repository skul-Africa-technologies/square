import { Controller, Get, Header, Inject, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { BackendConfig } from "@square/kernel";
import { Public } from "@square/kernel";
import { BACKEND_CONFIG } from "./tokens";

@Controller()
@ApiTags("system")
export class GatewayController {
  constructor(@Inject(BACKEND_CONFIG) private readonly config: BackendConfig) {}

  @Get("config")
  @Public()
  @Header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600")
  @ApiOperation({ summary: "Get public client configuration" })
  @ApiResponse({ status: 200, description: "Feature flags and public API limits" })
  getConfig() {
    return {
      limits: { usernameMin: 3, usernameMax: 24, pageSize: 30, pageSizeMax: 100 },
      assetCatalogVersion: 1,
      features: {
        signup: this.config.SIGNUP_ENABLED,
        directMessages: this.config.DM_ENABLED,
        uploads: this.config.UPLOADS_ENABLED,
        typing: this.config.ENABLE_TYPING,
        push: this.config.ENABLE_PUSH,
      },
    };
  }

  @Get("_dev/dummy/health")
  @Public()
  @ApiOperation({ summary: "Check the development dummy service" })
  @ApiResponse({ status: 200, description: "Dummy service health" })
  async dummyHealth() {
    if (this.config.NODE_ENV !== "development") throw new NotFoundException();

    let response: Response;
    try {
      response = await fetch(new URL("/healthz", this.config.DUMMY_SERVICE_URL), {
        signal: AbortSignal.timeout(1_000),
      });
    } catch {
      throw new ServiceUnavailableException("Dummy service is unavailable");
    }
    if (!response.ok) throw new ServiceUnavailableException("Dummy service is unavailable");
    return response.json();
  }
}
