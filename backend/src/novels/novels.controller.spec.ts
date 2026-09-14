import { Test, TestingModule } from '@nestjs/testing';
import { NovelsController } from './novels.controller';
import { NovelsService } from './novels.service';

describe('NovelsController', () => {
    let controller: NovelsController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [NovelsController],
            providers: [
                {
                    provide: NovelsService,
                    useValue: {
                        findAll: jest.fn(),
                        findOne: jest.fn(),
                        create: jest.fn(),
                        update: jest.fn(),
                        delete: jest.fn(),
                        getStats: jest.fn(),
                        getPlayback: jest.fn(),
                        upsertPlayback: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get<NovelsController>(NovelsController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
