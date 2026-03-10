// Initialize SQLite database for user auth
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    // This creates the database and tables if they don't exist
    await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "name" TEXT,
      "password" TEXT,
      "image" TEXT,
      "provider" TEXT,
      "dashboardCoins" TEXT,
      "settings" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`;
    await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`;
    // Add columns if upgrading from older schema
    const newCols = ['dashboardCoins', 'image', 'provider', 'settings'];
    for (const col of newCols) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "${col}" TEXT`);
      } catch (e) {
        // Column already exists, ignore
      }
    }
    // Make password nullable for OAuth users (SQLite doesn't support ALTER COLUMN)
    // Check if password column is NOT NULL and migrate if needed
    try {
      const tableInfo = await prisma.$queryRawUnsafe(`PRAGMA table_info("User")`);
      const pwCol = tableInfo.find(c => c.name === 'password');
      if (pwCol && Number(pwCol.notnull) === 1) {
        console.log('Migrating User table: making password nullable...');
        await prisma.$executeRawUnsafe(`CREATE TABLE "User_new" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "email" TEXT NOT NULL,
          "name" TEXT,
          "password" TEXT,
          "image" TEXT,
          "provider" TEXT,
          "dashboardCoins" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
        await prisma.$executeRawUnsafe(`INSERT INTO "User_new" SELECT "id","email","name","password",
          CASE WHEN "image" IS NOT NULL THEN "image" ELSE NULL END,
          CASE WHEN "provider" IS NOT NULL THEN "provider" ELSE NULL END,
          CASE WHEN "dashboardCoins" IS NOT NULL THEN "dashboardCoins" ELSE NULL END,
          "createdAt" FROM "User"`);
        await prisma.$executeRawUnsafe(`DROP TABLE "User"`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "User_new" RENAME TO "User"`);
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`);
        console.log('Migration complete.');
      }
    } catch (e) {
      console.log('Password nullable check skipped:', e.message);
    }
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database init error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
