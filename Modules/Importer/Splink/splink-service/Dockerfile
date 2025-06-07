FROM python:3.9-slim

# Cài PostgreSQL client, libpq-dev, build-essential, gcc để build các package phụ thuộc
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        postgresql-client \
        libpq-dev \
        build-essential \
        gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip
RUN pip install --no-cache-dir "splink[postgres]==3.9.7" fastapi uvicorn sqlalchemy==1.4.49 psycopg2-binary==2.9.5
WORKDIR /app
COPY linker_settings.json splink_api.py ./
EXPOSE 8090
CMD ["uvicorn", "splink_api:app", "--host", "0.0.0.0", "--port", "8090"]
