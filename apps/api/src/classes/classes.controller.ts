import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, ValidationPipe, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../common/admin.guard.js'
import { CreateGroupDto, ImportClassDto, ImportStudentsDto, UpdateStudentDto, VerifyClassKeyDto } from './classes.dto.js'
import { ClassesService } from './classes.service.js'

/** 公开端点：班级导入 / 密钥校验本身就是鉴权手段，不经过 AdminGuard。 */
@Controller('classes')
export class ClassImportController {
  constructor(private readonly classes: ClassesService) {}

  @Post('import')
  import(@Body(new ValidationPipe({ whitelist: true, transform: true })) input: ImportClassDto) {
    return this.classes.importClass(input)
  }

  @Post('verify')
  verify(@Body(new ValidationPipe({ whitelist: true, transform: true })) input: VerifyClassKeyDto) {
    return this.classes.verifyClassKey(input)
  }
}

/** 教师管理端点：AdminGuard 按路由解析班级并校验该班级的独立密钥。 */
@Controller()
@UseGuards(AdminGuard)
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get('classes/:classId/students')
  listStudents(
    @Param('classId') classId: string,
    @Query('keyword') keyword?: string,
    @Query('groupId') groupId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.classes.listStudents(classId, { keyword, groupId, page, pageSize })
  }

  @Put('classes/:classId/students')
  importStudents(@Param('classId') classId: string, @Body() input: ImportStudentsDto) {
    return this.classes.importStudents(classId, input)
  }

  @Delete('classes/:classId/students/:studentId')
  deleteStudent(@Param('classId') classId: string, @Param('studentId') studentId: string) {
    return this.classes.deleteStudent(classId, studentId)
  }

  @Patch('classes/:classId/students/:studentId')
  updateStudent(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) input: UpdateStudentDto,
  ) {
    return this.classes.updateStudent(classId, studentId, input)
  }

  @Get('classes/:classId/groups')
  listGroups(@Param('classId') classId: string) {
    return this.classes.listGroups(classId)
  }

  @Post('classes/:classId/groups')
  createGroups(@Param('classId') classId: string, @Body() input: CreateGroupDto) {
    return this.classes.createGroups(classId, input)
  }

  @Delete('classes/:classId')
  deleteClass(@Param('classId') classId: string) {
    return this.classes.deleteClass(classId)
  }
}
