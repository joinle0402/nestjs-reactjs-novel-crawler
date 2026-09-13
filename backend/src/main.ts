import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const logger = new Logger(' Bootstrap');
    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT') ?? 3000;
    const apiPrefix = configService.get<string>('API_PREFIX') ?? '/api/v1';
    app.setGlobalPrefix(apiPrefix);
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );
    app.enableCors({
        origin: ['http://localhost:5173'],
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false,
    });
    const config = new DocumentBuilder()
        .setTitle('Novel Crawler API')
        .setDescription('API cho hệ thống Novel Crawler')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
    await app.listen(port);
    logger.log(`🚀 API: http://localhost:${port}/${apiPrefix}`);
    logger.log(`🚀 Docs: http://localhost:${port}/${apiPrefix}/docs`);
}
bootstrap();
