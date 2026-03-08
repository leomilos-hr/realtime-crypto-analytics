FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY historical_backfill.py .

CMD ["python", "-u", "historical_backfill.py"]
