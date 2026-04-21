import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    await prisma.$connect();
    console.log('✅ DB CONNECTED SUCCESSFULLY');

    const result = await prisma.$queryRaw`SELECT 1`;
    console.log('Query result:', result);

  } catch (error) {
    console.error('❌ DB CONNECTION FAILED:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();