import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateScheduleRequest } from './dtos/requests/create-schedule.request';
import { UpdateScheduleRequest } from './dtos/requests/update-schedule.request';
import { ScheduleResponse } from './dtos/responses/schedule.response';
import { SchedulesService } from './schedules.service';

@ApiTags('Schedules')
@Controller('schedules')
export class SchedulesController {
    constructor(private readonly schedulesService: SchedulesService) {}

    @Get()
    @ApiOperation({ summary: 'Danh sách lịch tự động (cào → TTS → Drive)' })
    @ApiOkResponse({ type: [ScheduleResponse] })
    list(): Promise<ScheduleResponse[]> {
        return this.schedulesService.list();
    }

    @Post()
    @ApiOperation({ summary: 'Tạo lịch định kỳ. Lịch mới mặc định hoạt động.' })
    @ApiOkResponse({ type: ScheduleResponse })
    create(@Body() request: CreateScheduleRequest): Promise<ScheduleResponse> {
        return this.schedulesService.create(request);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Sửa lịch, bật/tắt hoạt động' })
    @ApiOkResponse({ type: ScheduleResponse })
    update(@Param('id', ParseIntPipe) id: number, @Body() request: UpdateScheduleRequest): Promise<ScheduleResponse> {
        return this.schedulesService.update(id, request);
    }

    @Delete(':id')
    @HttpCode(200)
    @ApiOperation({ summary: 'Xóa lịch định kỳ' })
    delete(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
        return this.schedulesService.remove(id);
    }

    @Post(':id/run')
    @HttpCode(200)
    @ApiOperation({ summary: 'Chạy ngay một lần, không đổi lịch kế tiếp' })
    @ApiOkResponse({ type: ScheduleResponse })
    runNow(@Param('id', ParseIntPipe) id: number): Promise<ScheduleResponse> {
        return this.schedulesService.runNow(id);
    }
}
