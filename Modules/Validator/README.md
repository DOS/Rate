# Python Validator Worker

## Mục đích
Xử lý batch validation cho raw_items từ Redis Stream, ghi kết quả vào PostgreSQL.

## Cấu trúc
- `worker.py`: Worker async, batch 500, validate đơn giản (phone, bank_account, trường thiếu).
- `requirements.txt`: Thư viện Python cần thiết.
- `Dockerfile`: Build image Python worker, healthcheck Redis/Postgres.

## Cách chạy local
```sh
pip install -r requirements.txt
python worker.py
```

## Chạy bằng Docker
```sh
docker build -t rate-validator-worker .
docker run --env REDIS_URL=redis://host.docker.internal:6379/0 --env POSTGRES_DSN=postgresql://postgres:postgres@localhost:5432/rate rate-validator-worker
```

## Biến môi trường
- `REDIS_URL`: Kết nối Redis Stream
- `POSTGRES_DSN`: Kết nối Postgres
- `REDIS_STREAM`: Tên stream (default: raw_items)
- `BATCH_SIZE`: Batch size (default: 500)

## Healthcheck
- Healthcheck kiểm tra import Redis/Postgres thành công
- Có thể mở rộng: ping Redis, truy vấn Postgres

---

## Checklist triển khai (MVP Validator)
1. Đảm bảo đã có bảng `raw_items`, `raw_item_errors` trong Postgres
2. Đảm bảo Redis Stream `raw_items` đã có dữ liệu
3. Build và chạy worker
4. Kiểm tra log, bảng lỗi, trạng thái validation
