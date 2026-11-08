import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma/client.js'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.')
    }
    const pool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    })
    super({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
