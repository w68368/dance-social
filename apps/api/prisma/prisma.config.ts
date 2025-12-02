import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  // путь до schema.prisma — у тебя она лежит в этой же папке prisma
  schema: './schema.prisma',

  // путь до миграций
  migrations: {
    path: './migrations',
  },

  // движок (для обычного PostgreSQL — classic)
  engine: 'classic',

  // здесь указываем URL к базе (БЕЗ db:)
  datasource: {
    url: env('DATABASE_URL'),
  },
});
