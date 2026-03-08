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
      "password" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`;
    await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`;
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database init error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
