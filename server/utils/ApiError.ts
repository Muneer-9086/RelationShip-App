class ApiError extends Error {
  public statusCode: number;
  public errors: string[];

  constructor(statusCode: number, message: string, errors: string[] = []) {
    super(message);

    this.statusCode = statusCode;
    this.errors = errors;

    Object.setPrototypeOf(this, ApiError.prototype);

    // Maintain stack trace (V8 engines like Node/Bun)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

   override toString(): string {
    return `Error: ${this.message}\nStatus Code: ${
      this.statusCode
    }\nDetails: ${this.errors.join(", ") || "N/A"}`;
  }

  // ---------- 4xx ----------
  static badRequest(msg: string, errors: string[] = []) {
    return new ApiError(400, msg, errors);
  }

  static unauthorized(msg: string) {
    return new ApiError(401, msg);
  }

  static paymentRequired(msg: string) {
    return new ApiError(402, msg);
  }

  static forbidden(msg: string) {
    return new ApiError(403, msg);
  }

  static notFound(msg: string) {
    return new ApiError(404, msg);
  }

  static methodNotAllowed(msg: string) {
    return new ApiError(405, msg);
  }

  static notAcceptable(msg: string) {
    return new ApiError(406, msg);
  }

  static requestTimeout(msg: string) {
    return new ApiError(408, msg);
  }

  static conflict(msg: string) {
    return new ApiError(409, msg);
  }

  static gone(msg: string) {
    return new ApiError(410, msg);
  }

  static payloadTooLarge(msg: string) {
    return new ApiError(413, msg);
  }

  static unsupportedMediaType(msg: string) {
    return new ApiError(415, msg);
  }

  static unprocessableEntity(msg: string) {
    return new ApiError(422, msg);
  }

  static tooManyRequests(msg: string) {
    return new ApiError(429, msg);
  }

  // ---------- 5xx ----------
  static internal(msg: string) {
    return new ApiError(500, msg);
  }

  static notImplemented(msg: string) {
    return new ApiError(501, msg);
  }

  static badGateway(msg: string) {
    return new ApiError(502, msg);
  }

  static serviceUnavailable(msg: string) {
    return new ApiError(503, msg);
  }

  static gatewayTimeout(msg: string) {
    return new ApiError(504, msg);
  }
}

export default ApiError;
