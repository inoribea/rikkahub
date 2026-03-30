export class AppError extends Error {
  constructor(message: string, public code: number) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request") { super(message, 400); }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") { super(message, 404); }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") { super(message, 401); }
}
