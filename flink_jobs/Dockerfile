FROM flink:1.18.1

# Switch to root for package installation
USER root

# Install Python and pip
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-dev \
        build-essential && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

# Install PyFlink and Python dependencies
COPY requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir -r /tmp/requirements.txt

# Download Kafka connector JAR for Flink
RUN wget -q -P /opt/flink/lib/ \
    https://repo1.maven.org/maven2/org/apache/flink/flink-sql-connector-kafka/3.0.2-1.18/flink-sql-connector-kafka-3.0.2-1.18.jar

# Copy job files
COPY ohlc_aggregator.py /opt/flink/jobs/ohlc_aggregator.py
COPY price_alert.py /opt/flink/jobs/price_alert.py

# Ensure flink user owns the job files
RUN chown -R flink:flink /opt/flink/jobs /opt/flink/lib

# Switch back to flink user
USER flink

# Set PyFlink env vars
ENV PYFLINK_CLIENT_EXECUTABLE=/usr/bin/python3
