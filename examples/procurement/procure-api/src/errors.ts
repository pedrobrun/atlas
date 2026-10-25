export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number = 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`, 'not_found', 404, { entity, id });
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'conflict', 409, details);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'not allowed') {
    super(message, 'forbidden', 403);
  }
}

export class InvariantViolation extends DomainError {
  constructor(invariant: string, message: string, details?: Record<string, unknown>) {
    super(message, `invariant.${invariant}`, 422, details);
  }
}
