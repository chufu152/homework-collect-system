import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator'

export class AssignmentTargetDto {
  @IsIn(['all', 'groups', 'students'])
  mode!: 'all' | 'groups' | 'students'

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[]
}

export class FormFieldDto {
  @IsString()
  @Length(1, 40)
  name!: string

  @IsOptional()
  @IsIn(['text', 'number', 'date'])
  type?: 'text' | 'number' | 'date'

  @IsOptional()
  @IsBoolean()
  required?: boolean
}

/** 表单作业的字段配置（Access 式建表：字段 + 主键 + 排序依据）。 */
export class FormConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields!: FormFieldDto[]

  @IsString()
  @Length(1, 40)
  primaryKey!: string

  @IsOptional()
  @IsString()
  sortField?: string | null

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc'
}

export class CreateAssignmentDto {
  /** 作业归属班级；AdminGuard 会校验请求密钥是否属于该班级。 */
  @IsString()
  @Length(1, 64)
  classId!: string

  @IsString()
  @Length(1, 120)
  title!: string

  @IsIn(['online', 'offline', 'checkin', 'relay', 'leave', 'form'])
  type!: 'online' | 'offline' | 'checkin' | 'relay' | 'leave' | 'form'

  /** 表单作业专用：字段配置（保存为 JSON 文本文件）。 */
  @IsOptional()
  @ValidateNested()
  @Type(() => FormConfigDto)
  formConfig?: FormConfigDto

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string

  @IsOptional()
  @IsDateString()
  dueAt?: string | null

  @IsOptional()
  @IsIn(['text', 'file', 'both'])
  submissionMode?: 'text' | 'file' | 'both'

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @IsIn(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt', 'zip'], { each: true })
  @IsString({ each: true })
  allowedFileTypes?: string[]

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxFileCount?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxFileSizeMB?: number

  @ValidateNested()
  @Type(() => AssignmentTargetDto)
  target!: AssignmentTargetDto

  @IsOptional()
  @IsBoolean()
  publishNow?: boolean
}

export class AssignmentStateDto {
  @IsIn(['published', 'closed'])
  state!: 'published' | 'closed'
}

export class FeedbackDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number

  @IsString()
  @MaxLength(5000)
  feedbackText!: string
}

export class StudentLookupDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  studentNo?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  studentName?: string
}

export class RelayEntryDto extends StudentLookupDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  content?: string
}

export class FormSubmissionDto extends StudentLookupDto {
  /** 字段名到填写值的映射；服务端按字段配置逐项校验。 */
  @IsObject()
  values!: Record<string, string>
}

/**
 * Multipart fields for an online submission. Using a DTO (instead of an inline
 * object type) makes the global ValidationPipe apply whitelist + length rules,
 * so malformed form fields cannot reach the service and trigger a 500.
 */
export class SubmitDto extends StudentLookupDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  textContent?: string

  /** 假条类型：JSON 数组字符串，与 files 顺序一一对应，每项为 YYYY-MM-DD。 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fileDates?: string
}

export class CompletionDto {
  @IsBoolean()
  completed!: boolean
}
