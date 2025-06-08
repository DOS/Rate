import psycopg
import random
import uuid
import json
from datetime import datetime, timedelta

DSN = 'postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator'
NUM_RECORDS = 10000  # Chỉnh số lượng nếu muốn
DUPLICATE_RATE = 0.05

def random_phone():
    return f"09{random.randint(10000000, 99999999)}"

def random_bank_account():
    return str(random.randint(1000000000, 9999999999))

def main():
    phones = set()
    bank_accounts = set()
    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            for i in range(NUM_RECORDS):
                # 5% duplicate
                if random.random() < DUPLICATE_RATE and phones:
                    phone = random.choice(list(phones))
                else:
                    phone = random_phone()
                    phones.add(phone)
                if random.random() < DUPLICATE_RATE and bank_accounts:
                    bank_account = random.choice(list(bank_accounts))
                else:
                    bank_account = random_bank_account()
                    bank_accounts.add(bank_account)
                data = {'extra': str(uuid.uuid4())}
                cur.execute(
                    """
                    INSERT INTO raw_items (phone, bank_account, data, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (phone, bank_account, json.dumps(data), datetime.now() - timedelta(minutes=random.randint(0, 600)))
                )
            conn.commit()
    print(f"Done: {NUM_RECORDS} records (5% duplicates)")

if __name__ == "__main__":
    main()
