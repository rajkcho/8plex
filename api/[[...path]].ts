import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleHttpRequest } from '../server/index.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleHttpRequest(req, res);
}
