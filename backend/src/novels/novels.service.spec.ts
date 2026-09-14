import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NovelsService } from './novels.service';
import { Novel } from './entities/novel.entity';
import { Chapter } from '../chapters/chapters.entity';
import { PlaybackState } from './entities/playback-state.entity';

describe('NovelsService', () => {
    let service: NovelsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NovelsService,
                { provide: getRepositoryToken(Novel), useValue: {} },
                { provide: getRepositoryToken(Chapter), useValue: {} },
                { provide: getRepositoryToken(PlaybackState), useValue: {} },
            ],
        }).compile();

        service = module.get<NovelsService>(NovelsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
