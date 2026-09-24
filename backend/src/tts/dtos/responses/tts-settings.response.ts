import { ApiProperty } from '@nestjs/swagger';

export class TtsVoiceOption {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    label!: string;
}

export class TtsSettingsResponse {
    @ApiProperty({ example: 'edge-tts' })
    engine!: string;

    @ApiProperty()
    voice!: string;

    @ApiProperty({ example: '+50%' })
    rate!: string;

    @ApiProperty()
    bgmEnabled!: boolean;

    @ApiProperty({ type: [TtsVoiceOption] })
    voices!: TtsVoiceOption[];
}
