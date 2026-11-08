import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'
import { AnyFilesInterceptor } from '@nestjs/platform-express/multer/interceptors/any-files.interceptor'
import type { Express, Response } from 'express'
import { AdminGuard } from '../common/admin.guard.js'
import { AssignmentsService } from './assignments.service.js'
import { AssignmentStateDto, CompletionDto, CreateAssignmentDto, FeedbackDto, RelayEntryDto, StudentLookupDto } from './assignments.dto.js'

@Controller()
@UseGuards(AdminGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('assignments')
  list(
    @Query('type') type?: string,
    @Query('state') state?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.assignments.list({ type, state, page, pageSize })
  }

  @Post('assignments')
  create(@Body() input: CreateAssignmentDto) {
    return this.assignments.create(input)
  }

  @Patch('assignments/:assignmentId/state')
  setState(@Param('assignmentId') assignmentId: string, @Body() input: AssignmentStateDto) {
    return this.assignments.setState(assignmentId, input)
  }

  @Get('assignments/:assignmentId/dashboard')
  dashboard(@Param('assignmentId') assignmentId: string) {
    return this.assignments.dashboard(assignmentId)
  }

  @Get('assignments/:assignmentId/submissions/:submissionId/download')
  async downloadSubmissionFile(
    @Param('assignmentId') assignmentId: string,
    @Param('submissionId') submissionId: string,
    @Query('fileId') fileId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.assignments.getSubmissionDownload(assignmentId, submissionId, fileId)
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.downloadName)}`)
    response.setHeader('Content-Length', file.content.byteLength)
    response.send(file.content)
  }

  @Patch('submissions/:submissionId/feedback')
  feedback(@Param('submissionId') submissionId: string, @Body() input: FeedbackDto) {
    return this.assignments.feedback(submissionId, input)
  }

  @Put('assignments/:assignmentId/completions/:studentId')
  completion(
    @Param('assignmentId') assignmentId: string,
    @Param('studentId') studentId: string,
    @Body() input: CompletionDto,
  ) {
    return this.assignments.setCompletion(assignmentId, studentId, input.completed)
  }

  @Get('assignments/:assignmentId/exports')
  async export(
    @Param('assignmentId') assignmentId: string,
    @Query('format') format: string,
    @Query('submissionId') submissionId: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const file = format === 'csv' ? await this.assignments.exportCsv(assignmentId)
      : format === 'docx' ? await this.assignments.exportDocx(assignmentId, submissionId)
        : format === 'zip' ? await this.assignments.exportZip(assignmentId)
          : null
    if (!file) {
      response.status(400).json({ code: 'BAD_REQUEST', message: 'format must be csv, zip, or docx.', details: [], requestId: response.getHeader('X-Request-Id') ?? '' })
      return
    }
    const contentType = format === 'csv' ? 'text/csv; charset=utf-8'
      : format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/zip'
    response.setHeader('Content-Type', contentType)
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
    response.setHeader('Content-Length', file.content.byteLength)
    response.send(file.content)
  }
}

@Controller('public/assignments')
export class PublicAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get(':shareCode')
  details(@Param('shareCode') shareCode: string) {
    return this.assignments.publicDetails(shareCode)
  }

  @Post(':shareCode/submissions')
  @UseInterceptors(AnyFilesInterceptor({
    limits: {
      files: 10,
      fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 20971520),
    },
  }))
  submit(
    @Param('shareCode') shareCode: string,
    @Body() input: { studentNo?: string; studentName?: string; textContent?: string },
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.assignments.submit(shareCode, input, files ?? [])
  }

  @Post(':shareCode/check-ins')
  checkIn(@Param('shareCode') shareCode: string, @Body() input: StudentLookupDto) {
    return this.assignments.checkIn(shareCode, input)
  }

  @Get(':shareCode/relay-entries')
  relayEntries(@Param('shareCode') shareCode: string) {
    return this.assignments.relayEntries(shareCode)
  }

  @Post(':shareCode/relay-entries')
  joinRelay(@Param('shareCode') shareCode: string, @Body() input: RelayEntryDto) {
    return this.assignments.joinRelay(shareCode, input)
  }
}

@Controller('public/submissions')
export class PublicSubmissionsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get(':receiptCode')
  receipt(@Param('receiptCode') receiptCode: string) {
    return this.assignments.receipt(receiptCode)
  }
}

@Controller('public/files')
export class PublicFilesController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get(':fileId/download')
  async download(
    @Param('fileId') fileId: string,
    @Query('receiptCode') receiptCode: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.assignments.getDownload(fileId, receiptCode)
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.downloadName)}`)
    response.setHeader('Content-Length', file.content.byteLength)
    response.send(file.content)
  }
}

@Controller('files')
export class FilesController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get(':fileId/download')
  async download(
    @Param('fileId') fileId: string,
    @Query('receiptCode') receiptCode: string | undefined,
    @Headers('x-demo-admin-token') adminToken: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.assignments.getDownload(fileId, receiptCode, adminToken)
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.downloadName)}`)
    response.setHeader('Content-Length', file.content.byteLength)
    response.send(file.content)
  }
}

