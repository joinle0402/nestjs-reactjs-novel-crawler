import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateNovelRequest {
    @IsUrl()
    @IsNotEmpty()
    url!: string;

    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsOptional()
    @IsString()
    author?: string;

    @IsOptional()
    @IsString()
    summary?: string;
}