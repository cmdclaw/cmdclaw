FROM victoriametrics/vmalert:v1.140.0

USER root

COPY rules /etc/vmalert/rules
COPY start-vmalert.sh /usr/local/bin/start-vmalert.sh

RUN chmod +x /usr/local/bin/start-vmalert.sh

ENTRYPOINT ["/usr/local/bin/start-vmalert.sh"]
