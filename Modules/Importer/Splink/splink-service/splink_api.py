from fastapi import FastAPI
from pydantic import BaseModel, Field
import pandas as pd, json, os
from splink.postgres.linker import PostgresLinker

app = FastAPI()
settings = json.load(open(os.getenv("SPLINK_SETTINGS_PATH")))
linker = PostgresLinker(os.getenv("DB_CONN"), input_table=None, settings=settings)

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
