import { PartialType } from "@nestjs/mapped-types";
import { CreateNovelRequest } from "./create-novel.request";

export class UpdateNovelRequest extends PartialType(CreateNovelRequest) { }