import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.PG_HOST || 'db-postgres',
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'n8n_chat',
  user: process.env.PG_USER || 'n8n',
  password: process.env.PG_PASSWORD || '9417b04ea6b72520cf2175a8',
  max: 5,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Postgres pool error:', err.message);
});

/**
 * Testa conexão com o banco
 */
export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    return { connected: true, time: result.rows[0].now };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

/**
 * Busca histórico de conversas no Postgres (para memória persistente)
 */
export async function getMemory(leadId) {
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT * FROM n8n_vectors WHERE metadata->>leadId = $1 ORDER BY id DESC LIMIT 50',
      [String(leadId)]
    );
    client.release();
    return result.rows;
  } catch (err) {
    console.error('Postgres getMemory error:', err.message);
    return [];
  }
}

export default { testConnection, getMemory };