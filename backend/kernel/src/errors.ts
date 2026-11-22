import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class ApiException extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = "ApiException";
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const requestId = request.id;

    if (exception instanceof ApiException) {
      reply.status(exception.status).send({
        error: {
          code: exception.code,
          message: exception.message,
          field: exception.field,
          requestId,
        },
      });
      return;
    }

    if (exception instanceof ZodError) {
      const issue = exception.issues[0];
      reply.status(HttpStatus.BAD_REQUEST).send({
        error: {
          code: "validation_failed",
          message: issue?.message ?? "Invalid request",
          field: issue?.path.join(".") || null,
          requestId,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        status === HttpStatus.UNAUTHORIZED
          ? "unauthenticated"
          : status === HttpStatus.NOT_FOUND
            ? "not_found"
            : status === HttpStatus.FORBIDDEN
              ? "forbidden"
              : status === HttpStatus.CONFLICT
                ? "conflict"
                : status === HttpStatus.TOO_MANY_REQUESTS
                  ? "rate_limited"
                  : status === HttpStatus.SERVICE_UNAVAILABLE
                    ? "service_unavailable"
                    : status === HttpStatus.BAD_REQUEST
                      ? "validation_failed"
                      : "request_failed";
      const message =
        code === "unauthenticated"
          ? "Sign in to continue"
          : code === "forbidden"
            ? "You do not have permission to do that"
            : code === "not_found"
              ? "Resource not found"
              : code === "conflict"
                ? "The request conflicts with the current state"
                : code === "rate_limited"
                  ? "Too many requests"
                  : code === "service_unavailable"
                    ? "Service is temporarily unavailable"
                    : code === "validation_failed"
                      ? "Invalid request"
                      : "Request failed";
      reply.status(status).send({
        error: {
          code,
          message,
          field: null,
          requestId,
        },
      });
      return;
    }

    if (exception && typeof exception === "object" && "statusCode" in exception) {
      const status = Number(exception.statusCode);
      if (Number.isInteger(status) && status >= 400 && status < 500) {
        const code = status === 413 ? "payload_too_large" : status === 415 ? "unsupported_media_type" : "validation_failed";
        reply.status(status).send({
          error: {
            code,
            message: status === 413 ? "Request body is too large" : "Invalid request",
            field: null,
            requestId,
          },
        });
        return;
      }
    }

    this.logger.error(`Unhandled request error (requestId=${requestId})`);
    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred",
        field: null,
        requestId,
      },
    });
  }
}
