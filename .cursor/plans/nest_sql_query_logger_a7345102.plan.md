---
name: Nest SQL Query Logger
overview: Port Laravel SqlQueryLogger sang TypeORM custom logger cho NestJS backend, gắn vào TypeOrmModule, với format/color/timing tương tự bản PHP (không re-query lấy row count để tránh làm chậm DB).
todos:
  - id: fix-typeorm-version
    content: Sửa typeorm dependency sang ^0.3.x tương thích @nestjs/typeorm 12
    status: pending
  - id: create-sql-logger
    content: Tạo SqlQueryLogger implement TypeORM Logger (format, color, timing)
    status: completed
  - id: wire-app-module
    content: Gắn logger + maxQueryExecutionTime vào TypeOrmModule.forRootAsync
    status: completed
isProject: false
---

# NestJS SQL Query Logger

## Context

Laravel lắng nghe `QueryExecuted`; Nest + TypeORM dùng **custom class implement `Logger` của TypeORM**, rồi truyền vào `TypeOrmModule.forRootAsync`.

```mermaid
flowchart LR
  Query[TypeORM query] --> TypeOrmLogger[SqlQueryLogger]
  TypeOrmLogger --> Format[normalize + multiline + color]
  Format --> Console[process.stdout]
```



Stack hiện tại: Nest 11 + `@nestjs/typeorm` + MySQL trong `[backend/src/app.module.ts](backend/src/app.module.ts)`.

**Lưu ý dependency:** `package.json` đang ghi `"typeorm": "^1.1.1"` — không khớp `@nestjs/typeorm@12` (cần **typeorm ^0.3.x**). Plan sẽ sửa version này trước khi viết logger.

## Approach (đã chọn)

Port phần **hiển thị**: normalize SQL, tách dòng, highlight keyword/string/number, meta thời gian (ms), spacing theo request.

**Không port** `getSelectedRows` / `getAffectedRows` (bản Laravel chạy thêm query → chậm và dễ lệch với TypeORM). Nếu sau này cần rows, lấy từ result ở service layer, không nhét vào logger.

Timing: TypeORM `logQuery` không có ms. Dùng `maxQueryExecutionTime: 0.001` + implement `logQuerySlow` (có `time`) làm đường chính; `logQuery` để trống để tránh log trùng.

## Files

1. **Sửa** `[backend/package.json](backend/package.json)`: `typeorm` → `^0.3.20` (hoặc tương thích lock hiện tại sau `pnpm install`).
2. **Tạo** `backend/src/common/logging/sql-query.logger.ts`
  - `implements Logger` (TypeORM)
  - Port: `normalizeSql`, `formatSqlLines`, `highlightSql`, `getQueryType` / colors, `muted` flag
  - ANSI color thay Symfony `ConsoleOutput` (`chalk` hoặc escape codes thuần, không thêm dep nếu không cần)
  - `writeFirstQuerySpacing` dùng `AsyncLocalStorage` / request id từ middleware nhẹ (hoặc bỏ spacing theo request nếu muốn tối giản — mặc định: spacing cố định giữa các query)
3. **Sửa** `[backend/src/app.module.ts](backend/src/app.module.ts)`:

```ts
logging: process.env.NODE_ENV !== 'production',
logger: new SqlQueryLogger(),
maxQueryExecutionTime: 0.001,
```

Chỉ bật ở non-production (giống thường dùng SQL debug logger).

## Mapping nhanh PHP → Nest


| Laravel                      | Nest / TypeORM                                         |
| ---------------------------- | ------------------------------------------------------ |
| `handle(QueryExecuted)`      | `logQuerySlow(time, query, parameters)`                |
| `$query->toRawSql()`         | interpolate `parameters` vào `?` placeholders          |
| `ConsoleOutput` + `<fg=...>` | ANSI / Nest `Logger` + color codes                     |
| `self::$muted`               | `static muted` + try/finally nếu sau này có meta query |
| Row count helpers            | **bỏ**                                                 |


## Out of scope

- NestJS app-level `LoggerService` thay toàn bộ log HTTP
- Port đầy đủ row-count re-query
- Production SQL logging

