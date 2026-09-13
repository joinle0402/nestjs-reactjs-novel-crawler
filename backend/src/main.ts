import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const logger = new Logger(' Bootstrap');
    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT') ?? 3000;
    const apiPrefix = configService.get<string>('API_PREFIX') ?? '/api/v1';
    app.setGlobalPrefix(apiPrefix);
    await app.listen(port);
    logger.log(`🚀 API: http://localhost:${port}/${apiPrefix}`);
}
bootstrap();
