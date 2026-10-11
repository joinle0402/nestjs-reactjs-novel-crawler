# Agent Instructions — novel-crawler

Repo-wide instructions for coding agents. This file is the harness-facing (DSH) equivalent of
`.cursor/rules/*.mdc`, which only Cursor reads. When a rule changes, update both sides or retire
the `.mdc` copy.

## 1. Env & secrets (bắt buộc)

- Agent TUYỆT ĐỐI KHÔNG in, hiển thị, hoặc ghi log giá trị của các biến môi trường nhạy cảm
  (như HF_TOKEN, API keys, passwords, database credentials) ra màn hình chat, console, log file
  hay terminal.
- Khi cần dùng biến môi trường (ví dụ `HF_TOKEN` hoặc `HUGGINGFACE_HUB_TOKEN`), chỉ tham chiếu
  đến tên biến (`process.env.HF_TOKEN`, `os.environ.get("HF_TOKEN")`), không bao giờ hardcode
  giá trị thật vào code hay file commit.
- Không bao giờ hiển thị nội dung các file `.env`.
- Không đưa secrets/`.env` qua context-mode (`ctx_*`): nội dung chạy qua đó được persist vào
  SQLite index cục bộ.

## 2. Codebase discovery — Codebase Memory MCP là chính

Graph project: `C-Users-ASUS-Desktop-workspace-project-novel-crawler`
Tool namespace trên harness: `mcp__codebase-memory-mcp__*`

Chọn nguồn nhỏ nhất trả lời được câu hỏi:

| Câu hỏi | Cách làm |
| --- | --- |
| Symbol, class, route, caller/callee | `search_graph` với `limit` nhỏ, rồi `trace_path` / `get_code_snippet` theo `qualified_name` |
| Chuỗi literal, UI text, log, config key | `search_code` với `mode="compact"` |
| Đã biết đường dẫn file | `read` đúng range cần thiết bằng `offset` / `limit` |
| Kiến trúc tổng quan | `get_architecture` với `aspect="overview"`, chỉ khi cần |
| Impact / blast radius | `detect_changes` trước thay đổi không tầm thường |
| Truy vấn graph nhiều bước | `query_graph` chỉ khi các tool đơn giản không đủ |

- Dùng `check_index_coverage` khi kết quả âm hoặc phân tích impact phụ thuộc vào path đã index.
  Nếu coverage báo `parse_partial`/`skipped`, đọc trực tiếp source bị ảnh hưởng.
- `list_projects` / `index_status` chỉ gọi một lần khi cần xác minh session/project.
- Fallback: `read` khi cần đúng ngữ cảnh source hoặc đã biết path; `grep` chỉ khi MCP không trả
  lời được, index chưa đủ, hoặc cần tìm raw text chính xác. Không bao giờ grep cả repo để tìm
  symbol mà Codebase Memory resolve được.
- Dừng discovery khi đã đủ context; không lặp lại truy vấn đã biết kết quả.

## 3. Output lớn — route qua context-mode

Tool namespace trên harness: `mcp__context-mode__*`. Chỉ dùng để giữ output thô lớn ra khỏi
context window; **không** dùng cho codebase discovery.

| Việc | Tool |
| --- | --- |
| Nhiều lệnh shell (build, test, install log) | `ctx_batch_execute` |
| Một lệnh dài/dài dòng | `ctx_execute` |
| Index một file log/output lớn đã có | `ctx_index` |
| Tìm trong output đã index | `ctx_search` |
| Fetch + index một web page / API response | `ctx_fetch_and_index` |

- Ưu tiên `ctx_batch_execute` thay vì chuỗi `pwsh` khi mỗi lệnh cho ra hơn một màn hình output.
- Output nhỏ, đúng trọng tâm (`git status`, `ls`, một kết quả test) dùng tool thường — đừng route
  quá tay.
- `ctx_stats` / `ctx_doctor` chỉ để kiểm tra server còn khỏe; không gọi liên tục.

## 4. Project skills

Canonical location: `.agents/skills/` — chuẩn Agent Skills, được cả Cursor và harness (DSH) nạp ở
cấp project. `.cursor/skills/` là path project-level tương đương của Cursor; đọc path nào có skill
cũng đúng.

Trước khi khảo sát hoặc sửa Crawl / TTS / Drive, đọc skill tương ứng:

- `.agents/skills/crawler-workflow` (hoặc `.cursor/skills/crawler-workflow`)
- `.agents/skills/tts-workflow` (hoặc `.cursor/skills/tts-workflow`)
- `.agents/skills/drive-workflow` (hoặc `.cursor/skills/drive-workflow`)

Nếu một thay đổi làm một fact trong skill thành sai: chỉ patch đúng bullet/map row đã cũ và
append một dòng changelog. Không viết lại skill. Contract còn đúng thì để nguyên.

## 5. Tên tool khác nhau giữa các agent

Rule gốc trong `.cursor/rules/*.mdc` viết theo tên tool của Cursor. Trên harness (DSH) tên
tương ứng là:

| Cursor | Harness (DSH) |
| --- | --- |
| `Shell` | `pwsh` |
| `Read` | `read` |
| `Grep` | `grep` |
| `Glob` | `glob` |
| `WebFetch` | `web_fetch` |
| `WebSearch` | `web_search` |

## 6. MCP

MCP server không cấu hình trong repo và `.cursor/mcp.json` không được harness đọc. Harness đọc
entry `@deepseek-ai/dsh-mcp-client` trong profile patch của người dùng — xem
[`docs/dsh-mcp.md`](docs/dsh-mcp.md) để dựng lại trên máy khác.
