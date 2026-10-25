import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError } from './procure-api';
import { hasAnyRole, readSession, type PortalRole, type Session } from './session';

type Handler<P> = (request: Request, session: Session, params: P) => Promise<unknown>;

export function bff<P = Record<string, never>>(handler: Handler<P>, roles: PortalRole[] = []) {
  return async (request: Request, context: { params: P }) => {
    const session = readSession();
    if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    if (roles.length > 0 && !hasAnyRole(session, roles))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    try {
      const data = await handler(request, session, context.params);
      if (data instanceof Response) return data;
      return NextResponse.json(data ?? { ok: true });
    } catch (err) {
      if (err instanceof ApiError)
        return NextResponse.json(err.body ?? { error: 'upstream_error' }, { status: err.status });
      if (err instanceof ZodError)
        return NextResponse.json({ error: 'validation_failed', issues: err.issues }, { status: 400 });
      console.error('BFF handler failed', err);
      return NextResponse.json({ error: 'bad_gateway' }, { status: 502 });
    }
  };
}
