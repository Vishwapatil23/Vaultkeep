import dotenv from 'dotenv';
import path from 'path';

// Ensure .env is loaded from backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { pool, query } from '../db';

async function viewDatabase() {
  console.log('\n================================================================');
  console.log('         VaultKeep Amazon RDS PostgreSQL Database Viewer        ');
  console.log('================================================================');
  console.log(`Endpoint: ${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}`);
  console.log(`Database: ${process.env.DB_NAME}`);
  console.log(`Username: ${process.env.DB_USER}`);
  console.log(`SSL:      ${process.env.DB_SSL === 'true' ? 'Enabled (AWS RDS CA Bundle Verified)' : 'Disabled'}`);
  console.log('================================================================\n');

  if (!pool) {
    console.error('Error: Database pool is not initialized. Check your database configuration in .env');
    process.exit(1);
  }

  try {
    // Check connection and fetch version
    const versionRes = await query('SELECT version()');
    console.log(`Connected successfully!`);
    console.log(`PostgreSQL Engine: ${versionRes.rows[0].version}\n`);

    // Parse CLI arguments
    const args = process.argv.slice(2);
    const tableArgIndex = args.indexOf('--table');
    const queryArgIndex = args.indexOf('--query');

    if (queryArgIndex !== -1 && args[queryArgIndex + 1]) {
      const customQuery = args.slice(queryArgIndex + 1).join(' ');
      console.log(`Executing Custom Query: "${customQuery}"\n`);
      const customRes = await query(customQuery);
      console.log(`Result: ${customRes.rowCount} row(s) returned.\n`);
      if (customRes.rows.length > 0) {
        console.table(customRes.rows);
      }
      return;
    }

    if (tableArgIndex !== -1 && args[tableArgIndex + 1]) {
      const selectedTable = args[tableArgIndex + 1];
      console.log(`Fetching contents of table: ${selectedTable}\n`);
      const tableData = await query(`SELECT * FROM ${selectedTable} LIMIT 100`);
      console.log(`Total rows returned (up to 100): ${tableData.rowCount}\n`);
      if (tableData.rows.length > 0) {
        // Sanitize sensitive fields if present
        const sanitized = tableData.rows.map(r => {
          const rowCopy = { ...r };
          if (rowCopy.password_hash) rowCopy.password_hash = '[PROTECTED_HASH]';
          return rowCopy;
        });
        console.table(sanitized);
      } else {
        console.log(`(Table '${selectedTable}' is currently empty)`);
      }
      return;
    }

    // Default overview: list all tables and row counts
    console.log('--- DATABASE TABLES & ROW COUNTS ---');
    const tablesRes = await query(`
      SELECT 
        table_name 
      FROM 
        information_schema.tables 
      WHERE 
        table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY 
        table_name ASC
    `);

    const tableSummaries: Array<{ Table: string; Rows: number; Columns: number }> = [];

    for (const row of tablesRes.rows) {
      const tableName = row.table_name;
      const countRes = await query(`SELECT count(*)::int AS count FROM "${tableName}"`);
      const colsRes = await query(`
        SELECT count(*)::int AS count 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = '${tableName}'
      `);
      tableSummaries.push({
        Table: tableName,
        Rows: countRes.rows[0].count,
        Columns: colsRes.rows[0].count,
      });
    }

    console.table(tableSummaries);

    // Detailed previews of core application tables
    const coreTables = ['users', 'nominees', 'documents', 'account_lifecycle', 'audit_logs'];

    for (const tableName of coreTables) {
      console.log(`\n------------------------------------------------------------`);
      console.log(` TABLE: ${tableName.toUpperCase()}`);
      console.log(`------------------------------------------------------------`);
      const dataRes = await query(`SELECT * FROM "${tableName}" LIMIT 20`);
      
      if (dataRes.rows.length === 0) {
        console.log(`(No records found in ${tableName})`);
      } else {
        const sanitizedRows = dataRes.rows.map(r => {
          const copy = { ...r };
          if (copy.password_hash) copy.password_hash = '[PROTECTED_HASH]';
          // Format ISO dates if present
          for (const key of Object.keys(copy)) {
            if (copy[key] instanceof Date) {
              copy[key] = copy[key].toISOString();
            }
          }
          return copy;
        });
        console.table(sanitizedRows);
      }
    }

    console.log('\n================================================================');
    console.log('Tips:');
    console.log(' - View specific table:  npm run db:view -- --table <table_name>');
    console.log(' - Run custom query:     npm run db:view -- --query "SELECT * FROM users"');
    console.log('================================================================\n');

  } catch (error: any) {
    console.error('\n[Database Viewer Error]', error.message);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

viewDatabase();
