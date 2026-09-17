FROM python:3.11-slim

WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir . \
    && adduser --disabled-password --no-create-home --gecos "" appuser

USER appuser

ENTRYPOINT ["camper-monitor"]
