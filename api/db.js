// Conexão com o Postgres ba2026 (somente leitura na prática: a API só faz SELECT).
import pg from "pg"

// numeric -> number, bigint -> number, date -> 'YYYY-MM-DD' (sem fuso)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)))
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)))
pg.types.setTypeParser(1082, (v) => v)

// sessão somente leitura e com tempo máximo por consulta, já na conexão (nenhuma rota escreve por engano)
const OPCOES_SESSAO = "-c default_transaction_read_only=on -c statement_timeout=8000"

export const pool = new pg.Pool(
  process.env.BA2026_DSN
    ? { connectionString: process.env.BA2026_DSN, options: OPCOES_SESSAO }
    : {
        host: process.env.PGHOST || "/tmp",
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || "ba2026",
        user: process.env.PGUSER || "pedrostriquer",
        max: 8,
        options: OPCOES_SESSAO,
      },
)

export async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params)
  return rows
}

export async function q1(sql, params = []) {
  const rows = await q(sql, params)
  return rows[0] ?? null
}
