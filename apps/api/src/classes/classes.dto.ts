import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator'

export class BootstrapDto {
  @IsString()
  @Length(1, 80)
  className!: string
}

export class StudentRowDto {
  @IsString()
  @Length(1, 40)
  studentNo!: string

  @IsString()
  @Length(1, 80)
  name!: string
}

export class ImportStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StudentRowDto)
  students!: StudentRowDto[]
}

export class CreateGroupDto {
  @IsString()
  @Length(1, 40)
  name!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[]

  @IsOptional()
  @IsIn(['manual', 'balanced_random'])
  strategy?: 'manual' | 'balanced_random'

  @IsOptional()
  @IsInt()
  @Min(2)
  groupCount?: number
}
