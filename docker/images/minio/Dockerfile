FROM minio/minio:latest

COPY start-minio.sh /usr/local/bin/start-minio.sh

RUN chmod +x /usr/local/bin/start-minio.sh

ENTRYPOINT ["/usr/local/bin/start-minio.sh"]
