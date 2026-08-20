import { Db } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'mc-buyer-secret-' + randomUUID();
const SALT_ROUNDS = 10;

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface Session {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export class AuthService {
  constructor(private db: Db) {
    this.db.collection('users').createIndex({ email: 1 }, { unique: true });
  }

  async register(email: string, password: string): Promise<{ userId: string; token: string }> {
    const existing = await this.db.collection('users').findOne({ email: email.toLowerCase() });
    if (existing) {
      throw new Error('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = 'user_' + randomUUID();
    await this.db.collection('users').insertOne({
      id: userId,
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString(),
    });
    const token = this.issueToken(userId, email.toLowerCase());
    return { userId, token };
  }

  async login(email: string, password: string): Promise<{ userId: string; token: string }> {
    const user = await this.db.collection('users').findOne({ email: email.toLowerCase() }) as User | null;
    if (!user) {
      throw new Error('Invalid email or password');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }
    const token = this.issueToken(user.id, user.email);
    return { userId: user.id, token };
  }

  verifyToken(token: string): Session | null {
    try {
      return jwt.verify(token, JWT_SECRET) as Session;
    } catch {
      return null;
    }
  }

  private issueToken(userId: string, email: string): string {
    return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
  }
}
