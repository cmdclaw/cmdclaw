FROM grafana/grafana:12.1.7

USER root

COPY --chown=472:0 provisioning /etc/grafana/provisioning
COPY --chown=472:0 dashboards /var/lib/grafana/dashboards

USER 472
