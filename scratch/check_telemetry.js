import { PrismaClient } from '@prisma/client';

async function check() {
  const prismaSec = new PrismaClient({
    datasources: {
      db: {
        url: 'mysql://secretaria_user:secretaria_pass@192.168.18.82:3305/secretaria_db'
      }
    }
  });

  try {
    const count = await prismaSec.aiUsageLog.count();
    console.log('Total AiUsageLog in secretaria_db:', count);
    const logs = await prismaSec.aiUsageLog.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
    console.log('Sample logs:', logs);
  } catch (err) {
    console.error('Error connecting to secretaria_db:', err.message);
  } finally {
    await prismaSec.$disconnect();
  }
}

check();
