import pg from "pg";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:15432/sinapsisapp_db"
});

const r = await pool.query(
  `SELECT id, email, "firstName", "lastName", avatar, "imageUrl", "coverUrl"
   FROM "User" WHERE id = 'f7eab78c-3a96-4bf1-aadb-8853c9e4a801'`
);
console.log(JSON.stringify(r.rows[0], null, 2));
await pool.end();
