FROM prom/alertmanager:v0.32.0

USER root

COPY alertmanager.yml /etc/alertmanager/alertmanager.yml
COPY start-alertmanager.sh /usr/local/bin/start-alertmanager.sh

RUN chmod +x /usr/local/bin/start-alertmanager.sh

ENTRYPOINT ["/usr/local/bin/start-alertmanager.sh"]
