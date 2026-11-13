import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Res, UploadedFiles, UseGuards, UseInterceptors, ValidationPipe } from '@nestjs/common'
import { AnyFilesInterceptor } from '@nestjs/platform-express/multer/interceptors/any-files.interceptor'
import type { Express, Response } from 'express'
import { AdminGuard } from '../common/admin.guard.js'
import { isRedirectDownload, sendDownload, sendRedirectPayload } from '../common/file-response.js'
import { AssignmentsService } from './assignments.service.js'
import { AssignmentStateDto, CompletionDto, CreateAssignmentDto, FeedbackDto, FormSubmissionDto, RelayEntryDto, StudentLookupDto, SubmitDto } from './assignments.dto.js'

@Controller()
@UseGuards(AdminGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('assignments')
  list(
    @Query('classId') classId?: string,
    @Query('type') type?: string,
    @Query('state') state?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.assignments.list({ classId, type, state, page, pageSize })
  }

  @Post('assignments')
  create(@Body() input: CreateAssignmentDto) {
    return this.assignments.create(input)
  }

  @Patch('assignments/:assignmentId/state')
  setState(@Param('assignmentId') assignmentId: string, @Body() input: AssignmentStateDto) {
    return this.assignments.setState(assignmentId, input)
  }

  @Delete('assignments/:assignmentId')
  remove(@Param('assignmentId') assignmentId: string) {
    return this.assignments.remove(assignmentId)
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
    if (isRedirectDownload(file)) {
      sendRedirectPayload(response, file.redirectUrl)
      return
    }
    sendDownload(response, file)
  }

  @Get('submissions/:submissionId/versions')
  versions(@Param('submissionId') submissionId: string) {
    return this.assignments.listVersions(submissionId)
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
          : format === 'xlsx' ? await this.assignments.exportFormXlsx(assignmentId)
            : null
    if (!file) {
      response.status(400).json({ code: 'BAD_REQUEST', message: 'format must be csv, zip, docx, or xlsx.', details: [], requestId: response.getHeader('X-Request-Id') ?? '' })
      return
    }
    const contentType = format === 'csv' ? 'text/csv; charset=utf-8'
      : format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/zip'
    sendDownload(response, { content: file.content, contentType, downloadName: file.filename, sizeBytes: file.content.byteLength })
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
      files: 30,
      fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 20971520),
    },
  }))
  submit(
    @Param('shareCode') shareCode: string,
    @Body() input: SubmitDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.assignments.submit(shareCode, input, files ?? [])
  }

  /** 表单作业：读取自己已提交的记录（用于回显修改）。 */
  @Post(':shareCode/form-record')
  formRecord(@Param('shareCode') shareCode: string, @Body(new ValidationPipe({ whitelist: true, transform: true })) input: StudentLookupDto) {
    return this.assignments.formRecord(shareCode, input)
  }

  /** 表单作业：提供目标名单，供学号/姓名字段下拉选择。 */
  @Get(':shareCode/form-roster')
  formRoster(@Param('shareCode') shareCode: string) {
    return this.assignments.formRoster(shareCode)
  }

  /** 表单作业：首次提交追加写入数据文件，重复提交原地改写；文件字段走 multipart。 */
  @Post(':shareCode/form-submissions')
  @UseInterceptors(AnyFilesInterceptor({
    limits: {
      files: 30,
      fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 20971520),
    },
  }))
  async submitForm(
    @Param('shareCode') shareCode: string,
    @Body() rawBody: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    // 兼容两种提交方式：JSON（values 为对象）与 multipart（values 为 JSON 字符串 + file__字段名 文件）。
    let values: unknown = rawBody.values
    if (typeof values === 'string') {
      try {
        values = JSON.parse(values)
      } catch {
        throw new BadRequestException('表单数据格式不正确。')
      }
    }
    const parsed = await new ValidationPipe({ whitelist: true, transform: true })
      .transform({ ...rawBody, values }, { type: 'body', metatype: FormSubmissionDto }) as FormSubmissionDto
    return this.assignments.submitForm(shareCode, parsed, files ?? [])
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
    if (isRedirectDownload(file)) {
      sendRedirectPayload(response, file.redirectUrl)
      return
    }
    sendDownload(response, file)
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
    if (isRedirectDownload(file)) {
      sendRedirectPayload(response, file.redirectUrl)
      return
    }
    sendDownload(response, file)
  }
}

