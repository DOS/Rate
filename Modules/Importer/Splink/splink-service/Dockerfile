FROM python:3.10-slim
RUN pip install --upgrade pip
RUN pip install --no-cache-dir splink[postgres] fastapi uvicorn
WORKDIR /app
COPY linker_settings.json splink_api.py ./
EXPOSE 8090
CMD ["uvicorn", "splink_api:app", "--host", "0.0.0.0", "--port", "8090"]
