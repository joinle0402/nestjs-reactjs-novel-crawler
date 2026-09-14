import type { Logger, ObjectLiteral } from 'typeorm';

const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
} as const;

type AnsiColor = keyof typeof ANSI;

/**
 * Laravel-style SQL console logger for TypeORM.
 * Timing comes from logQuerySlow — pair with maxQueryExecutionTime: -1.
 */
export class SqlQueryLogger implements Logger {
    logQuery(): void {
        // Intentionally empty: MysqlQueryRunner logs before execution.
        // Real output (with duration) happens in logQuerySlow.
    }

    logQueryError(
        error: string | Error,
        query: string,
        parameters?: unknown[] | ObjectLiteral,
    ): void {
        const sql = this.normalizeSql(this.toRawSql(query, parameters));
        const message = error instanceof Error ? error.message : error;

        this.writeBlankLines(1);
        process.stdout.write(
            `${this.paint('Query failed:', 'cyan', true)} ${this.paint(message, 'red')}\n`,
        );
        process.stdout.write(`${this.highlightSql(sql, 'red')}\n`);
        this.writeBlankLines(1);
    }

    logQuerySlow(
        time: number,
        query: string,
        parameters?: unknown[] | ObjectLiteral,
    ): void {
        this.handle(this.toRawSql(query, parameters), time);
    }

    logSchemaBuild(message: string): void {
        process.stdout.write(`${this.paint(message, 'gray')}\n`);
    }

    logMigration(message: string): void {
        process.stdout.write(`${this.paint(message, 'gray')}\n`);
    }

    log(level: 'log' | 'info' | 'warn', message: unknown): void {
        const text = String(message);
        const color: AnsiColor =
            level === 'warn' ? 'yellow' : level === 'info' ? 'cyan' : 'white';

        process.stdout.write(`${this.paint(text, color)}\n`);
    }

    private handle(rawSql: string, time: number): void {
        const sql = this.normalizeSql(rawSql);
        const type = this.getQueryType(sql);
        const color = this.getQueryColor(type);
        const lines = this.formatSqlLines(sql);
        const meta = this.formatMeta(time);

        this.writeBlankLines(1);

        if (lines.length === 1) {
            process.stdout.write(
                `${this.paint('Query:', 'cyan', true)} ${this.highlightSql(lines[0], color)} ${this.paint('|', 'gray')} ${meta}\n`,
            );
            this.writeBlankLines(1);
            return;
        }

        process.stdout.write(`${this.paint('Query:', 'cyan', true)}\n`);

        const lastIndex = lines.length - 1;

        for (let index = 0; index < lines.length; index++) {
            const suffix =
                index === lastIndex
                    ? ` ${this.paint('|', 'gray')} ${meta}`
                    : '';

            process.stdout.write(
                `${this.highlightSqlLine(lines[index], color)}${suffix}\n`,
            );
        }

        this.writeBlankLines(1);
    }

    private formatMeta(time: number): string {
        return this.paint(`${time.toFixed(2)} ms`, this.getTimeColor(time), true);
    }

    private toRawSql(
        query: string,
        parameters?: unknown[] | ObjectLiteral,
    ): string {
        if (!parameters) {
            return query;
        }

        if (Array.isArray(parameters)) {
            let index = 0;

            return query.replace(/\?/g, () =>
                this.formatParameter(parameters[index++]),
            );
        }

        return query.replace(/:(\w+)/g, (_match, key: string) =>
            Object.prototype.hasOwnProperty.call(parameters, key)
                ? this.formatParameter(parameters[key])
                : `:${key}`,
        );
    }

    private formatParameter(value: unknown): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }

        if (typeof value === 'number' || typeof value === 'bigint') {
            return String(value);
        }

        if (typeof value === 'boolean') {
            return value ? '1' : '0';
        }

        if (value instanceof Date) {
            return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
        }

        if (Buffer.isBuffer(value)) {
            return `X'${value.toString('hex')}'`;
        }

        if (Array.isArray(value)) {
            return value.map((item) => this.formatParameter(item)).join(', ');
        }

        if (typeof value === 'object') {
            return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
        }

        return `'${String(value).replace(/'/g, "''")}'`;
    }

    private formatSqlLines(sql: string): string[] {
        const type = this.getQueryType(sql);

        if (type === 'CREATE') {
            return this.formatCreateSqlLines(sql);
        }

        if (type === 'INSERT') {
            return this.formatInsertSqlLines(sql);
        }

        if (/^SELECT\s+EXISTS\s*\(/i.test(sql)) {
            return this.formatExistsSqlLines(sql);
        }

        if (this.isSimpleQuery(sql)) {
            return [sql];
        }

        let formatted =
            sql.replace(
                /\b(FROM|WHERE|INNER JOIN|LEFT JOIN|RIGHT JOIN|JOIN|VALUES|SET|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|RETURNING)\b/g,
                '\n$1',
            ) ?? sql;

        formatted =
            formatted.replace(/\b(AND|OR)\b/g, '\n  $1') ?? formatted;

        return formatted
            .split('\n')
            .map((line) => line.trimEnd())
            .filter((line) => line.trim() !== '');
    }

    private formatCreateSqlLines(sql: string): string[] {
        const match = sql.match(
            /^CREATE\s+((?:TEMP|TEMPORARY)\s+)?TABLE\s+(.+?)\s*\((.*)\)$/i,
        );

        if (!match) {
            return [sql];
        }

        const definitions = this.splitTopLevelComma(match[3]);

        if (definitions.length === 0) {
            return [sql];
        }

        const lines = [`CREATE ${match[1] ?? ''}TABLE ${match[2]} (`];

        definitions.forEach((definition, index) => {
            const suffix = index === definitions.length - 1 ? '' : ',';
            lines.push(`    ${definition}${suffix}`);
        });

        lines.push(')');

        return lines;
    }

    private formatExistsSqlLines(sql: string): string[] {
        const match = sql.match(/^SELECT\s+EXISTS\s*\((.*)\)\s+AS\s+(.+)$/i);

        if (!match) {
            return [sql];
        }

        let innerSql = match[1].trim();
        innerSql =
            innerSql.replace(
                /\b(FROM|WHERE|INNER JOIN|LEFT JOIN|RIGHT JOIN|JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET)\b/g,
                '\n$1',
            ) ?? innerSql;
        innerSql = innerSql.replace(/\b(AND|OR)\b/g, '\n  $1') ?? innerSql;

        const lines = ['SELECT EXISTS ('];

        for (const line of innerSql.split('\n')) {
            lines.push(`    ${line.trimEnd()}`);
        }

        const alias = match[2] === 'EXISTS' ? 'exists' : match[2];
        lines.push(`) AS ${alias}`);

        return lines;
    }

    private formatInsertSqlLines(sql: string): string[] {
        const match = sql.match(/^(.*?)\s+VALUES\s+(.+)$/i);

        if (!match) {
            return [sql];
        }

        const records = this.splitTopLevelComma(match[2], true);

        if (records.length === 0) {
            return [sql];
        }

        const lines = [match[1].trim(), `VALUES ${records[0]}`];

        for (const record of records.slice(1)) {
            lines.push(`       ${record}`);
        }

        return lines;
    }

    private splitTopLevelComma(value: string, keepComma = false): string[] {
        const items: string[] = [];
        let item = '';
        let depth = 0;
        let inString = false;

        for (let index = 0; index < value.length; index++) {
            const char = value[index];
            const nextChar = value[index + 1];

            if (char === "'") {
                item += char;

                if (inString && nextChar === "'") {
                    item += nextChar;
                    index++;
                    continue;
                }

                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    depth--;
                } else if (char === ',' && depth === 0) {
                    items.push(item.trim() + (keepComma ? ',' : ''));
                    item = '';
                    continue;
                }
            }

            item += char;
        }

        const trimmed = item.trim();

        if (trimmed !== '') {
            items.push(trimmed);
        }

        return items;
    }

    private isSimpleQuery(sql: string): boolean {
        return !/\bJOIN\b|\(\s*SELECT\b/i.test(sql);
    }

    private normalizeSql(sql: string): string {
        const collapsed = sql.replace(/\s+/g, ' ').trim();
        const parts = this.splitSqlByStrings(collapsed);

        for (let index = 0; index < parts.length; index++) {
            if (index % 2 === 1) {
                continue;
            }

            let part = parts[index];
            part =
                part.replace(/["`]([a-zA-Z_][a-zA-Z0-9_]*)["`]/g, '$1') ?? part;
            part =
                part.replace(
                    /\b(group\s+by|order\s+by|inner\s+join|left\s+join|right\s+join|primary\s+key|foreign\s+key|not\s+null|on\s+delete|create|temporary|temp|table|unique|index|select|from|where|insert|into|values|update|set|delete|join|references|cascade|exists|on|and|or|having|limit|offset|count|as|null|returning|integer|datetime|text|autoincrement)\b/gi,
                    (keyword) => keyword.replace(/\s+/g, ' ').toUpperCase(),
                ) ?? part;

            parts[index] = part;
        }

        return parts.join('');
    }

    private highlightSql(sql: string, keywordColor: AnsiColor): string {
        const parts = this.splitSqlByStrings(sql);

        for (let index = 0; index < parts.length; index++) {
            if (index % 2 === 1) {
                parts[index] = this.paint(parts[index], 'green');
                continue;
            }

            let part = parts[index];
            part =
                part.replace(
                    /\b(PRIMARY KEY|FOREIGN KEY|NOT NULL|ON DELETE|GROUP BY|ORDER BY|INNER JOIN|LEFT JOIN|RIGHT JOIN|CREATE|TEMPORARY|TEMP|TABLE|UNIQUE|INDEX|SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|INNER|LEFT|RIGHT|ON|AND|OR|HAVING|LIMIT|OFFSET|COUNT|AS|NULL|RETURNING|EXISTS|REFERENCES|CASCADE)\b/g,
                    (keyword) => this.paint(keyword, keywordColor, true),
                ) ?? part;

            part =
                part.replace(
                    /(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g,
                    (number) => this.paint(number, 'magenta'),
                ) ?? part;

            parts[index] = part;
        }

        return parts.join('');
    }

    private highlightSqlLine(sql: string, keywordColor: AnsiColor): string {
        const indent = sql.match(/^\s*/)?.[0] ?? '';

        if (indent === '') {
            return this.highlightSql(sql, keywordColor);
        }

        return `${ANSI.reset}${indent}${this.highlightSql(sql.trimStart(), keywordColor)}`;
    }

    private splitSqlByStrings(sql: string): string[] {
        return sql.split(/('(?:''|[^'])*')/);
    }

    private getQueryType(sql: string): string {
        return (sql.trimStart().split(/[\s\n\t]/, 1)[0] || 'QUERY').toUpperCase();
    }

    private getQueryColor(type: string): AnsiColor {
        switch (type) {
            case 'SELECT':
                return 'green';
            case 'INSERT':
                return 'blue';
            case 'UPDATE':
                return 'magenta';
            case 'DELETE':
                return 'red';
            default:
                return 'white';
        }
    }

    private getTimeColor(time: number): AnsiColor {
        if (time >= 500) {
            return 'red';
        }

        if (time >= 100) {
            return 'yellow';
        }

        return 'cyan';
    }

    private paint(text: string, color: AnsiColor, bold = false): string {
        return `${bold ? ANSI.bold : ''}${ANSI[color]}${text}${ANSI.reset}`;
    }

    private writeBlankLines(count: number): void {
        for (let line = 0; line < count; line++) {
            process.stdout.write('\n');
        }
    }
}
