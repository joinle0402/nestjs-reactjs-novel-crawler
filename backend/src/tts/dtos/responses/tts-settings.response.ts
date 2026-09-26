import { ApiProperty } from '@nestjs/swagger';

export class TtsVoiceOption {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    label!: string;
}

export class TtsEngineOption {
    @ApiProperty({ example: 'vieneu' })
    id!: string;

    @ApiProperty()
    label!: string;

    @ApiProperty({ description: 'false với VieNeu: tốc độ % không đổi nhịp đọc' })
    rateApplies!: boolean;

    @ApiProperty({ type: [TtsVoiceOption] })
    voices!: TtsVoiceOption[];
}

export class TtsSettingsResponse {
    @ApiProperty({ example: 'vieneu' })
    engine!: string;

    @ApiProperty()
    voice!: string;

    @ApiProperty({ example: '+50%' })
    rate!: string;

    @ApiProperty()
    bgmEnabled!: boolean;

    @ApiProperty({ type: [TtsVoiceOption] })
    voices!: TtsVoiceOption[];

    @ApiProperty({ type: [TtsEngineOption] })
    engines!: TtsEngineOption[];
}
