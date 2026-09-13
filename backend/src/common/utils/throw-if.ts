import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Throws an HttpException when condition is truthy.
 */
export function throwIf(
    condition: unknown,
    message: string,
    status: HttpStatus | number = HttpStatus.BAD_REQUEST,
): asserts condition is false {
    if (condition) {
        throw new HttpException(message, status);
    }
}

/**
 * Throws an HttpException when condition is falsy.
 * Narrows the value to its truthy type after the call.
 */
export function throwUnless(
    condition: unknown,
    message: string,
    status: HttpStatus | number = HttpStatus.BAD_REQUEST,
): asserts condition {
    if (!condition) {
        throw new HttpException(message, status);
    }
}
