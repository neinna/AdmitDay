import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'shsat.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.exec(`
      CREATE TABLE IF NOT EXISTS shsat_results (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        kid           TEXT NOT NULL,
        test_id       TEXT NOT NULL,
        timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_score     INTEGER NOT NULL,
        total_q       INTEGER NOT NULL,
        scaled_score  INTEGER NOT NULL,
        time_used_s   INTEGER NOT NULL,
        answers_json  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shsat_pins (
        kid       TEXT PRIMARY KEY,
        pin_hash  TEXT NOT NULL
      );
    `)
  }
  return db
}
