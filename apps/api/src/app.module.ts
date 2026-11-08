import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { AdminGuard } from './common/admin.guard.js'
import { HttpExceptionEnvelopeFilter } from './common/http-exception.filter.js'
import { requestIdMiddleware } from './common/request.middleware.js'
import { ResponseInterceptor } from './common/response.interceptor.js'
import { ClassesController } from './classes/classes.controller.js'
import { ClassesService } from './classes/classes.service.js'
import { AssignmentsController, FilesController, PublicAssignmentsController, PublicFilesController, PublicSubmissionsController } from './assignments/assignments.controller.js'
import { AssignmentsService } from './assignments/assignments.service.js'
import { PrismaService } from './prisma/prisma.service.js'
import { StorageService } from './storage/storage.service.js'
import { ExportsService } from './exports/exports.service.js'

@Module({
  controllers: [
    ClassesController,
    AssignmentsController,
    PublicAssignmentsController,
    PublicSubmissionsController,
    PublicFilesController,
    FilesController,
  ],
  providers: [
    AdminGuard,
    ClassesService,
    AssignmentsService,
    PrismaService,
    StorageService,
    ExportsService,
    HttpExceptionEnvelopeFilter,
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestIdMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL })
  }
}
