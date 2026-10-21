import { PartialType } from '@nestjs/mapped-types';
import { CreateScheduleRequest } from './create-schedule.request';

export class UpdateScheduleRequest extends PartialType(CreateScheduleRequest) {}
