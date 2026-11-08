import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator'

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

export class CreateAssignmentDto {
  @IsString()
  @Length(1, 120)
  title!: string

  @IsIn(['online', 'offline', 'checkin', 'relay'])
  type!: 'online' | 'offline' | 'checkin' | 'relay'

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

export class CompletionDto {
  @IsBoolean()
  completed!: boolean
}
