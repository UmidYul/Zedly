const { Client } = require('pg');

async function transferOwnership() {
  const client = new Client({
    host: 'localhost',        // измени при необходимости
    port: 5432,
    user: 'zedlyuz_umid',         // пользователь с правами SUPERUSER или владелец
    password: 'g@laxyA7',
    database: 'zedlyuz_DB'
  });

  try {
    await client.connect();

    // меняем владельца таблицы
    await client.query(`
      ALTER TABLE public.schema_migrations
      OWNER TO zedlyuz;
    `);

    console.log('✅ Владелец таблицы schema_migrations успешно изменён на zedlyuz');
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
  } finally {
    await client.end();
  }
}

transferOwnership();