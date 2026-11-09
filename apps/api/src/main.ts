import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { HttpExceptionEnvelopeFilter } from './common/http-exception.filter.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api/v1')
  const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean)
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Demo-Admin-Token'],
    credentials: false,
  })
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: false,
  }))
  app.useGlobalFilters(new HttpExceptionEnvelopeFilter())
  app.enableShutdownHooks()
  const port = Number(process.env.API_PORT ?? 3000)
  await app.listen(port, process.env.API_HOST ?? '127.0.0.1')
}

void bootstrap()
