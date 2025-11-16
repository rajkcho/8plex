import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleHttpRequest } from '../server/index';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleHttpRequest(req, res);
}
