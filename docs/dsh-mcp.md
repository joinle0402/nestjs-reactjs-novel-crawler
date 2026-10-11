# MCP servers trên DeepSeek Harness (DSH)

## Vì sao cần file này

`.cursor/mcp.json` chỉ Cursor đọc. Harness (DSH) **không** đọc file đó và cũng không có cấu hình
MCP ở cấp project: mỗi MCP server là một entry plugin `@deepseek-ai/dsh-mcp-client` trong
*profile patch* của người dùng. Vì vậy cấu hình MCP không commit được vào repo — file này là bản
ghi để dựng lại trên máy khác.

## Đường dẫn profile patch

```
%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml
```

Đây là mảng YAML các patch entry, áp sau mọi bundle layer. Thêm entry vào cuối mảng, giữ nguyên
các entry `ui-*` sẵn có.

## Entry cần thêm

```yaml
- id: mcp-codebase-memory
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: codebase-memory-mcp
    transport: stdio
    command: 'C:/Users/ASUS/AppData/Local/Programs/codebase-memory-mcp/codebase-memory-mcp.exe'
    args: []
- id: mcp-context-mode
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: context-mode
    transport: stdio
    command: cmd
    args: ['/c', 'npx', '-y', 'context-mode']
    toolCallTimeoutMs: 120000
```

Hai entry này khớp với hai server trong `.cursor/mcp.json` để Cursor và harness dùng cùng bộ
tool.

## Tên tool sau khi nạp

Tool hiện dưới dạng `mcp__<serverName>__<rawName>`:

| Nguồn | Ví dụ tên tool |
| --- | --- |
| Codebase Memory | `mcp__codebase-memory-mcp__search_graph`, `..._trace_path`, `..._search_code`, `..._detect_changes` |
| context-mode | `mcp__context-mode__ctx_execute`, `..._ctx_batch_execute`, `..._ctx_index`, `..._ctx_search`, `..._ctx_fetch_and_index` |

Codebase Memory là nguồn chính cho codebase discovery; context-mode chỉ để giữ output thô lớn ra
khỏi context. Chi tiết routing: xem [`AGENTS.md`](../AGENTS.md).

## Trạng thái xác minh (2026-10-11)

| Server | Trạng thái | Ghi chú |
| --- | --- | --- |
| `codebase-memory-mcp` | ✅ đã kiểm chứng | Binary `0.10.6` chạy được; index của project đã có sẵn ở `%USERPROFILE%\.cache\codebase-memory-mcp\C-Users-ASUS-Desktop-workspace-project-novel-crawler.db` |
| `context-mode` | ⚠️ chưa xác minh | Trong Cursor, MCP service báo `project-0-novel-crawler-context-mode none → disconnected` và **chưa từng** có process nào chạy: không có `mcp-server-*-context-mode.log`, cũng không có package trong `%LOCALAPPDATA%\npm-cache\_npx`. Nhiều khả năng entry này chưa hoạt động ở đâu cả |

Nếu sau khi restart harness mà tool `mcp__context-mode__*` không xuất hiện, xử lý theo thứ tự:

1. Chạy `npx -y context-mode doctor` trong terminal thường (ngoài sandbox) để xem lỗi thật.
2. Cài global rồi trỏ config vào bản đã cài, tránh cold-start `npx`:

   ```powershell
   npm i -g context-mode
   ```

   ```yaml
   - id: mcp-context-mode
     name: '@deepseek-ai/dsh-mcp-client'
     config:
       serverName: context-mode
       transport: stdio
       command: cmd
       args: ["/c", "context-mode"]
   ```

   (package yêu cầu Node >= 22.5.0; máy này đang có v22.17.0, và `context-mode` kéo theo
   `better-sqlite3` nên lần cài đầu cần biên dịch/tải prebuilt.)

## Lưu ý khi vận hành

- `serverName` phải khớp `[A-Za-z0-9_-]{1,32}` và không trùng nhau trong cùng scope.
- Entry MCP được nạp lúc harness khởi động. Sửa file patch khi harness đang chạy thì **không** có
  hiệu lực ngay — cần restart harness (đã kiểm chứng: sau khi thêm entry, không có process MCP
  nào được spawn trong instance đang chạy). Khi harness đã nạp rồi thì việc đổi config trong
  phiên sẽ reload kết nối tại chỗ; đổi `serverName` sẽ đổi tên tool và làm mất hiệu lực
  permission rule cũ.
- `failOnStartupError` mặc định `false`: server lỗi thì harness vẫn chạy, chỉ thiếu tool. Đặt
  `true` nếu muốn fail cứng lúc khởi động.
- Env truyền cho tiến trình stdio bị scrub: mọi biến khớp `/KEY|PASSWORD|SECRET|TOKEN/i` và mọi
  biến `DSH_*` bị xoá trước khi merge `env:` trong config. Cần token thì khai qua `env:`.
- `command: cmd` + `npx -y` sẽ tải package ở lần chạy đầu, và stdio của DSH chạy một probe
  process trước process thật nên `npx` bị gọi hai lần. Nếu khởi động chậm, cài global rồi trỏ
  `command`/`args` thẳng vào script đã cài.
- Index của Codebase Memory nằm ở `%USERPROFILE%\.cache\codebase-memory-mcp\<project-slug>.db`
  (project này: `C-Users-ASUS-Desktop-workspace-project-novel-crawler.db`).
