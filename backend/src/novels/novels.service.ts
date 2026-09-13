import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { throwUnless } from '../common/utils/throw-if';
import { Novel } from './entities/novel.entity';
import { CreateNovelRequest } from './dtos/requests/create-novel.request';
import { UpdateNovelRequest } from './dtos/requests/update-novel.request';

@Injectable()
export class NovelsService {
    constructor(
        @InjectRepository(Novel)
        private readonly novelsRepository: Repository<Novel>,
    ) { }

    async findAll(): Promise<Novel[]> {
        return this.novelsRepository.find({
            order: { id: 'DESC' },
        });
    }

    async findOne(id: number): Promise<Novel> {
        const model = await this.novelsRepository.findOne({ where: { id } });
        throwUnless(model, 'Novel not found', HttpStatus.NOT_FOUND);
        return model;
    }

    async create(request: CreateNovelRequest): Promise<Novel> {
        const model = this.novelsRepository.create(request);
        return this.novelsRepository.save(model);
    }

    async update(id: number, request: UpdateNovelRequest): Promise<Novel> {
        const model = await this.findOne(id);
        Object.assign(model, request);
        return this.novelsRepository.save(model);
    }

    async delete(id: number): Promise<void> {
        const model = await this.findOne(id);
        await this.novelsRepository.remove(model);
    }
}
