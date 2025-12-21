import Database from 'better-sqlite3';
import { env } from '@/config/env';
import { createTablesSQL } from './schema';
import * as path from 'path';
import * as fs from 'fs';

class DatabaseClient {
  private static instance: Database.Database | null = null;

  static getInstance(): Database.Database {
    if (!this.instance) {
      // Ensure database directory exists
      const dbPath = path.resolve(process.cwd(), env.DATABASE_PATH);
      const dbDir = path.dirname(dbPath);

      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Create database connection
      this.instance = new Database(dbPath, {
        verbose: env.NODE_ENV === 'development' ? console.log : undefined,
      });

      // Enable WAL mode for better concurrency
      this.instance.pragma('journal_mode = WAL');

      // Initialize tables
      this.instance.exec(createTablesSQL);

      console.log('✅ Database initialized:', dbPath);
    }

    return this.instance;
  }

  static close(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
      console.log('Database connection closed');
    }
  }
}

export const db = DatabaseClient.getInstance();
export default DatabaseClient;
