import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { accessCode } = req.body;

  if (!accessCode) {
    return res.status(400).json({ message: 'Access code is required' });
  }

  try {
    const hashedCodesPath = path.join(process.cwd(), 'access-codes.enc');
    const hashedCodes = fs.readFileSync(hashedCodesPath, 'utf-8').split('\n');

    for (const hashedCode of hashedCodes) {
      const isMatch = await bcrypt.compare(accessCode, hashedCode);
      if (isMatch) {
        return res.status(200).json({ success: true });
      }
    }

    return res.status(401).json({ success: false, message: 'Invalid access code' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
