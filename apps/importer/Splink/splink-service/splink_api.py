from fastapi import FastAPI
from pydantic import BaseModel, Field
import pandas as pd, json, os
from sqlalchemy import create_engine
from splink.postgres.api import PostgresAPI
from splink.linker import Linker

app = FastAPI()
settings = json.load(open(os.getenv("SPLINK_SETTINGS_PATH")))
import logging
logging.basicConfig(level=logging.INFO)
db_conn = "postgresql+psycopg2://rate:rate@postgre:5432/rate"
logging.info(f"[DEBUG] DB_CONN: {db_conn}")
engine = create_engine(db_conn)
logging.info(f"[DEBUG] engine: {engine}")
db_api = PostgresAPI(engine=engine)
linker = Linker(None, settings, db_api=db_api)

class Item(BaseModel):
    id: int = Field(..., example=123)
    title: str
    phone: str | None = None
    bank_account: str | None = None
    name: str | None = None

@app.post("/resolve")
def resolve(item: Item):
    df = pd.DataFrame([item.dict()])
    pred = linker.predict(df)
    cid = pred["cluster_id"].iloc[0]
    return {"cluster_id": int(cid) if pd.notna(cid) else None}
