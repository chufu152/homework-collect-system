import { Body, Controller, Delete, Get, Param, Post, Put, Query, ValidationPipe, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../common/admin.guard.js'
import { BootstrapDto, CreateGroupDto, ImportStudentsDto } from './classes.dto.js'
import { ClassesService } from './classes.service.js'

@Controller()
@UseGuards(AdminGuard)
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Post('demo/bootstrap')
  bootstrap(@Body(new ValidationPipe({ whitelist: true, transform: true })) input: BootstrapDto) {
    return this.classes.bootstrap(input)
  }

  @Get('classes/current')
  current() {
    return this.classes.current()
  }

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

  @Get('classes/:classId/groups')
  listGroups(@Param('classId') classId: string) {
    return this.classes.listGroups(classId)
  }

  @Post('classes/:classId/groups')
  createGroups(@Param('classId') classId: string, @Body() input: CreateGroupDto) {
    return this.classes.createGroups(classId, input)
  }
}
