export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code = 'error',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(entity: string, id: string) {
    super(404, `${entity} ${id} not found`, 'not_found');
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message, 'conflict');
  }
}
